import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { search } from "./search";
import { list } from "./list";
import { syncCommand } from "./syncCmd";
import { createDb, insertCommand, setDb } from "../db";
import type { Database } from "bun:sqlite";

describe("command modules", () => {
  let db: Database;
  let consoleLogs: string[];
  let consoleErrorLogs: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    db = createDb(":memory:");
    setDb(db);

    // Capture console output
    consoleLogs = [];
    consoleErrorLogs = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(" "));
    console.error = (...args: unknown[]) => consoleErrorLogs.push(args.join(" "));

    // Seed test data
    insertCommand({
      tool_use_id: "t1",
      command: "docker build -t app .",
      description: "Build docker image",
      cwd: "/projects/app",
      stdout: "Successfully built",
      stderr: null,
      is_error: 0,
      timestamp: "2024-01-01T10:00:00Z",
      session_id: "s1",
    }, db);

    insertCommand({
      tool_use_id: "t2",
      command: "npm test",
      description: "Run tests",
      cwd: "/projects/app",
      stdout: "All tests passed",
      stderr: null,
      is_error: 0,
      timestamp: "2024-01-02T10:00:00Z",
      session_id: "s1",
    }, db);

    insertCommand({
      tool_use_id: "t3",
      command: "docker push app",
      description: "Push image",
      cwd: "/projects/other",
      stdout: null,
      stderr: "push failed",
      is_error: 1,
      timestamp: "2024-01-03T10:00:00Z",
      session_id: "s2",
    }, db);
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  describe("search", () => {
    it("finds commands by substring", () => {
      search("docker", { noSync: true });

      expect(consoleLogs.some(l => l.includes("Found 2 command(s)"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("docker build"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("docker push"))).toBe(true);
    });

    it("filters by regex", () => {
      search("docker (build|push)", { regex: true, noSync: true });

      expect(consoleLogs.some(l => l.includes("Found 2 command(s)"))).toBe(true);
    });

    it("filters by cwd", () => {
      search("docker", { cwd: "/projects/app", noSync: true });

      expect(consoleLogs.some(l => l.includes("Found 1 command(s)"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("docker build"))).toBe(true);
    });

    it("respects limit", () => {
      search("docker", { limit: 1, noSync: true });

      expect(consoleLogs.some(l => l.includes("(showing 1)"))).toBe(true);
    });

    it("shows message when no matches", () => {
      search("nonexistent", { noSync: true });

      expect(consoleLogs.some(l => l.includes("No commands found matching:"))).toBe(true);
    });
  });

  describe("list", () => {
    it("lists recent commands", () => {
      list({ noSync: true });

      expect(consoleLogs.some(l => l.includes("Last 3 command(s)"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("docker push"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("npm test"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("docker build"))).toBe(true);
    });

    it("respects limit", () => {
      list({ limit: 2, noSync: true });

      expect(consoleLogs.some(l => l.includes("Last 2 command(s)"))).toBe(true);
    });

    it("shows message when no commands", () => {
      // Clear db
      const emptyDb = createDb(":memory:");
      setDb(emptyDb);

      list({ noSync: true });

      expect(consoleLogs.some(l => l.includes("No commands in history"))).toBe(true);
    });
  });

  describe("syncCommand", () => {
    it("displays sync results", () => {
      // This will try to sync from real claude dir, so just check output format
      syncCommand({ force: false });

      expect(consoleLogs.some(l => l.includes("Syncing new commands..."))).toBe(true);
      expect(consoleLogs.some(l => l.includes("Scanned"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("Indexed"))).toBe(true);
      expect(consoleLogs.some(l => l.includes("Total:"))).toBe(true);
    });

    it("shows force message when force is true", () => {
      syncCommand({ force: true });

      expect(consoleLogs.some(l => l.includes("Force re-indexing"))).toBe(true);
    });
  });
});
