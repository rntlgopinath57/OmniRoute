#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';

const root = new URL('../../', import.meta.url);
const routing = JSON.parse(await fs.readFile(new URL('config/ai-team/task-routing.json', root), 'utf8'));
const text = process.argv.slice(2).join(' ').trim().toLowerCase();

if (!text) {
  console.error('Usage: node scripts/ai-team/route-task.mjs "task description"');
  process.exit(2);
}

const scored = (routing.routes ?? []).map((route) => {
  const hits = (route.match ?? []).filter((term) => text.includes(String(term).toLowerCase()));
  return { route, hits, score: hits.length };
}).filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score || a.route.id.localeCompare(b.route.id));

if (!scored.length) {
  console.log(JSON.stringify({
    route: 'unclassified',
    requireVerification: routing.defaults?.requireVerification ?? true,
    preferFreeSelfHosted: routing.defaults?.preferFreeSelfHosted ?? true,
    message: 'No specialist route matched. Use general routing and require verification.'
  }, null, 2));
  process.exit(0);
}

const winner = scored[0];
console.log(JSON.stringify({
  route: winner.route.id,
  score: winner.score,
  matchedTerms: winner.hits,
  skills: winner.route.skills ?? [],
  tools: winner.route.tools ?? [],
  verification: winner.route.verification ?? [],
  risk: winner.route.risk ?? 'medium',
  humanApprovalBeforeMutation: winner.route.humanApprovalBeforeMutation ?? false,
  defaults: routing.defaults ?? {}
}, null, 2));
