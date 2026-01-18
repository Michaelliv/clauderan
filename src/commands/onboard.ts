import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface OnboardOptions {
  force?: boolean;
}

const MARKER = "<!-- deja:onboard -->";

const DEJA_SECTION = `${MARKER}
<deja>
Use \`deja\` to search bash commands from previous Claude Code sessions.

<commands>
- \`deja search <pattern>\` - Search by substring (or \`--regex\`)
- \`deja list\` - Recent commands
- \`deja list --here\` - Recent commands in current project
- \`deja search <pattern> --here\` - Search in current project
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
`;

export function onboard(options: OnboardOptions = {}): void {
  const claudeDir = join(homedir(), ".claude");
  const targetFile = join(claudeDir, "CLAUDE.md");

  // Ensure ~/.claude directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  let existingContent = "";
  if (existsSync(targetFile)) {
    existingContent = readFileSync(targetFile, "utf-8");
  }

  // Check for both old and new markers
  const oldMarker = "<!-- ran:onboard -->";
  const hasOldMarker = existingContent.includes(oldMarker);
  const hasNewMarker = existingContent.includes(MARKER);

  if (hasNewMarker) {
    if (!options.force) {
      console.log(`deja section already exists in ${targetFile}`);
      console.log("Use --force to update it");
      return;
    }
    // Remove existing section for replacement
    const markerIndex = existingContent.indexOf(MARKER);
    const nextSectionMatch = existingContent.slice(markerIndex + MARKER.length).match(/\n## /);
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      const endIndex = markerIndex + MARKER.length + nextSectionMatch.index;
      existingContent = existingContent.slice(0, markerIndex) + existingContent.slice(endIndex);
    } else {
      existingContent = existingContent.slice(0, markerIndex);
    }
  } else if (hasOldMarker) {
    // Remove old ran section and replace with new deja section
    const markerIndex = existingContent.indexOf(oldMarker);
    const nextSectionMatch = existingContent.slice(markerIndex + oldMarker.length).match(/\n## /);
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      const endIndex = markerIndex + oldMarker.length + nextSectionMatch.index;
      existingContent = existingContent.slice(0, markerIndex) + existingContent.slice(endIndex);
    } else {
      existingContent = existingContent.slice(0, markerIndex);
    }
    console.log("Migrating from ran to deja...");
  }

  const newContent = existingContent
    ? existingContent.trimEnd() + "\n\n" + DEJA_SECTION
    : DEJA_SECTION;

  writeFileSync(targetFile, newContent);

  const action = existingContent ? "Updated" : "Created";
  console.log(`${action} ${targetFile} with deja section`);
}
