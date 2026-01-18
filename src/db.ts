import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { createRequire } from "module";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { calculateFrecencyScore } from "./frecency";

const require = createRequire(import.meta.url);

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

let _db: SqlJsDatabase | null = null;
let _dbPath: string | null = null;

function initSchema(db: SqlJsDatabase): void {
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

export async function createDb(dbPath?: string): Promise<SqlJsDatabase> {
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  if (dbPath === ":memory:") {
    const db = new SQL.Database();
    initSchema(db);
    return db;
  }

  const path = dbPath ?? DB_PATH;

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  let db: SqlJsDatabase;
  if (existsSync(path)) {
    const buffer = readFileSync(path);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  initSchema(db);
  return db;
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (!_db) {
    _db = await createDb();
    _dbPath = DB_PATH;
  }
  return _db;
}

export function setDb(db: SqlJsDatabase, path?: string): void {
  _db = db;
  _dbPath = path ?? null;
}

export function saveDb(db: SqlJsDatabase, path?: string): void {
  const savePath = path ?? _dbPath ?? DB_PATH;
  const dir = savePath.substring(0, savePath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(savePath, buffer);
}

export async function insertCommand(cmd: Omit<Command, "id">, db?: SqlJsDatabase): Promise<void> {
  const database = db ?? await getDb();
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
  if (!db) saveDb(database);
}

export async function updateIndexedFile(filePath: string, byteOffset: number, mtime: number, db?: SqlJsDatabase): Promise<void> {
  const database = db ?? await getDb();
  database.run(
    `INSERT OR REPLACE INTO indexed_files (file_path, last_byte_offset, last_modified)
    VALUES (?, ?, ?)`,
    [filePath, byteOffset, mtime]
  );
  if (!db) saveDb(database);
}

export async function getIndexedFile(filePath: string, db?: SqlJsDatabase): Promise<IndexedFile | null> {
  const database = db ?? await getDb();
  const stmt = database.prepare(`SELECT * FROM indexed_files WHERE file_path = ?`);
  stmt.bind([filePath]);

  if (stmt.step()) {
    const row = stmt.getAsObject() as IndexedFile;
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export async function searchCommands(pattern: string, useRegex: boolean, cwd?: string, db?: SqlJsDatabase): Promise<Command[]> {
  const database = db ?? await getDb();

  if (useRegex) {
    const results: Command[] = [];
    const stmt = database.prepare(`SELECT * FROM commands ORDER BY timestamp DESC`);
    const regex = new RegExp(pattern, "i");

    while (stmt.step()) {
      const row = stmt.getAsObject() as Command;
      if (regex.test(row.command) && (!cwd || row.cwd === cwd)) {
        results.push(row);
      }
    }
    stmt.free();
    return results;
  }

  const results: Command[] = [];
  const sql = cwd
    ? `SELECT * FROM commands WHERE command LIKE ? AND cwd = ? ORDER BY timestamp DESC`
    : `SELECT * FROM commands WHERE command LIKE ? ORDER BY timestamp DESC`;
  const params = cwd ? [`%${pattern}%`, cwd] : [`%${pattern}%`];

  const stmt = database.prepare(sql);
  stmt.bind(params);

  while (stmt.step()) {
    results.push(stmt.getAsObject() as Command);
  }
  stmt.free();
  return results;
}

export async function searchCommandsWithFrecency(
  pattern: string,
  useRegex: boolean,
  cwd?: string,
  db?: SqlJsDatabase
): Promise<CommandWithFrecency[]> {
  const database = db ?? await getDb();

  // Get all matching commands grouped by command text
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

  const results: CommandWithFrecency[] = [];
  const stmt = database.prepare(sql);
  stmt.bind(cwd ? [cwd] : []);

  const regex = useRegex ? new RegExp(pattern, "i") : null;

  while (stmt.step()) {
    const row = stmt.getAsObject() as {
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
    };

    // Filter by pattern
    const matches = regex
      ? regex.test(row.command)
      : row.command.toLowerCase().includes(pattern.toLowerCase());

    if (matches) {
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
  stmt.free();

  // Sort by frecency score descending
  results.sort((a, b) => b.frecency_score - a.frecency_score);

  return results;
}

export async function listCommands(limit: number = 20, dbOrCwd?: SqlJsDatabase | string, db?: SqlJsDatabase): Promise<Command[]> {
  // Handle backwards compatible signature: listCommands(limit, db) or listCommands(limit, cwd, db)
  let database: SqlJsDatabase;
  let cwd: string | undefined;

  if (typeof dbOrCwd === "string") {
    cwd = dbOrCwd;
    database = db ?? await getDb();
  } else {
    database = dbOrCwd ?? db ?? await getDb();
  }

  const results: Command[] = [];

  const sql = cwd
    ? `SELECT * FROM commands WHERE cwd = ? ORDER BY timestamp DESC LIMIT ?`
    : `SELECT * FROM commands ORDER BY timestamp DESC LIMIT ?`;
  const params = cwd ? [cwd, limit] : [limit];

  const stmt = database.prepare(sql);
  stmt.bind(params);

  while (stmt.step()) {
    results.push(stmt.getAsObject() as Command);
  }
  stmt.free();
  return results;
}

export async function listCommandsWithFrecency(limit: number = 20, cwd?: string, db?: SqlJsDatabase): Promise<CommandWithFrecency[]> {
  const database = db ?? await getDb();

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

  const results: CommandWithFrecency[] = [];
  const stmt = database.prepare(sql);
  stmt.bind(cwd ? [cwd] : []);

  while (stmt.step()) {
    const row = stmt.getAsObject() as {
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
    };

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
  stmt.free();

  // Sort by frecency score descending and limit
  results.sort((a, b) => b.frecency_score - a.frecency_score);
  return results.slice(0, limit);
}

export async function getStats(db?: SqlJsDatabase): Promise<{ totalCommands: number; indexedFiles: number }> {
  const database = db ?? await getDb();

  const cmdStmt = database.prepare(`SELECT COUNT(*) as count FROM commands`);
  cmdStmt.step();
  const commands = cmdStmt.getAsObject() as { count: number };
  cmdStmt.free();

  const fileStmt = database.prepare(`SELECT COUNT(*) as count FROM indexed_files`);
  fileStmt.step();
  const files = fileStmt.getAsObject() as { count: number };
  fileStmt.free();

  return {
    totalCommands: commands.count,
    indexedFiles: files.count,
  };
}
