# ran

Search and browse your Claude Code bash command history.

```
"What was that docker command I ran yesterday?"
```

```bash
$ ran search docker --limit 3

[ok] docker build -t myapp .
     Build the application image
     1/15/2025, 10:30 AM | /projects/myapp

[ok] docker push myapp:latest
     Push to registry
     1/15/2025, 10:35 AM | /projects/myapp

[error] docker compose up -d
     Start services
     1/14/2025, 3:20 PM | /projects/api
```

Every bash command Claude Code runs is logged in session files. `ran` indexes them into a searchable database so you can find that command you ran last week, see what worked, and avoid repeating mistakes.

## Install

```bash
# With Bun (recommended)
bun add -g clauderan

# With npm
npm install -g clauderan

# Or build from source
git clone https://github.com/yourusername/clauderan
cd clauderan
bun install
bun run build  # Creates ./ran binary
```

## Usage

```bash
# Search for commands containing "docker"
ran search docker

# Use regex patterns
ran search "git commit.*fix" --regex

# Filter by project directory
ran search npm --cwd /projects/myapp

# List recent commands
ran list
ran list --limit 50

# Manually sync (usually automatic)
ran sync
ran sync --force  # Re-index everything
```

## Examples

**Find a failing build command:**
```bash
$ ran search "npm run build" --limit 5
# Look for [error] entries to see what failed
```

**What commands did I run in a specific project?**
```bash
$ ran search "" --cwd /projects/api --limit 20
# Empty pattern matches everything, filtered by directory
```

**Re-run something from last week:**
```bash
$ ran list --limit 100
# Scroll through recent history, copy what you need
```

## Commands

### `ran search <pattern>`

Search command history by substring or regex.

| Flag | Description |
|------|-------------|
| `--regex`, `-r` | Treat pattern as regular expression |
| `--cwd <path>` | Filter by working directory |
| `--limit`, `-n <N>` | Limit number of results |
| `--no-sync` | Skip auto-sync before searching |

### `ran list`

Show recent commands, newest first.

| Flag | Description |
|------|-------------|
| `--limit`, `-n <N>` | Number of commands (default: 20) |
| `--no-sync` | Skip auto-sync before listing |

### `ran sync`

Index new commands from Claude Code sessions.

| Flag | Description |
|------|-------------|
| `--force`, `-f` | Re-index all sessions from scratch |

## How It Works

Claude Code stores conversation data in `~/.claude/projects/`. Each session is a JSONL file containing messages, tool calls, and results.

`ran` scans these files, extracts Bash tool invocations, and indexes them into a local SQLite database at `~/.ran/history.db`. It tracks file positions so subsequent syncs only process new content.

**Auto-sync**: By default, `search` and `list` automatically sync before returning results. Use `--no-sync` to skip this if you want faster queries.

**Privacy**: `ran` is read-only and local-only. It reads Claude's session files but never modifies them. No data is sent anywhere.

## Data Model

Each indexed command includes:

| Field | Description |
|-------|-------------|
| `command` | The bash command that was executed |
| `description` | What Claude said it does (e.g., "Build the project") |
| `cwd` | Working directory when command ran |
| `timestamp` | When the command was executed |
| `is_error` | Whether the command failed |
| `stdout` | Command output (stored, not displayed by default) |
| `stderr` | Error output (stored, not displayed by default) |
| `session_id` | Which Claude session ran this command |

## For AI Agents

If you're an AI agent (like Claude Code) reading this to understand the tool:

### When to use `ran`

- User asks "what was that command I/you ran?"
- User wants to find a command from a previous session
- User needs to recall commands from a specific project
- User wants to see commands that failed

### When NOT to use `ran`

- Finding files by name → use `Glob`
- Searching file contents → use `Grep`
- Checking recent conversation context → already in your context
- User's personal shell history → not indexed, only Claude's commands

### Capabilities

```
ran search <pattern>
  Flags: --regex, --cwd <path>, --limit <n>, --no-sync
  Returns: Matching commands with status, description, timestamp, directory

ran list
  Flags: --limit <n>, --no-sync
  Returns: Recent commands, newest first

ran sync
  Flags: --force
  Returns: Count of files scanned and commands indexed
```

### Example workflow

**User**: "What kubectl command did you use to check the pods?"

**Agent**: Let me search my command history:
```bash
ran search kubectl --limit 10
```

Then relay the relevant command(s) to the user.

## Development

```bash
# Install dependencies
bun install

# Run directly
bun run src/index.ts search docker

# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Build binary
bun run build
```

## About the name

`ran` — past tense of "run." It shows you what commands *ran*.

---

Built with Claude Code.

MIT License
