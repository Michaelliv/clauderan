import { listCommands, listCommandsWithFrecency, type Command, type CommandWithFrecency } from "../db";
import { sync } from "../sync";
import { formatCommand } from "../format";

export interface ListOptions {
  limit?: number;
  noSync?: boolean;
  sort?: string; // "frecency" (default) or "time"
  cwd?: string;
}

export function list(options: ListOptions = {}): void {
  // Auto-sync before listing (unless disabled)
  if (!options.noSync) {
    sync();
  }

  const limit = options.limit ?? 20;
  const useFrecency = options.sort !== "time";

  let results: (Command | CommandWithFrecency)[];
  if (useFrecency) {
    results = listCommandsWithFrecency(limit, options.cwd);
  } else {
    results = listCommands(limit, options.cwd);
  }

  if (results.length === 0) {
    console.log("No commands in history.");
    return;
  }

  const sortLabel = useFrecency ? "frecency" : "time";
  const cwdLabel = options.cwd ? ` in ${options.cwd}` : "";
  console.log(`Last ${results.length} command(s)${cwdLabel} [sorted by ${sortLabel}]:\n`);

  for (const cmd of results) {
    formatCommand(cmd, { showFrequency: useFrecency });
  }
}
