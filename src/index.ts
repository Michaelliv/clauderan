#!/usr/bin/env bun

import { search } from "./commands/search";
import { list } from "./commands/list";
import { syncCommand } from "./commands/syncCmd";
import { parseArgs } from "./cli";

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
  console.log(`
\x1b[1mran\x1b[0m - Claude Code bash history

\x1b[1mUSAGE:\x1b[0m
  ran <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  search <pattern>   Search command history
    --regex, -r      Use regex pattern
    --cwd <path>     Filter by working directory
    --limit, -n <N>  Limit results
    --no-sync        Skip auto-sync

  list               List recent commands
    --limit, -n <N>  Number of commands (default: 20)
    --no-sync        Skip auto-sync

  sync               Sync command history from Claude sessions
    --force, -f      Force re-index all sessions

\x1b[1mEXAMPLES:\x1b[0m
  ran search docker
  ran search "git.*main" --regex
  ran search npm --cwd /projects/myapp
  ran list --limit 50
  ran sync --force
`);
}

const { flags, positional } = parseArgs(args.slice(1));

switch (command) {
  case "search":
  case "s":
    if (positional.length === 0) {
      console.error("Error: search requires a pattern");
      process.exit(1);
    }
    search(positional[0], {
      regex: flags.regex as boolean,
      cwd: flags.cwd as string,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      noSync: flags.noSync as boolean,
    });
    break;

  case "list":
  case "ls":
  case "l":
    list({
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      noSync: flags.noSync as boolean,
    });
    break;

  case "sync":
    syncCommand({
      force: flags.force as boolean,
    });
    break;

  case "help":
  case "--help":
  case "-h":
  case undefined:
    printHelp();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
