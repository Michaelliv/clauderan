#!/usr/bin/env bun

import { search } from "./commands/search";
import { list } from "./commands/list";
import { syncCommand } from "./commands/syncCmd";
import { onboard } from "./commands/onboard";
import { parseArgs } from "./cli";

const VERSION = "0.4.0";
const REPO_URL = "https://github.com/Michaelliv/cc-dejavu";

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
  console.log(`
\x1b[1mdeja\x1b[0m v${VERSION} - Claude Code bash history
${REPO_URL}

\x1b[1mUSAGE:\x1b[0m
  deja <command> [options]

\x1b[1mCOMMANDS:\x1b[0m
  search <pattern>   Search command history
    --regex, -r      Use regex pattern
    --cwd <path>     Filter by working directory
    --here, -H       Filter by current directory
    --limit, -n <N>  Limit results
    --sort <mode>    Sort by: frecency (default), time
    --no-sync        Skip auto-sync

  list               List recent commands
    --limit, -n <N>  Number of commands (default: 20)
    --here, -H       Filter by current directory
    --sort <mode>    Sort by: frecency (default), time
    --no-sync        Skip auto-sync

  sync               Sync command history from Claude sessions
    --force, -f      Force re-index all sessions

  onboard            Add deja section to ~/.claude/CLAUDE.md
    --force, -f      Update existing section

\x1b[1mEXAMPLES:\x1b[0m
  deja search docker
  deja search "git.*main" --regex
  deja search npm --cwd /projects/myapp
  deja search npm --here
  deja search npm --sort time
  deja list --limit 50
  deja list --here
  deja sync --force
`);
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(args.slice(1));

  // Handle --here flag by setting cwd to current directory
  const cwd = flags.here ? process.cwd() : (flags.cwd as string);

  switch (command) {
    case "search":
    case "s":
      if (positional.length === 0) {
        console.error("Error: search requires a pattern");
        process.exit(1);
      }
      await search(positional[0], {
        regex: flags.regex as boolean,
        cwd,
        limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
        noSync: flags.noSync as boolean,
        sort: (flags.sort as string) || "frecency",
      });
      break;

    case "list":
    case "ls":
    case "l":
      await list({
        limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
        noSync: flags.noSync as boolean,
        sort: (flags.sort as string) || "frecency",
        cwd,
      });
      break;

    case "sync":
      await syncCommand({
        force: flags.force as boolean,
      });
      break;

    case "onboard":
      onboard({
        force: flags.force as boolean,
      });
      break;

    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;

    case "--version":
    case "-v":
    case "-V":
      console.log(VERSION);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
