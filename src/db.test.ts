import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createDb,
  insertCommand,
  searchCommands,
  listCommands,
  getStats,
  updateIndexedFile,
  getIndexedFile,
  type Command,
} from "./db";

describe("db", () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(":memory:");
  });

  describe("insertCommand", () => {
    it("inserts a command", () => {
      insertCommand(
        {
          tool_use_id: "tool_1",
          command: "ls -la",
          description: "List files",
          cwd: "/home/user",
          stdout: "file1\nfile2",
          stderr: null,
          is_error: 0,
          timestamp: "2024-01-01T00:00:00Z",
          session_id: "session_1",
        },
        db
      );

      const results = listCommands(10, db);
      expect(results).toHaveLength(1);
      expect(results[0].command).toBe("ls -la");
      expect(results[0].description).toBe("List files");
    });

    it("ignores duplicate tool_use_id", () => {
      const cmd = {
        tool_use_id: "tool_1",
        command: "ls -la",
        description: "List files",
        cwd: "/home/user",
        stdout: null,
        stderr: null,
        is_error: 0,
        timestamp: "2024-01-01T00:00:00Z",
        session_id: "session_1",
      };

      insertCommand(cmd, db);
      insertCommand({ ...cmd, command: "different command" }, db);

      const results = listCommands(10, db);
      expect(results).toHaveLength(1);
      expect(results[0].command).toBe("ls -la");
    });
  });

  describe("searchCommands", () => {
    beforeEach(() => {
      insertCommand(
        {
          tool_use_id: "tool_1",
          command: "docker build -t myapp .",
          description: "Build docker image",
          cwd: "/projects/myapp",
          stdout: null,
          stderr: null,
          is_error: 0,
          timestamp: "2024-01-01T00:00:00Z",
          session_id: "session_1",
        },
        db
      );
      insertCommand(
        {
          tool_use_id: "tool_2",
          command: "npm test",
          description: "Run tests",
          cwd: "/projects/myapp",
          stdout: null,
          stderr: null,
          is_error: 0,
          timestamp: "2024-01-02T00:00:00Z",
          session_id: "session_1",
        },
        db
      );
      insertCommand(
        {
          tool_use_id: "tool_3",
          command: "docker push myapp",
          description: "Push to registry",
          cwd: "/projects/other",
          stdout: null,
          stderr: null,
          is_error: 0,
          timestamp: "2024-01-03T00:00:00Z",
          session_id: "session_1",
        },
        db
      );
    });

    it("searches by substring", () => {
      const results = searchCommands("docker", false, undefined, db);
      expect(results).toHaveLength(2);
    });

    it("searches case-insensitively", () => {
      const results = searchCommands("DOCKER", false, undefined, db);
      expect(results).toHaveLength(2);
    });

    it("filters by cwd", () => {
      const results = searchCommands("docker", false, "/projects/myapp", db);
      expect(results).toHaveLength(1);
      expect(results[0].command).toBe("docker build -t myapp .");
    });

    it("searches with regex", () => {
      const results = searchCommands("docker (build|push)", true, undefined, db);
      expect(results).toHaveLength(2);
    });

    it("regex with cwd filter", () => {
      const results = searchCommands("docker.*", true, "/projects/other", db);
      expect(results).toHaveLength(1);
      expect(results[0].command).toBe("docker push myapp");
    });

    it("returns empty for no matches", () => {
      const results = searchCommands("nonexistent", false, undefined, db);
      expect(results).toHaveLength(0);
    });
  });

  describe("listCommands", () => {
    it("returns commands ordered by timestamp desc", () => {
      insertCommand(
        {
          tool_use_id: "tool_1",
          command: "first",
          description: null,
          cwd: null,
          stdout: null,
          stderr: null,
          is_error: 0,
          timestamp: "2024-01-01T00:00:00Z",
          session_id: "s1",
        },
        db
      );
      insertCommand(
        {
          tool_use_id: "tool_2",
          command: "second",
          description: null,
          cwd: null,
          stdout: null,
          stderr: null,
          is_error: 0,
          timestamp: "2024-01-02T00:00:00Z",
          session_id: "s1",
        },
        db
      );

      const results = listCommands(10, db);
      expect(results[0].command).toBe("second");
      expect(results[1].command).toBe("first");
    });

    it("respects limit", () => {
      for (let i = 0; i < 10; i++) {
        insertCommand(
          {
            tool_use_id: `tool_${i}`,
            command: `cmd_${i}`,
            description: null,
            cwd: null,
            stdout: null,
            stderr: null,
            is_error: 0,
            timestamp: `2024-01-0${i + 1}T00:00:00Z`,
            session_id: "s1",
          },
          db
        );
      }

      const results = listCommands(5, db);
      expect(results).toHaveLength(5);
    });
  });

  describe("indexedFiles", () => {
    it("tracks indexed file state", () => {
      updateIndexedFile("/path/to/file.jsonl", 1000, 123456789, db);

      const indexed = getIndexedFile("/path/to/file.jsonl", db);
      expect(indexed).not.toBeNull();
      expect(indexed!.last_byte_offset).toBe(1000);
      expect(indexed!.last_modified).toBe(123456789);
    });

    it("updates existing file state", () => {
      updateIndexedFile("/path/to/file.jsonl", 1000, 100, db);
      updateIndexedFile("/path/to/file.jsonl", 2000, 200, db);

      const indexed = getIndexedFile("/path/to/file.jsonl", db);
      expect(indexed!.last_byte_offset).toBe(2000);
      expect(indexed!.last_modified).toBe(200);
    });

    it("returns null for unknown file", () => {
      const indexed = getIndexedFile("/nonexistent", db);
      expect(indexed).toBeNull();
    });
  });

  describe("getStats", () => {
    it("returns correct counts", () => {
      insertCommand(
        {
          tool_use_id: "t1",
          command: "cmd1",
          description: null,
          cwd: null,
          stdout: null,
          stderr: null,
          is_error: 0,
          timestamp: null,
          session_id: null,
        },
        db
      );
      insertCommand(
        {
          tool_use_id: "t2",
          command: "cmd2",
          description: null,
          cwd: null,
          stdout: null,
          stderr: null,
          is_error: 0,
          timestamp: null,
          session_id: null,
        },
        db
      );
      updateIndexedFile("/file1.jsonl", 100, 100, db);

      const stats = getStats(db);
      expect(stats.totalCommands).toBe(2);
      expect(stats.indexedFiles).toBe(1);
    });
  });
});
