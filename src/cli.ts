export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional: string[];
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--regex" || arg === "-r") {
      flags.regex = true;
    } else if (arg === "--force" || arg === "-f") {
      flags.force = true;
    } else if (arg === "--no-sync") {
      flags.noSync = true;
    } else if (arg === "--cwd" && args[i + 1]) {
      flags.cwd = args[++i];
    } else if ((arg === "--limit" || arg === "-n") && args[i + 1]) {
      flags.limit = args[++i];
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  return { flags, positional };
}
