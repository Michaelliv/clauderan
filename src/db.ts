import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

export interface Command {
  id: number;
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

export interface IndexedFile {
  file_path: string;
  last_byte_offset: number;
  last_modified: number;
}

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY,
      tool_use_id TEXT UNIQUE,
      command TEXT NOT NULL,
      description TEXT,
      cwd TEXT,
      stdout TEXT,
      stderr TEXT,
      is_error INTEGER DEFAULT 0,
      timestamp TEXT,
      session_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS indexed_files (
      file_path TEXT PRIMARY KEY,
      last_byte_offset INTEGER DEFAULT 0,
      last_modified INTEGER DEFAULT 0
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_commands_command ON commands(command)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON commands(timestamp)`);
}

export function createDb(dbPath?: string): Database {
  if (dbPath === ":memory:") {
    const db = new Database(":memory:");
    initSchema(db);
    return db;
  }

  const DATA_DIR = join(homedir(), ".ran");
  const DB_PATH = dbPath ?? join(DATA_DIR, "history.db");

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  initSchema(db);
  return db;
}

// Default instance for production use
let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// For testing: allows replacing the db instance
export function setDb(db: Database): void {
  _db = db;
}

export function insertCommand(cmd: Omit<Command, "id">, db = getDb()): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO commands
    (tool_use_id, command, description, cwd, stdout, stderr, is_error, timestamp, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    cmd.tool_use_id,
    cmd.command,
    cmd.description,
    cmd.cwd,
    cmd.stdout,
    cmd.stderr,
    cmd.is_error,
    cmd.timestamp,
    cmd.session_id
  );
}

export function updateIndexedFile(filePath: string, byteOffset: number, mtime: number, db = getDb()): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO indexed_files (file_path, last_byte_offset, last_modified)
    VALUES (?, ?, ?)
  `);
  stmt.run(filePath, byteOffset, mtime);
}

export function getIndexedFile(filePath: string, db = getDb()): IndexedFile | null {
  const stmt = db.prepare(`SELECT * FROM indexed_files WHERE file_path = ?`);
  return stmt.get(filePath) as IndexedFile | null;
}

export function searchCommands(pattern: string, useRegex: boolean, cwd?: string, db = getDb()): Command[] {
  if (useRegex) {
    const query = `SELECT * FROM commands ORDER BY timestamp DESC`;
    const results = db.prepare(query).all() as Command[];
    const regex = new RegExp(pattern, "i");
    return results.filter((r) => {
      if (!regex.test(r.command)) return false;
      if (cwd && r.cwd !== cwd) return false;
      return true;
    });
  }

  if (cwd) {
    const stmt = db.prepare(`
      SELECT * FROM commands
      WHERE command LIKE ? AND cwd = ?
      ORDER BY timestamp DESC
    `);
    return stmt.all(`%${pattern}%`, cwd) as Command[];
  }

  const stmt = db.prepare(`
    SELECT * FROM commands
    WHERE command LIKE ?
    ORDER BY timestamp DESC
  `);
  return stmt.all(`%${pattern}%`) as Command[];
}

export function listCommands(limit: number = 20, db = getDb()): Command[] {
  const stmt = db.prepare(`
    SELECT * FROM commands
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Command[];
}

export function getStats(db = getDb()): { totalCommands: number; indexedFiles: number } {
  const commands = db.prepare(`SELECT COUNT(*) as count FROM commands`).get() as { count: number };
  const files = db.prepare(`SELECT COUNT(*) as count FROM indexed_files`).get() as { count: number };
  return {
    totalCommands: commands.count,
    indexedFiles: files.count,
  };
}
