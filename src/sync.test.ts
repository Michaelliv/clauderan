import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { parseJsonlContent, extractCommands, sync, type MessageEntry } from "./sync";
import { createDb, listCommands, getIndexedFile } from "./db";
import { mkdirSync, writeFileSync, rmSync, appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Database } from "sql.js";

describe("sync", () => {
  describe("parseJsonlContent", () => {
    it("parses a simple bash command and result", () => {
      const jsonl = `
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"Bash","input":{"command":"ls -la","description":"List files"}}]},"cwd":"/home/user","timestamp":"2024-01-01T00:00:00Z"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_1","content":"file1\\nfile2","is_error":false}]},"toolUseResult":{"stdout":"file1\\nfile2","stderr":""}}
      `.trim();

      const commands = parseJsonlContent(jsonl, "session_123");

      expect(commands).toHaveLength(1);
      expect(commands[0]).toMatchObject({
        tool_use_id: "tool_1",
        command: "ls -la",
        description: "List files",
        cwd: "/home/user",
        stdout: "file1\nfile2",
        is_error: 0,
        session_id: "session_123",
      });
    });

    it("handles multiple commands", () => {
      const jsonl = `
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"Bash","input":{"command":"echo hello","description":"Print hello"}}]},"cwd":"/tmp","timestamp":"2024-01-01T00:00:00Z"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_1","content":"hello","is_error":false}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_2","name":"Bash","input":{"command":"pwd","description":"Print working dir"}}]},"cwd":"/tmp","timestamp":"2024-01-01T00:01:00Z"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_2","content":"/tmp","is_error":false}]}}
      `.trim();

      const commands = parseJsonlContent(jsonl);
      expect(commands).toHaveLength(2);
      expect(commands[0].command).toBe("echo hello");
      expect(commands[1].command).toBe("pwd");
    });

    it("handles error commands", () => {
      const jsonl = `
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"Bash","input":{"command":"exit 1"}}]},"cwd":"/tmp","timestamp":"2024-01-01T00:00:00Z"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_1","content":"","is_error":true}]},"toolUseResult":{"stderr":"error message"}}
      `.trim();

      const commands = parseJsonlContent(jsonl);
      expect(commands).toHaveLength(1);
      expect(commands[0].is_error).toBe(1);
      expect(commands[0].stderr).toBe("error message");
    });

    it("ignores non-Bash tool calls", () => {
      const jsonl = `
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"Read","input":{"file_path":"/tmp/file"}}]},"cwd":"/tmp"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_1","content":"file content"}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_2","name":"Bash","input":{"command":"ls"}}]},"cwd":"/tmp","timestamp":"2024-01-01T00:00:00Z"}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_2","content":"output"}]}}
      `.trim();

      const commands = parseJsonlContent(jsonl);
      expect(commands).toHaveLength(1);
      expect(commands[0].command).toBe("ls");
    });

    it("handles malformed lines gracefully", () => {
      const jsonl = `
not valid json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"Bash","input":{"command":"ls"}}]},"cwd":"/tmp","timestamp":"2024-01-01T00:00:00Z"}
also not valid
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_1","content":"output"}]}}
      `.trim();

      const commands = parseJsonlContent(jsonl);
      expect(commands).toHaveLength(1);
    });

    it("handles empty input", () => {
      const commands = parseJsonlContent("");
      expect(commands).toHaveLength(0);
    });

    it("handles tool_use without matching result", () => {
      const jsonl = `
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"Bash","input":{"command":"ls"}}]},"cwd":"/tmp","timestamp":"2024-01-01T00:00:00Z"}
      `.trim();

      const commands = parseJsonlContent(jsonl);
      expect(commands).toHaveLength(0);
    });

    it("handles tool_result without matching tool_use", () => {
      const jsonl = `
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"unknown_tool","content":"output"}]}}
      `.trim();

      const commands = parseJsonlContent(jsonl);
      expect(commands).toHaveLength(0);
    });
  });

  describe("extractCommands", () => {
    it("extracts command from entries", () => {
      const entries: MessageEntry[] = [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool_1",
                name: "Bash",
                input: { command: "npm test", description: "Run tests" },
              },
            ],
          },
          cwd: "/projects/app",
          timestamp: "2024-01-01T12:00:00Z",
        },
        {
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool_1",
                content: "All tests passed",
                is_error: false,
              },
            ],
          },
          toolUseResult: {
            stdout: "All tests passed",
            stderr: "",
          },
        },
      ];

      const commands = extractCommands(entries, "test_session");

      expect(commands).toHaveLength(1);
      expect(commands[0]).toEqual({
        tool_use_id: "tool_1",
        command: "npm test",
        description: "Run tests",
        cwd: "/projects/app",
        stdout: "All tests passed",
        stderr: "",
        is_error: 0,
        timestamp: "2024-01-01T12:00:00Z",
        session_id: "test_session",
      });
    });

    it("uses toolUseResult.stdout over content when available", () => {
      const entries: MessageEntry[] = [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", id: "t1", name: "Bash", input: { command: "echo hi" } },
            ],
          },
          cwd: "/tmp",
          timestamp: "2024-01-01T00:00:00Z",
        },
        {
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "truncated", is_error: false },
            ],
          },
          toolUseResult: {
            stdout: "full output here",
          },
        },
      ];

      const commands = extractCommands(entries);
      expect(commands[0].stdout).toBe("full output here");
    });

    it("falls back to content when toolUseResult not available", () => {
      const entries: MessageEntry[] = [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", id: "t1", name: "Bash", input: { command: "echo hi" } },
            ],
          },
          cwd: "/tmp",
          timestamp: "2024-01-01T00:00:00Z",
        },
        {
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "fallback content", is_error: false },
            ],
          },
        },
      ];

      const commands = extractCommands(entries);
      expect(commands[0].stdout).toBe("fallback content");
    });

    it("handles commands without description", () => {
      const entries: MessageEntry[] = [
        {
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
            ],
          },
          cwd: "/tmp",
          timestamp: "2024-01-01T00:00:00Z",
        },
        {
          type: "user",
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: "t1", content: "output" },
            ],
          },
        },
      ];

      const commands = extractCommands(entries);
      expect(commands[0].description).toBeNull();
    });
  });

  describe("sync (integration)", () => {
    let tempDir: string;
    let db: Database;

    const createJsonlEntry = (toolId: string, command: string, output: string) => {
      const assistant = JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: toolId, name: "Bash", input: { command, description: `Run ${command}` } },
          ],
        },
        cwd: "/test",
        timestamp: new Date().toISOString(),
      });
      const user = JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolId, content: output, is_error: false }],
        },
        toolUseResult: { stdout: output, stderr: "" },
      });
      return `${assistant}\n${user}\n`;
    };

    beforeEach(async () => {
      tempDir = join(tmpdir(), `deja-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tempDir, { recursive: true });
      db = await createDb(":memory:");
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns error when projects dir does not exist", async () => {
      const result = await sync({ db, projectsDir: "/nonexistent/path" });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not found");
    });

    it("scans jsonl files in project subdirectories", async () => {
      // Create project structure
      const projectDir = join(tempDir, "project-foo");
      mkdirSync(projectDir);
      writeFileSync(
        join(projectDir, "session1.jsonl"),
        createJsonlEntry("t1", "echo hello", "hello")
      );

      const result = await sync({ db, projectsDir: tempDir });

      expect(result.filesScanned).toBe(1);
      expect(result.newCommands).toBe(1);
      expect(result.errors).toHaveLength(0);

      const commands = await listCommands(10, db);
      expect(commands).toHaveLength(1);
      expect(commands[0].command).toBe("echo hello");
    });

    it("indexes multiple files across projects", async () => {
      // Project 1
      const project1 = join(tempDir, "project-one");
      mkdirSync(project1);
      writeFileSync(join(project1, "s1.jsonl"), createJsonlEntry("t1", "npm install", "done"));
      writeFileSync(join(project1, "s2.jsonl"), createJsonlEntry("t2", "npm test", "passed"));

      // Project 2
      const project2 = join(tempDir, "project-two");
      mkdirSync(project2);
      writeFileSync(join(project2, "s3.jsonl"), createJsonlEntry("t3", "docker build", "success"));

      const result = await sync({ db, projectsDir: tempDir });

      expect(result.filesScanned).toBe(3);
      expect(result.newCommands).toBe(3);

      const commands = await listCommands(10, db);
      expect(commands).toHaveLength(3);
    });

    it("skips already indexed files on subsequent sync", async () => {
      const projectDir = join(tempDir, "project");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "session.jsonl"), createJsonlEntry("t1", "first", "output"));

      // First sync
      const result1 = await sync({ db, projectsDir: tempDir });
      expect(result1.newCommands).toBe(1);

      // Second sync - should skip
      const result2 = await sync({ db, projectsDir: tempDir });
      expect(result2.filesScanned).toBe(1);
      expect(result2.newCommands).toBe(0);
    });

    it("indexes only new content in appended files", async () => {
      const projectDir = join(tempDir, "project");
      mkdirSync(projectDir);
      const filePath = join(projectDir, "session.jsonl");

      // Initial content
      writeFileSync(filePath, createJsonlEntry("t1", "first", "output1"));
      await sync({ db, projectsDir: tempDir });

      // Append new content
      appendFileSync(filePath, createJsonlEntry("t2", "second", "output2"));
      const result = await sync({ db, projectsDir: tempDir });

      expect(result.newCommands).toBe(1);

      const commands = await listCommands(10, db);
      expect(commands).toHaveLength(2);
    });

    it("force flag re-indexes all files", async () => {
      const projectDir = join(tempDir, "project");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "session.jsonl"), createJsonlEntry("t1", "cmd", "out"));

      // First sync
      await sync({ db, projectsDir: tempDir });

      // Force sync - re-indexes (but dedupes via tool_use_id)
      const result = await sync({ db, projectsDir: tempDir, force: true });
      expect(result.newCommands).toBe(1); // Parsed again, but INSERT OR IGNORE

      const commands = await listCommands(10, db);
      expect(commands).toHaveLength(1); // Still only 1 due to dedup
    });

    it("tracks indexed file state correctly", async () => {
      const projectDir = join(tempDir, "project");
      mkdirSync(projectDir);
      const filePath = join(projectDir, "session.jsonl");
      writeFileSync(filePath, createJsonlEntry("t1", "test", "output"));

      await sync({ db, projectsDir: tempDir });

      const indexed = await getIndexedFile(filePath, db);
      expect(indexed).not.toBeNull();
      expect(indexed!.last_byte_offset).toBeGreaterThan(0);
    });

    it("ignores non-jsonl files", async () => {
      const projectDir = join(tempDir, "project");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "session.jsonl"), createJsonlEntry("t1", "valid", "out"));
      writeFileSync(join(projectDir, "notes.txt"), "some notes");
      writeFileSync(join(projectDir, "data.json"), "{}");

      const result = await sync({ db, projectsDir: tempDir });

      expect(result.filesScanned).toBe(1);
      expect(result.newCommands).toBe(1);
    });

    it("ignores files in root projects dir (only scans subdirs)", async () => {
      writeFileSync(join(tempDir, "root.jsonl"), createJsonlEntry("t1", "root", "out"));

      const result = await sync({ db, projectsDir: tempDir });

      expect(result.filesScanned).toBe(0);
      expect(result.newCommands).toBe(0);
    });

    it("extracts session_id from filename", async () => {
      const projectDir = join(tempDir, "project");
      mkdirSync(projectDir);
      writeFileSync(join(projectDir, "abc-123-session.jsonl"), createJsonlEntry("t1", "cmd", "out"));

      await sync({ db, projectsDir: tempDir });

      const commands = await listCommands(10, db);
      expect(commands[0].session_id).toBe("abc-123-session");
    });
  });
});
