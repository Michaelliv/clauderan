import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { statSync, readFileSync, readdirSync, existsSync } from "fs";
import { getIndexedFile, updateIndexedFile, insertCommand, getDb } from "./db";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface ToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: {
    command?: string;
    description?: string;
  };
}

export interface ToolResult {
  tool_use_id: string;
  type: "tool_result";
  content: string;
  is_error?: boolean;
}

export interface MessageEntry {
  type: "user" | "assistant";
  message: {
    role: string;
    content: string | Array<ToolUse | ToolResult | { type: string }>;
  };
  cwd?: string;
  sessionId?: string;
  timestamp?: string;
  toolUseResult?: {
    stdout?: string;
    stderr?: string;
    interrupted?: boolean;
  };
}

export interface ParsedCommand {
  tool_use_id: string;
  command: string;
  description: string | null;
  cwd: string | null;
  stdout: string | null;
  stderr: string | null;
  is_error: number;
  timestamp: string | null;
  session_id: string | null;
}

export interface SyncResult {
  filesScanned: number;
  newCommands: number;
  errors: string[];
}

/**
 * Parse JSONL content and extract Bash commands with their results.
 * Exported for testing.
 */
export function parseJsonlContent(content: string, sessionId: string | null = null): ParsedCommand[] {
  const lines = content.split("\n");
  const entries: MessageEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }

  return extractCommands(entries, sessionId);
}

/**
 * Extract commands from parsed message entries.
 * Exported for testing.
 */
export function extractCommands(entries: MessageEntry[], sessionId: string | null = null): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  const pendingToolUses = new Map<string, { toolUse: ToolUse; cwd?: string; timestamp?: string }>();

  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message.content)) {
      for (const item of entry.message.content) {
        if (item.type === "tool_use" && (item as ToolUse).name === "Bash") {
          const toolUse = item as ToolUse;
          if (toolUse.input?.command) {
            pendingToolUses.set(toolUse.id, {
              toolUse,
              cwd: entry.cwd,
              timestamp: entry.timestamp,
            });
          }
        }
      }
    }

    if (entry.type === "user" && Array.isArray(entry.message.content)) {
      for (const item of entry.message.content) {
        if (item.type === "tool_result") {
          const toolResult = item as ToolResult;
          const pending = pendingToolUses.get(toolResult.tool_use_id);

          if (pending) {
            commands.push({
              tool_use_id: toolResult.tool_use_id,
              command: pending.toolUse.input.command!,
              description: pending.toolUse.input.description ?? null,
              cwd: pending.cwd ?? null,
              stdout: entry.toolUseResult?.stdout ?? toolResult.content ?? null,
              stderr: entry.toolUseResult?.stderr ?? null,
              is_error: toolResult.is_error ? 1 : 0,
              timestamp: pending.timestamp ?? null,
              session_id: sessionId,
            });
            pendingToolUses.delete(toolResult.tool_use_id);
          }
        }
      }
    }
  }

  return commands;
}

export interface SyncOptions {
  force?: boolean;
  db?: Database;
  projectsDir?: string;
}

export function sync(options: SyncOptions = {}): SyncResult {
  const { force = false, db, projectsDir = CLAUDE_PROJECTS_DIR } = options;
  const database = db ?? getDb();

  const result: SyncResult = {
    filesScanned: 0,
    newCommands: 0,
    errors: [],
  };

  if (!existsSync(projectsDir)) {
    result.errors.push(`Claude projects directory not found: ${projectsDir}`);
    return result;
  }

  // Find all .jsonl files
  const jsonlFiles: string[] = [];
  const projectDirs = readdirSync(projectsDir);

  for (const dir of projectDirs) {
    const projectPath = join(projectsDir, dir);
    try {
      const stat = statSync(projectPath);
      if (stat.isDirectory()) {
        const files = readdirSync(projectPath);
        for (const file of files) {
          if (file.endsWith(".jsonl")) {
            jsonlFiles.push(join(projectPath, file));
          }
        }
      }
    } catch (e) {
      // Skip files we can't read
    }
  }

  for (const filePath of jsonlFiles) {
    result.filesScanned++;

    try {
      const stat = statSync(filePath);
      const indexed = getIndexedFile(filePath, database);

      // Skip if already fully indexed (unless force)
      if (!force && indexed && indexed.last_byte_offset >= stat.size) {
        continue;
      }

      const startOffset = force ? 0 : (indexed?.last_byte_offset ?? 0);
      const newCommands = indexFile(filePath, startOffset, database);
      result.newCommands += newCommands;

      updateIndexedFile(filePath, stat.size, stat.mtimeMs, database);
    } catch (e) {
      result.errors.push(`Error processing ${filePath}: ${e}`);
    }
  }

  return result;
}

function indexFile(filePath: string, startOffset: number, db: Database): number {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Track byte position to find where startOffset lands
  let bytePos = 0;
  let startLine = 0;

  if (startOffset > 0) {
    for (let i = 0; i < lines.length; i++) {
      const lineBytes = Buffer.byteLength(lines[i], "utf-8") + 1; // +1 for newline
      if (bytePos + lineBytes > startOffset) {
        startLine = i;
        break;
      }
      bytePos += lineBytes;
    }
  }

  // Parse only new content
  const newContent = lines.slice(startLine).join("\n");
  const sessionId = filePath.split("/").pop()?.replace(".jsonl", "") ?? null;
  const commands = parseJsonlContent(newContent, sessionId);

  for (const cmd of commands) {
    insertCommand(cmd, db);
  }

  return commands.length;
}
