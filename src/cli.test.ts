import { describe, it, expect } from "bun:test";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  describe("positional arguments", () => {
    it("captures positional arguments", () => {
      const { positional } = parseArgs(["docker", "build"]);
      expect(positional).toEqual(["docker", "build"]);
    });

    it("handles empty args", () => {
      const { positional, flags } = parseArgs([]);
      expect(positional).toEqual([]);
      expect(flags).toEqual({});
    });
  });

  describe("--regex / -r", () => {
    it("parses --regex flag", () => {
      const { flags } = parseArgs(["pattern", "--regex"]);
      expect(flags.regex).toBe(true);
    });

    it("parses -r shorthand", () => {
      const { flags } = parseArgs(["pattern", "-r"]);
      expect(flags.regex).toBe(true);
    });
  });

  describe("--force / -f", () => {
    it("parses --force flag", () => {
      const { flags } = parseArgs(["--force"]);
      expect(flags.force).toBe(true);
    });

    it("parses -f shorthand", () => {
      const { flags } = parseArgs(["-f"]);
      expect(flags.force).toBe(true);
    });
  });

  describe("--no-sync", () => {
    it("parses --no-sync flag", () => {
      const { flags } = parseArgs(["pattern", "--no-sync"]);
      expect(flags.noSync).toBe(true);
    });
  });

  describe("--cwd", () => {
    it("parses --cwd with value", () => {
      const { flags } = parseArgs(["--cwd", "/projects/app"]);
      expect(flags.cwd).toBe("/projects/app");
    });

    it("ignores --cwd without value", () => {
      const { flags } = parseArgs(["--cwd"]);
      expect(flags.cwd).toBeUndefined();
    });
  });

  describe("--limit / -n", () => {
    it("parses --limit with value", () => {
      const { flags } = parseArgs(["--limit", "50"]);
      expect(flags.limit).toBe("50");
    });

    it("parses -n shorthand", () => {
      const { flags } = parseArgs(["-n", "10"]);
      expect(flags.limit).toBe("10");
    });

    it("ignores --limit without value", () => {
      const { flags } = parseArgs(["--limit"]);
      expect(flags.limit).toBeUndefined();
    });
  });

  describe("mixed arguments", () => {
    it("handles complex argument mix", () => {
      const { flags, positional } = parseArgs([
        "docker.*build",
        "--regex",
        "--cwd",
        "/projects/app",
        "-n",
        "20",
        "--no-sync",
      ]);

      expect(positional).toEqual(["docker.*build"]);
      expect(flags.regex).toBe(true);
      expect(flags.cwd).toBe("/projects/app");
      expect(flags.limit).toBe("20");
      expect(flags.noSync).toBe(true);
    });

    it("preserves positional order", () => {
      const { positional } = parseArgs(["first", "--regex", "second", "-n", "10", "third"]);
      expect(positional).toEqual(["first", "second", "third"]);
    });
  });
});
