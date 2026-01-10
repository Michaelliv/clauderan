import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { formatCommand } from "./format";
import type { Command } from "./db";

describe("formatCommand", () => {
  let consoleLogs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    consoleLogs = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => consoleLogs.push(args.join(" "));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it("formats successful command", () => {
    const cmd: Command = {
      id: 1,
      tool_use_id: "t1",
      command: "ls -la",
      description: "List files",
      cwd: "/home/user",
      stdout: "output",
      stderr: null,
      is_error: 0,
      timestamp: "2024-01-15T10:30:00Z",
      session_id: "s1",
    };

    formatCommand(cmd);

    expect(consoleLogs.some(l => l.includes("[ok]"))).toBe(true);
    expect(consoleLogs.some(l => l.includes("ls -la"))).toBe(true);
    expect(consoleLogs.some(l => l.includes("List files"))).toBe(true);
    expect(consoleLogs.some(l => l.includes("/home/user"))).toBe(true);
  });

  it("formats error command", () => {
    const cmd: Command = {
      id: 1,
      tool_use_id: "t1",
      command: "exit 1",
      description: null,
      cwd: "/tmp",
      stdout: null,
      stderr: "error",
      is_error: 1,
      timestamp: "2024-01-15T10:30:00Z",
      session_id: "s1",
    };

    formatCommand(cmd);

    expect(consoleLogs.some(l => l.includes("[error]"))).toBe(true);
    expect(consoleLogs.some(l => l.includes("exit 1"))).toBe(true);
  });

  it("handles null description", () => {
    const cmd: Command = {
      id: 1,
      tool_use_id: "t1",
      command: "pwd",
      description: null,
      cwd: "/tmp",
      stdout: "/tmp",
      stderr: null,
      is_error: 0,
      timestamp: "2024-01-15T10:30:00Z",
      session_id: "s1",
    };

    formatCommand(cmd);

    // Should only have 3 log lines (status+cmd, timestamp)
    // No description line
    expect(consoleLogs.length).toBe(3);
  });

  it("handles null timestamp", () => {
    const cmd: Command = {
      id: 1,
      tool_use_id: "t1",
      command: "pwd",
      description: null,
      cwd: "/tmp",
      stdout: null,
      stderr: null,
      is_error: 0,
      timestamp: null,
      session_id: "s1",
    };

    formatCommand(cmd);

    expect(consoleLogs.some(l => l.includes("unknown"))).toBe(true);
  });

  it("handles null cwd", () => {
    const cmd: Command = {
      id: 1,
      tool_use_id: "t1",
      command: "pwd",
      description: null,
      cwd: null,
      stdout: null,
      stderr: null,
      is_error: 0,
      timestamp: "2024-01-15T10:30:00Z",
      session_id: "s1",
    };

    formatCommand(cmd);

    expect(consoleLogs.some(l => l.includes("unknown dir"))).toBe(true);
  });
});
