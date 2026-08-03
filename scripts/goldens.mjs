#!/usr/bin/env node

import path from "node:path";
import {
  acceptGoldenCandidate,
  loadFixture,
  writeGoldenCandidate,
} from "../packages/test-support/dist/src/index.js";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseArguments(arguments_) {
  const options = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined) {
      throw new Error(
        `Expected --name value, received ${arguments_.slice(index).join(" ")}`,
      );
    }
    if (options.has(flag)) throw new Error(`Duplicate option ${flag}`);
    options.set(flag, value);
  }
  return options;
}

function required(options, name) {
  const value = options.get(name);
  if (value === undefined) throw new Error(`Missing required option ${name}`);
  return value;
}

async function main() {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command !== "candidate" && command !== "accept") {
    throw new Error(
      "Usage: goldens.mjs candidate|accept --case DIR --artifact NAME ...",
    );
  }
  const options = parseArguments(arguments_);
  const caseDirectory = path.resolve(required(options, "--case"));
  const artifact = required(options, "--artifact");
  const candidateRoot = path.resolve(
    options.get("--candidate-root") ?? "artifacts/golden-candidates",
  );

  if (command === "candidate") {
    const actual = path.resolve(required(options, "--actual"));
    const location = await writeGoldenCandidate(
      caseDirectory,
      artifact,
      actual,
      candidateRoot,
    );
    process.stdout.write(`Candidate: ${location.candidatePath}\n`);
    process.stdout.write(`Compare with: ${location.goldenPath}\n`);
    return;
  }

  const fixture = await loadFixture(caseDirectory);
  const approval = required(options, "--approve");
  const expectedApproval = `${fixture.manifest.id}/${artifact}`;
  if (approval !== expectedApproval) {
    throw new Error(`Approval must equal ${expectedApproval}`);
  }
  const location = await acceptGoldenCandidate(
    caseDirectory,
    artifact,
    candidateRoot,
  );
  process.stdout.write(`Accepted: ${location.goldenPath}\n`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
