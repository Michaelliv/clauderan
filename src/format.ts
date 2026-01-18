import type { Command, CommandWithFrecency } from "./db";

/**
 * Highlight matching text in a string with ANSI bold yellow
 */
export function highlightMatch(text: string, pattern: string, useRegex: boolean): string {
  if (!pattern) {
    return text;
  }

  const HIGHLIGHT_START = "\x1b[1;33m"; // Bold yellow
  const HIGHLIGHT_END = "\x1b[0m\x1b[36m"; // Reset to cyan (command color)

  try {
    const regex = useRegex
      ? new RegExp(`(${pattern})`, "gi")
      : new RegExp(`(${escapeRegex(pattern)})`, "gi");

    return text.replace(regex, `${HIGHLIGHT_START}$1${HIGHLIGHT_END}`);
  } catch {
    // If regex is invalid, return text as-is
    return text;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface FormatOptions {
  pattern?: string;
  useRegex?: boolean;
  showFrequency?: boolean;
}

export function formatCommand(cmd: Command | CommandWithFrecency, options: FormatOptions = {}): void {
  const time = cmd.timestamp ? new Date(cmd.timestamp).toLocaleString() : "unknown";
  const status = cmd.is_error ? "\x1b[31m[error]\x1b[0m" : "\x1b[32m[ok]\x1b[0m";

  let commandText = cmd.command;
  if (options.pattern) {
    commandText = highlightMatch(commandText, options.pattern, options.useRegex ?? false);
  }

  // Show frequency if available and enabled
  const frequency = "frequency" in cmd ? (cmd as CommandWithFrecency).frequency : undefined;
  const frequencyDisplay = options.showFrequency && frequency && frequency > 1
    ? ` \x1b[90m(×${frequency})\x1b[0m`
    : "";

  console.log(`${status} \x1b[36m${commandText}\x1b[0m${frequencyDisplay}`);

  if (cmd.description) {
    console.log(`   \x1b[90m${cmd.description}\x1b[0m`);
  }

  console.log(`   \x1b[90m${time} | ${cmd.cwd ?? "unknown dir"}\x1b[0m`);
  console.log();
}
