#!/usr/bin/env node

import { executeTask } from "./task.mjs";

function readInput() {
  const raw = process.argv[2];

  if (!raw) {
    throw new TypeError("Pass one JSON task object as the first argument");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new TypeError("Task argument must be valid JSON");
  }
}

try {
  const result = executeTask(readInput());
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`${JSON.stringify({ status: "error", error: message })}\n`);
  process.exitCode = 1;
}
