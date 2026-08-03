#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadStatusData,
  repositoryRoot,
  validateStatusData,
} from "./status-lib.mjs";

const args = process.argv.slice(2);
const taskId = args.find((arg) => !arg.startsWith("--"));
const shouldWrite = args.includes("--write");

if (!taskId) {
  process.stderr.write("Usage: node scripts/evidence.mjs TASK-ID [--write]\n");
  process.exit(1);
}

const { state, review } = await loadStatusData();
const errors = await validateStatusData(state, review);
if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

const task = state.tasks.find((candidate) => candidate.id === taskId);
if (!task) {
  process.stderr.write(`Unknown task: ${taskId}\n`);
  process.exit(1);
}

const reportDirectory = join(repositoryRoot, "artifacts", "test-results");
const reportNames = ["unit", "conformance", "property", "incremental"];
const reportLines = [];
for (const name of reportNames) {
  try {
    const report = JSON.parse(
      await readFile(join(reportDirectory, `${name}.json`), "utf8"),
    );
    reportLines.push(
      `- ${name}: ${report.passed ?? 0} passed, ${report.failed ?? 0} failed, ${report.durationMs ?? "unknown"} ms, commit ${report.commit ?? "unknown"}`,
    );
  } catch {
    reportLines.push(`- ${name}: no report`);
  }
}

const content = `# ${task.id} Evidence

Status: ${task.status}

## Contract

Specifications:

${task.specifications.map((specification) => `- \`${specification}\``).join("\n")}

Prerequisites: ${task.prerequisites.join(", ") || "None"}

## Work completed

Describe implemented behavior and files changed.

## Validation

${reportLines.join("\n")}

## Decisions and deviations

Record ADRs and specification deviations, or state none.

## Review material

Link generated artifacts and focused diffs.

## Next action

${task.nextAction}
`;

if (shouldWrite) {
  const path = join(repositoryRoot, "status", "tasks", `${task.id}.md`);
  await writeFile(path, content, "utf8");
  process.stdout.write(`Wrote status/tasks/${task.id}.md\n`);
} else {
  process.stdout.write(content);
}
