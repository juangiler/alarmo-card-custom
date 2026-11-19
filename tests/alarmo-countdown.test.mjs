import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

function setup(responses, state = 'arming') {
  let now = 0;
  let calls = 0;
  let nextId = 0;
  const timeouts = new Map();
  const intervals = new Map();
  const source = readFileSync(new URL('../src/components/alarmo-countdown.ts', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace('export class', 'class');
  const { outputText } = ts.transpileModule(`${source}\nglobalThis.Countdown = AlarmoCountdown;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2017, experimentalDecorators: true },
  });
  const decorator = () => () => {};
  const context = {
    LitElement: class {
      isConnected = true;
    },
    customElement: decorator,
    property: decorator,
    state: decorator,
    css: () => '',
    PENDING_STATES: ['arming', 'pending'],
    performance: { now: () => now },
    window: {
      setTimeout: (callback) => (timeouts.set(++nextId, callback), nextId),
      clearTimeout: (id) => timeouts.delete(id),
      setInterval: (callback) => (intervals.set(++nextId, callback), nextId),
      clearInterval: (id) => intervals.delete(id),
    },
    fetchCountdown: async () => {
      const response = responses[Math.min(calls++, responses.length - 1)];
      if (response instanceof Error) throw response;
      return response;
    },
  };
  runInNewContext(outputText, context);
  const card = new context.Countdown();
  card.entity = 'alarm_control_panel.test';
  card.hass = { states: { [card.entity]: { state } } };
  return {
    card,
    timeouts,
    intervals,
    calls: () => calls,
    advance: (milliseconds) => {
      now += milliseconds;
      for (const callback of intervals.values()) callback();
    },
    retry: async () => {
      const [id, callback] = timeouts.entries().next().value;
      timeouts.delete(id);
      callback();
      await setImmediate();
    },
  };
}

test('entry and exit delays count down and stop at zero', async () => {
  for (const state of ['arming', 'pending']) {
    const view = setup([{ delay: 30, remaining: 20 }], state);
    await view.card._syncCountdown();
    assert.equal(view.card._remaining, 20);
    view.advance(1000);
    assert.equal(view.card._remaining, 19);
    view.advance(19000);
    assert.equal(view.card._remaining, 0);
    assert.equal(view.intervals.size, 0);
  }
});

test('retries when the state arrives before countdown data', async () => {
  const view = setup([
    { delay: 30, remaining: 0 },
    { delay: 30, remaining: 29 },
  ]);
  await view.card._syncCountdown();
  assert.equal(view.card._remaining, 0);
  await view.retry();
  assert.equal(view.card._remaining, 29);
  assert.equal(view.timeouts.size, 0);
});

test('recovers from a temporary websocket failure', async () => {
  const view = setup([new Error('Disconnected'), { delay: 30, remaining: 28 }]);
  await view.card._syncCountdown();
  await view.retry();
  assert.equal(view.card._remaining, 28);
});

test('disarming cancels a queued retry', async () => {
  const view = setup([{ delay: 0, remaining: 0 }]);
  await view.card._syncCountdown();
  view.card.hass.states[view.card.entity].state = 'disarmed';
  await view.card._syncCountdown();
  assert.equal(view.timeouts.size, 0);
  assert.equal(view.calls(), 1);
});

test('stale responses cannot restart a stopped countdown', async () => {
  let resolve;
  const response = new Promise((done) => (resolve = done));
  const view = setup([response]);
  const pending = view.card._syncCountdown();
  view.card._stopCountdown();
  resolve({ delay: 30, remaining: 30 });
  await pending;
  await setImmediate();
  assert.equal(view.card._remaining, 0);
  assert.equal(view.intervals.size, 0);
  assert.equal(view.timeouts.size, 0);
});

test('retries are bounded if countdown data stays unavailable', async () => {
  const view = setup([{ delay: 0, remaining: 0 }]);
  await view.card._syncCountdown();
  for (let i = 0; i < 10; i++) await view.retry();
  assert.equal(view.calls(), 11);
  assert.equal(view.timeouts.size, 0);
});
