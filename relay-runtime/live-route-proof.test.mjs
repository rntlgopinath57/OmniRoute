import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFreeRoute, parseEvents } from './live-route-proof.mjs';

const base = [
  { type: 'planner', routeReason: 'public_free_lane' },
  { type: 'worker', model: 'freellmapi:kilo/stepfun/step-3.7-flash:free' },
];
const primary = [
  ...base,
  { type: 'worker_selected', model: 'freellmapi:kilo/stepfun/step-3.7-flash:free' },
  { type: 'done', model: 'freellmapi:kilo/stepfun/step-3.7-flash:free', answer: 'Hello!' },
];
const fallback = [
  ...base,
  { type: 'fallback', model: 'groq:openai/gpt-oss-20b' },
  { type: 'worker_selected', model: 'groq:openai/gpt-oss-20b' },
  { type: 'done', model: 'groq:openai/gpt-oss-20b', answer: 'Welcome aboard!' },
];

test('actual delivered primary and non-empty answer => VERIFIED', () => {
  assert.equal(classifyFreeRoute(primary).status, 'VERIFIED');
});
test('Oct 8 regression: Groq fallback returned an answer but must not pass primary health', () => {
  const result = classifyFreeRoute(fallback);
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.deliveredModel, 'groq:openai/gpt-oss-20b');
});
test('fallback without user-visible answer fails closed', () => {
  assert.equal(classifyFreeRoute([...fallback.slice(0, -1), { type: 'done', model: 'groq:openai/gpt-oss-20b', answer: '' }]).status, 'FAILED');
});
test('selected vs delivered mismatch fails closed', () => {
  assert.equal(classifyFreeRoute([...primary.slice(0, -1), { type: 'done', model: 'groq:openai/gpt-oss-20b', answer: 'hello' }]).status, 'FAILED');
});
test('undeclared provider switching fails closed', () => {
  assert.equal(classifyFreeRoute(fallback.filter((event) => event.type !== 'fallback')).status, 'FAILED');
});
test('terminal error cannot be masked by a done event', () => {
  assert.equal(classifyFreeRoute([...primary, { type: 'error', message: 'provider failed' }]).status, 'FAILED');
});
test('wrong lane and malformed event both fail closed', () => {
  assert.equal(classifyFreeRoute([{type:'planner',routeReason:'task_route'},...primary.slice(1)]).status, 'FAILED');
  assert.throws(() => parseEvents('{"type":"done"}\n{not-json}'), /invalid JSON event at line 2/);
});
