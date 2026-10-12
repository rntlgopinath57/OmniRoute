/** Classify delivered FreeLLMAPI evidence; a working fallback is degraded, not green. */
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function classifyFreeRoute(events) {
  const failed = (reason) => ({ status: 'FAILED', reason });
  if (!Array.isArray(events) || events.length === 0) return failed('no response events');
  if (events.some((row) => row?.type === 'error')) return failed('terminal error event');
  const planner = events.find((row) => row?.type === 'planner');
  const worker = events.find((row) => row?.type === 'worker');
  const selected = events.findLast((row) => row?.type === 'worker_selected');
  const done = events.findLast((row) => row?.type === 'done');
  if (planner?.routeReason !== 'public_free_lane') return failed('public-free route was not planned');
  if (!String(worker?.model || '').startsWith('freellmapi:')) return failed('FreeLLMAPI was not the planned worker');
  if (!selected?.model) return failed('missing actual selected worker evidence');
  if (!done || typeof done.answer !== 'string' || !done.answer.trim()) return failed('missing user-visible answer');
  if (!done.model || done.model !== selected.model) return failed('selected and delivered model disagree');
  const fallback = events.some((row) => row?.type === 'fallback' || row?.type === 'emergency_fallback');
  const primary = String(selected.model).startsWith('freellmapi:');
  if (!primary && !fallback) return failed('provider switched without fallback evidence');
  return {
    status: primary && !fallback ? 'VERIFIED' : 'DEGRADED',
    reason: primary && !fallback ? 'FreeLLMAPI primary delivered an answer' : 'fallback delivered an answer; FreeLLMAPI primary unavailable',
    plannedModel: worker.model,
    deliveredModel: done.model,
  };
}

export function parseEvents(raw) {
  return raw.split(/\r?\n/).filter((line) => line.trim()).map((line, i) => {
    try { return JSON.parse(line); }
    catch { throw new Error('invalid JSON event at line ' + (i + 1)); }
  });
}

function run(path) {
  let outcome;
  try { outcome = classifyFreeRoute(parseEvents(readFileSync(path, 'utf8'))); }
  catch (error) { outcome = { status: 'FAILED', reason: error.message }; }
  const message = 'Relay FreeLLMAPI: ' + outcome.status + ' — ' + outcome.reason;
  console.log(message);
  if (outcome.deliveredModel) console.log('Planned ' + outcome.plannedModel + '; delivered ' + outcome.deliveredModel);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n### Live FreeLLMAPI route proof\n- Status: **' + outcome.status + '**\n- ' + outcome.reason + '\n- Planned: ' + (outcome.plannedModel || 'unverified') + '\n- Delivered: ' + (outcome.deliveredModel || 'unverified') + '\n');
  }
  if (outcome.status !== 'VERIFIED') {
    console.log('::' + (outcome.status === 'DEGRADED' ? 'warning' : 'error') + '::' + message);
    process.exitCode = 1; // GitHub cannot show a green deployment gate for degraded primary routing.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) { console.error('usage: node live-route-proof.mjs <response.ndjson>'); process.exitCode = 2; }
  else run(process.argv[2]);
}
