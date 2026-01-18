# deja

[![CI](https://github.com/Michaelliv/cc-dejavu/actions/workflows/ci.yml/badge.svg)](https://github.com/Michaelliv/cc-dejavu/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Michaelliv/cc-dejavu/graph/badge.svg)](https://codecov.io/gh/Michaelliv/cc-dejavu)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Search and browse your Claude Code bash command history.

```
"What was that docker command I ran yesterday?"
```

```bash
$ deja search docker --limit 4

[ok] docker build --no-cache --platform linux/amd64 -t ghcr.io/user/api-service:latest .
     Rebuild without cache for production
     12/30/2025, 12:46 AM | ~/projects/api-service

[ok] docker build -t api-service:test .
     Build test image
     12/30/2025, 12:45 AM | ~/projects/api-service

[ok] docker run --rm api-service:test npm test
     Run tests in container
     12/30/2025, 12:46 AM | ~/projects/api-service

[ok] docker push ghcr.io/user/api-service:latest
     Push to registry
     12/30/2025, 12:48 AM | ~/projects/api-service
```

Every bash command Claude Code runs is logged in session files. `deja` indexes them into a searchable database so you can find that command you ran last week, see what worked, and avoid repeating mistakes.

## Features

- **Frecency-based sorting** - Commands are ranked by a combination of frequency and recency, so your most useful commands appear first
- **Match highlighting** - Search patterns are highlighted in yellow in the output
- **Automatic sync** - History is automatically synced before each search

## Install

```bash
# With Bun (recommended)
bun add -g cc-dejavu

# With npm
npm install -g cc-dejavu

# Or build from source
git clone https://github.com/Michaelliv/cc-dejavu
cd cc-dejavu
bun install
bun run build  # Creates ./deja binary
```

## Usage

```bash
# Search for commands containing "docker"
deja search docker

# Use regex patterns
deja search "git commit.*fix" --regex

# Filter by project directory
deja search npm --cwd /projects/myapp

# Filter by current directory
deja search npm --here

# Sort by time instead of frecency
deja search npm --sort time

# List recent commands
deja list
deja list --limit 50

# List commands from current project only
deja list --here

# Manually sync (usually automatic)
deja sync
deja sync --force  # Re-index everything
```

## Examples

**Find a failing build command:**
```bash
$ deja search "npm run build" --limit 5
# Look for [error] entries to see what failed
```

**What commands did I run in this project?**
```bash
$ deja list --here --limit 20
# Shows only commands from current directory
```

**What commands did I run in a specific project?**
```bash
$ deja search "" --cwd /projects/api --limit 20
# Empty pattern matches everything, filtered by directory
```

**Re-run something from last week:**
```bash
$ deja list --limit 100
# Scroll through recent history, copy what you need
```

## Commands

### `deja search <pattern>`

Search command history by substring or regex.

| Flag | Description |
|------|-------------|
| `--regex`, `-r` | Treat pattern as regular expression |
| `--cwd <path>` | Filter by working directory |
| `--here`, `-H` | Filter by current directory |
| `--limit`, `-n <N>` | Limit number of results |
| `--sort <mode>` | Sort by: `frecency` (default), `time` |
| `--no-sync` | Skip auto-sync before searching |

### `deja list`

Show recent commands, sorted by frecency by default.

| Flag | Description |
|------|-------------|
| `--limit`, `-n <N>` | Number of commands (default: 20) |
| `--here`, `-H` | Filter by current directory |
| `--sort <mode>` | Sort by: `frecency` (default), `time` |
| `--no-sync` | Skip auto-sync before listing |

### `deja sync`

Index new commands from Claude Code sessions.

| Flag | Description |
|------|-------------|
| `--force`, `-f` | Re-index all sessions from scratch |

## Frecency Algorithm

Results are sorted by "frecency" - a combination of frequency and recency:

- **Recency weights**: Commands run in the last 4 hours score highest, with decreasing weights for last day, week, month, and older
- **Frequency**: Uses logarithmic scaling to prevent very frequent commands from dominating

This means recently-used commands you run often appear at the top, while one-off commands from months ago sink to the bottom.

Use `--sort time` to revert to simple timestamp ordering.

## How It Works

Claude Code stores conversation data in `~/.claude/projects/`. Each session is a JSONL file containing messages, tool calls, and results.

`deja` scans these files, extracts Bash tool invocations, and indexes them into a local SQLite database at `~/.cc-dejavu/history.db`. It tracks file positions so subsequent syncs only process new content.

**Auto-sync**: By default, `search` and `list` automatically sync before returning results. Use `--no-sync` to skip this if you want faster queries.

**Privacy**: `deja` is read-only and local-only. It reads Claude's session files but never modifies them. No data is sent anywhere.

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

Run `deja onboard` to add a section to `~/.claude/CLAUDE.md` so Claude knows how to search its own history:

```bash
deja onboard
```

This adds:

```xml
<deja>
Use `deja` to search bash commands from previous Claude Code sessions.

<commands>
- `deja search <pattern>` - Search by substring (or `--regex`)
- `deja list` - Recent commands
- `deja list --here` - Recent commands in current project
- `deja search <pattern> --here` - Search in current project
</commands>

<when-to-use>
- "Deploy like we did last time"
- "Run the same build command"
- "What was that curl/docker/git command?"
- "Set it up like we did on the other project"
- "Show me the failed builds"
- Looking up commands from previous sessions
</when-to-use>

<when-not-to-use>
- Finding files -> use Glob
- Searching file contents -> use Grep
- Commands from current session -> already in context
</when-not-to-use>
</deja>
```

Now Claude knows how to search its own history.

### When to use `deja`

- User asks "what was that command I/you ran?"
- User wants to find a command from a previous session
- User needs to recall commands from a specific project
- User wants to see commands that failed

### When NOT to use `deja`

- Finding files by name -> use `Glob`
- Searching file contents -> use `Grep`
- Checking recent conversation context -> already in your context
- User's personal shell history -> not indexed, only Claude's commands

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

`deja` - short for deja vu, "already seen." It shows you commands you've already run.

---

MIT License
