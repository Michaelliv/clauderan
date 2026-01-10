import { listCommands } from "../db";
import { sync } from "../sync";
import { formatCommand } from "../format";

export interface ListOptions {
  limit?: number;
  noSync?: boolean;
}

export function list(options: ListOptions = {}): void {
  // Auto-sync before listing (unless disabled)
  if (!options.noSync) {
    sync();
  }

  const limit = options.limit ?? 20;
  const results = listCommands(limit);

  if (results.length === 0) {
    console.log("No commands in history.");
    return;
  }

  console.log(`Last ${results.length} command(s):\n`);

  for (const cmd of results) {
    formatCommand(cmd);
  }
}
