import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { calculateFrecencyScore } from "./frecency";

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

export interface CommandWithFrecency extends Command {
  frequency: number;
  frecency_score: number;
}

export interface IndexedFile {
  file_path: string;
  last_byte_offset: number;
  last_modified: number;
}

const DATA_DIR = join(homedir(), ".cc-dejavu");
const DB_PATH = join(DATA_DIR, "history.db");

let _db: Database | null = null;

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

  // Clean up legacy FTS5 artifacts (migration from v0.3.x)
  cleanupFts5(db);
}

function cleanupFts5(db: Database): void {
  // Drop FTS5 triggers if they exist
  db.run(`DROP TRIGGER IF EXISTS commands_ai`);
  db.run(`DROP TRIGGER IF EXISTS commands_ad`);
  db.run(`DROP TRIGGER IF EXISTS commands_au`);

  // Drop FTS5 virtual table if it exists
  try {
    db.run(`DROP TABLE IF EXISTS commands_fts`);
  } catch {
    // Ignore errors - table might not exist or FTS5 module not available
  }
}

export function createDb(dbPath?: string): Database {
  if (dbPath === ":memory:") {
    const db = new Database(":memory:");
    initSchema(db);
    return db;
  }

  const path = dbPath ?? DB_PATH;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(path);
  initSchema(db);
  return db;
}

