import { sync as doSync } from "../sync";
import { getStats } from "../db";

export interface SyncOptions {
  force?: boolean;
}

export function syncCommand(options: SyncOptions = {}): void {
  console.log(options.force ? "Force re-indexing all sessions..." : "Syncing new commands...");

  const result = doSync({ force: options.force });

  console.log(`\nScanned ${result.filesScanned} file(s)`);
  console.log(`Indexed ${result.newCommands} new command(s)`);

  if (result.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  const stats = getStats();
  console.log(`\nTotal: ${stats.totalCommands} commands from ${stats.indexedFiles} session files`);
}
