#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';

const root = new URL('../../', import.meta.url);
const readJson = async (relative) => JSON.parse(await fs.readFile(new URL(relative, root), 'utf8'));

const sources = await readJson('config/ai-team/skill-sources.json');
const routing = await readJson('config/ai-team/task-routing.json');

const errors = [];
const warnings = [];
const ids = new Set();

for (const source of sources.sources ?? []) {
  if (!source.id || !source.repo || !source.type) errors.push(`Invalid source entry: ${JSON.stringify(source)}`);
  if (ids.has(source.id)) errors.push(`Duplicate source id: ${source.id}`);
  ids.add(source.id);
  if (!/^https:\/\/github\.com\//.test(source.repo)) warnings.push(`Non-GitHub source URL for ${source.id}: ${source.repo}`);
}

for (const route of routing.routes ?? []) {
  if (!route.id || !Array.isArray(route.match) || route.match.length === 0) errors.push(`Invalid route: ${route.id ?? '<missing>'}`);
  for (const skill of route.skills ?? []) if (!ids.has(skill)) errors.push(`Route ${route.id} references missing skill/source: ${skill}`);
  for (const tool of route.tools ?? []) if (!ids.has(tool)) errors.push(`Route ${route.id} references missing tool/source: ${tool}`);
  if ((route.risk === 'high' || route.risk === 'critical') && route.humanApprovalBeforeMutation !== true) {
    warnings.push(`High-risk route ${route.id} does not require human approval before mutation`);
  }
  if (!Array.isArray(route.verification) || route.verification.length === 0) {
    warnings.push(`Route ${route.id} has no verification gates`);
  }
}

console.log('OmniRoute AI Team Control Plane Doctor');
console.log(`Sources: ${sources.sources?.length ?? 0}`);
console.log(`Routes: ${routing.routes?.length ?? 0}`);

if (warnings.length) {
  console.log('\nWarnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length) {
  console.error('\nErrors:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('\nPASS: registry and routing policy are internally consistent.');
}
