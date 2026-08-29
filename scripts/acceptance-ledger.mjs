#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  discoverFixtures,
  loadAcceptanceIntent,
} from "../packages/test-support/dist/src/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoots = [
  path.join(repositoryRoot, "fixtures/acceptance/playground"),
  path.join(repositoryRoot, "fixtures/acceptance/real-world"),
];
const ledgerPath = path.join(
  repositoryRoot,
  "docs/acceptance-capability-ledger.md",
);

function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function renderLedger() {
  const fixtures = (
    await Promise.all(fixtureRoots.map((root) => discoverFixtures(root)))
  ).flat();
  const contracts = await Promise.all(
    fixtures.map(({ directory }) => loadAcceptanceIntent(directory)),
  );
  const rows = contracts
    .flatMap(({ intent }) =>
      intent.capabilities.map(({ id, requirement }) => ({
        id,
        fixtureId: intent.fixtureId,
        requirement,
      })),
    )
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id) ||
        left.fixtureId.localeCompare(right.fixtureId),
    );
  const openDecisions = contracts
    .flatMap(({ intent }) =>
      intent.openDecisions.map(({ id, question }) => ({
        id,
        fixtureId: intent.fixtureId,
        question,
      })),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  const lines = [
    "# Acceptance Capability Ledger",
    "",
    "Generated from the validated `intent.json` files under",
    "`fixtures/acceptance/playground` and `fixtures/acceptance/real-world`.",
    "Edit those contracts, then update this ledger in the same change.",
    "",
    `Contracted families: ${String(contracts.length)}`,
    "",
    "## Capabilities",
    "",
    "| Capability | Consumer | Required behavior |",
    "| --- | --- | --- |",
    ...rows.map(
      ({ id, fixtureId, requirement }) =>
        `| \`${id}\` | \`${fixtureId}\` | ${escapeCell(requirement)} |`,
    ),
    "",
    "## Open decisions",
    "",
    "| Decision | Consumer | Question |",
    "| --- | --- | --- |",
    ...openDecisions.map(
      ({ id, fixtureId, question }) =>
        `| \`${id}\` | \`${fixtureId}\` | ${escapeCell(question)} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

const mode = process.argv[2] ?? "--check";
const rendered = await renderLedger();
if (mode === "--print") {
  process.stdout.write(rendered);
} else if (mode === "--check") {
  const existing = await readFile(ledgerPath, "utf8");
  if (existing !== rendered) {
    process.stderr.write(
      "Acceptance capability ledger is stale. Run the ledger printer and review the change.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "Acceptance contracts and capability ledger are current.\n",
    );
  }
} else {
  process.stderr.write("Usage: acceptance-ledger.mjs --check|--print\n");
  process.exitCode = 1;
}
