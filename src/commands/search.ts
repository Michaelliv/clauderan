import { searchCommands, searchCommandsWithFrecency, type Command, type CommandWithFrecency } from "../db";
import { sync } from "../sync";
import { formatCommand } from "../format";

export interface SearchOptions {
  regex?: boolean;
  cwd?: string;
  limit?: number;
  noSync?: boolean;
  sort?: string; // "frecency" (default) or "time"
}

export function search(pattern: string, options: SearchOptions = {}): void {
  // Auto-sync before searching (unless disabled)
  if (!options.noSync) {
    sync();
  }

  const useFrecency = options.sort !== "time";

  let results: (Command | CommandWithFrecency)[];
  if (useFrecency) {
    results = searchCommandsWithFrecency(pattern, options.regex ?? false, options.cwd);
  } else {
    results = searchCommands(pattern, options.regex ?? false, options.cwd);
  }

  const limited = options.limit ? results.slice(0, options.limit) : results;

  if (limited.length === 0) {
    console.log("No commands found matching:", pattern);
    return;
  }

  const sortLabel = useFrecency ? "frecency" : "time";
  console.log(`Found ${results.length} command(s)${options.limit && results.length > options.limit ? ` (showing ${options.limit})` : ""} [sorted by ${sortLabel}]:\n`);

  for (const cmd of limited) {
    formatCommand(cmd, {
      pattern: useFrecency ? pattern : undefined,
      useRegex: options.regex,
      showFrequency: useFrecency,
    });
  }
}