export function getDb(): Database {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export function setDb(db: Database): void {
  _db = db;
}

export function insertCommand(cmd: Omit<Command, "id">, db?: Database): void {
  const database = db ?? getDb();
  database.run(
    `INSERT OR IGNORE INTO commands
    (tool_use_id, command, description, cwd, stdout, stderr, is_error, timestamp, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cmd.tool_use_id,
      cmd.command,
      cmd.description,
      cmd.cwd,
      cmd.stdout,
      cmd.stderr,
      cmd.is_error,
      cmd.timestamp,
      cmd.session_id,
    ]
  );
}

export function updateIndexedFile(filePath: string, byteOffset: number, mtime: number, db?: Database): void {
  const database = db ?? getDb();
  database.run(
    `INSERT OR REPLACE INTO indexed_files (file_path, last_byte_offset, last_modified)
    VALUES (?, ?, ?)`,
    [filePath, byteOffset, mtime]
  );
}

export function getIndexedFile(filePath: string, db?: Database): IndexedFile | null {
  const database = db ?? getDb();
  const result = database.query(`SELECT * FROM indexed_files WHERE file_path = ?`).get(filePath) as IndexedFile | null;
  return result;
}

export function searchCommands(pattern: string, useRegex: boolean, cwd?: string, db?: Database): Command[] {
  const database = db ?? getDb();

  if (useRegex) {
    const allCommands = database.query(`SELECT * FROM commands ORDER BY timestamp DESC`).all() as Command[];
    const regex = new RegExp(pattern, "i");
    return allCommands.filter((cmd) => regex.test(cmd.command) && (!cwd || cmd.cwd === cwd));
  }

  if (cwd) {
    return database
      .query(`SELECT * FROM commands WHERE command LIKE ? AND cwd = ? ORDER BY timestamp DESC`)
      .all(`%${pattern}%`, cwd) as Command[];
  }

  return database
    .query(`SELECT * FROM commands WHERE command LIKE ? ORDER BY timestamp DESC`)
    .all(`%${pattern}%`) as Command[];
}

export function searchCommandsWithFrecency(
  pattern: string,
  useRegex: boolean,
  cwd?: string,
  db?: Database
): CommandWithFrecency[] {
  const database = db ?? getDb();

  if (useRegex) {
    return searchCommandsWithFrecencyRegex(database, pattern, cwd);
  }

  // Use LIKE for substring search, sorted by frecency
  return searchCommandsWithFrecencyLike(database, pattern, cwd);
}

function searchCommandsWithFrecencyRegex(database: Database, pattern: string, cwd?: string): CommandWithFrecency[] {
  const sql = `
    SELECT
      command,
      COUNT(*) as frequency,
      MAX(timestamp) as most_recent,
      (SELECT id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as id,
      (SELECT tool_use_id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as tool_use_id,
      (SELECT description FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as description,
      (SELECT cwd FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as cwd,
      (SELECT stdout FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as stdout,
      (SELECT stderr FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as stderr,
      (SELECT is_error FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as is_error,
      (SELECT session_id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as session_id
    FROM commands c1
    ${cwd ? "WHERE cwd = ?" : ""}
    GROUP BY command
  `;

  const rows = (cwd ? database.query(sql).all(cwd) : database.query(sql).all()) as Array<{
    command: string;
    frequency: number;
    most_recent: string | null;
    id: number;
    tool_use_id: string;
    description: string | null;
    cwd: string | null;
    stdout: string | null;
    stderr: string | null;
    is_error: number;
    session_id: string | null;
  }>;

  const regex = new RegExp(pattern, "i");
  const results: CommandWithFrecency[] = [];

  for (const row of rows) {
    if (regex.test(row.command)) {
      const frecencyScore = calculateFrecencyScore(row.frequency, row.most_recent);
      results.push({
        id: row.id,
        tool_use_id: row.tool_use_id,
        command: row.command,
        description: row.description,
        cwd: row.cwd,
        stdout: row.stdout,
        stderr: row.stderr,
        is_error: row.is_error,
        timestamp: row.most_recent,
        session_id: row.session_id,
        frequency: row.frequency,
        frecency_score: frecencyScore,
      });
    }
  }

  results.sort((a, b) => b.frecency_score - a.frecency_score);
  return results;
}

function searchCommandsWithFrecencyLike(database: Database, pattern: string, cwd?: string): CommandWithFrecency[] {
  const sql = `
    SELECT
      command,
      COUNT(*) as frequency,
      MAX(timestamp) as most_recent,
      (SELECT id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as id,
      (SELECT tool_use_id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as tool_use_id,
      (SELECT description FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as description,
      (SELECT cwd FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as cwd,
      (SELECT stdout FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as stdout,
      (SELECT stderr FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as stderr,
      (SELECT is_error FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as is_error,
      (SELECT session_id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as session_id
    FROM commands c1
    WHERE command LIKE ?
    ${cwd ? "AND cwd = ?" : ""}
    GROUP BY command
  `;

  const likePattern = `%${pattern}%`;
  const rows = (cwd ? database.query(sql).all(likePattern, cwd) : database.query(sql).all(likePattern)) as Array<{
    command: string;
    frequency: number;
    most_recent: string | null;
    id: number;
    tool_use_id: string;
    description: string | null;
    cwd: string | null;
    stdout: string | null;
    stderr: string | null;
    is_error: number;
    session_id: string | null;
  }>;

  const results: CommandWithFrecency[] = rows.map((row) => {
    const frecencyScore = calculateFrecencyScore(row.frequency, row.most_recent);
    return {
      id: row.id,
      tool_use_id: row.tool_use_id,
      command: row.command,
      description: row.description,
      cwd: row.cwd,
      stdout: row.stdout,
      stderr: row.stderr,
      is_error: row.is_error,
      timestamp: row.most_recent,
      session_id: row.session_id,
      frequency: row.frequency,
      frecency_score: frecencyScore,
    };
  });

  results.sort((a, b) => b.frecency_score - a.frecency_score);
  return results;
}

export function listCommands(limit: number = 20, dbOrCwd?: Database | string, db?: Database): Command[] {
  let database: Database;
  let cwd: string | undefined;

  if (typeof dbOrCwd === "string") {
    cwd = dbOrCwd;
    database = db ?? getDb();
  } else {
    database = dbOrCwd ?? db ?? getDb();
  }

  if (cwd) {
    return database
      .query(`SELECT * FROM commands WHERE cwd = ? ORDER BY timestamp DESC LIMIT ?`)
      .all(cwd, limit) as Command[];
  }

  return database.query(`SELECT * FROM commands ORDER BY timestamp DESC LIMIT ?`).all(limit) as Command[];
}

export function listCommandsWithFrecency(limit: number = 20, cwd?: string, db?: Database): CommandWithFrecency[] {
  const database = db ?? getDb();

  const sql = `
    SELECT
      command,
      COUNT(*) as frequency,
      MAX(timestamp) as most_recent,
      (SELECT id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as id,
      (SELECT tool_use_id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as tool_use_id,
      (SELECT description FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as description,
      (SELECT cwd FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as cwd,
      (SELECT stdout FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as stdout,
      (SELECT stderr FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as stderr,
      (SELECT is_error FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as is_error,
      (SELECT session_id FROM commands c2 WHERE c2.command = c1.command ORDER BY timestamp DESC LIMIT 1) as session_id
    FROM commands c1
    ${cwd ? "WHERE cwd = ?" : ""}
    GROUP BY command
  `;

  const rows = (cwd ? database.query(sql).all(cwd) : database.query(sql).all()) as Array<{
    command: string;
    frequency: number;
    most_recent: string | null;
    id: number;
    tool_use_id: string;
    description: string | null;
    cwd: string | null;
    stdout: string | null;
    stderr: string | null;
    is_error: number;
    session_id: string | null;
  }>;

  const results: CommandWithFrecency[] = rows.map((row) => {
    const frecencyScore = calculateFrecencyScore(row.frequency, row.most_recent);
    return {
      id: row.id,
      tool_use_id: row.tool_use_id,
      command: row.command,
      description: row.description,
      cwd: row.cwd,
      stdout: row.stdout,
      stderr: row.stderr,
      is_error: row.is_error,
      timestamp: row.most_recent,
      session_id: row.session_id,
      frequency: row.frequency,
      frecency_score: frecencyScore,
    };
  });

  results.sort((a, b) => b.frecency_score - a.frecency_score);
  return results.slice(0, limit);
}

export function getStats(db?: Database): { totalCommands: number; indexedFiles: number } {
  const database = db ?? getDb();

  const commands = database.query(`SELECT COUNT(*) as count FROM commands`).get() as { count: number };
  const files = database.query(`SELECT COUNT(*) as count FROM indexed_files`).get() as { count: number };

  return {
    totalCommands: commands.count,
    indexedFiles: files.count,
  };
}

