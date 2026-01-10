import type { Command } from "./db";

export function formatCommand(cmd: Command): void {
  const time = cmd.timestamp ? new Date(cmd.timestamp).toLocaleString() : "unknown";
  const status = cmd.is_error ? "\x1b[31m[error]\x1b[0m" : "\x1b[32m[ok]\x1b[0m";

  console.log(`${status} \x1b[36m${cmd.command}\x1b[0m`);

  if (cmd.description) {
    console.log(`   \x1b[90m${cmd.description}\x1b[0m`);
  }

  console.log(`   \x1b[90m${time} | ${cmd.cwd ?? "unknown dir"}\x1b[0m`);
  console.log();
}
