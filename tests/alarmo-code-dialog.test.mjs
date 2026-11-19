import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function setup() {
  const source = readFileSync(new URL('../src/components/alarmo-code-dialog.ts', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace('export class', 'class');
  const { outputText } = ts.transpileModule(`${source}\nglobalThis.Dialog = AlarmoCodeDialog;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2017, experimentalDecorators: true },
  });
  const decorator = () => () => {};
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    LitElement: class {
      updated() {}
    },
    SubscribeMixin: (base) => base,
    customElement: decorator,
    property: decorator,
    state: decorator,
    css: () => '',
    clearTimeout: () => {},
    window: {
      setTimeout: (callback) => (timers.set(++nextTimer, callback), nextTimer),
      clearTimeout: (id) => timers.delete(id),
    },
    localize: (key) => key,
    ArmActions: { Disarm: 'disarm' },
    ActionToState: { disarm: 'disarmed', arm_away: 'armed_away' },
    AlarmStates: { Arming: 'arming' },
    AlarmoEvents: { Arm: 'arm', Disarm: 'disarm', InvalidCodeProvided: 'invalid_code' },
  };
  runInNewContext(outputText.replace(/^export \{\};?$/gm, ''), context);
  const dialog = new context.Dialog();
  const confirmations = [];
  dialog._params = { entity_id: 'alarm.test', area_id: 1, action: 'arm_away', confirm: (ev) => confirmations.push(ev) };
  dialog.hass = { states: { 'alarm.test': { state: 'disarmed', attributes: {} } }, callService() {} };
  return { dialog, confirmations, timers };
}

function changeState(dialog, state, attributes = {}) {
  const oldHass = dialog.hass;
  dialog.hass = { ...oldHass, states: { 'alarm.test': { state, attributes } } };
  dialog.updated(new Map([['hass', oldHass]]));
}

test('submitted password closes on successful state update without an Alarmo event', () => {
  const { dialog, confirmations } = setup();
  dialog._input = '1234';
  dialog._submit();
  changeState(dialog, 'armed_away');
  assert.equal(dialog._params, undefined);
  assert.deepEqual(confirmations, ['arm']);
});

test('exit delay also confirms a submitted arm command', () => {
  const { dialog, confirmations } = setup();
  dialog._submit();
  changeState(dialog, 'arming', { arm_mode: 'armed_away' });
  assert.deepEqual(confirmations, ['arm']);
});

test('state updates before submission do not close the password dialog', () => {
  const { dialog, confirmations } = setup();
  changeState(dialog, 'armed_away');
  assert.ok(dialog._params);
  assert.deepEqual(confirmations, []);
});

test('numeric and string area IDs match on confirmation events', async () => {
  const { dialog, confirmations } = setup();
  await dialog._fetchData({ data: { area_id: '1', event: 'arm' } });
  assert.equal(dialog._params, undefined);
  assert.deepEqual(confirmations, ['arm']);
});

test('wrong password keeps the dialog open and stops state fallback', async () => {
  const { dialog, confirmations } = setup();
  dialog._submit();
  await dialog._fetchData({ data: { area_id: 1, event: 'invalid_code' } });
  changeState(dialog, 'armed_away');
  assert.ok(dialog._params);
  assert.deepEqual(confirmations, []);
});

test('repeated Submit clicks send only one command while waiting', async () => {
  const { dialog } = setup();
  let calls = 0;
  dialog.hass.callService = async () => {
    calls++;
  };
  await dialog._submit();
  await dialog._submit();
  assert.equal(calls, 1);
  assert.equal(dialog._submitted, true);
});

test('service failure clears busy state and shows a retry message', async () => {
  const { dialog, timers } = setup();
  dialog.hass.callService = async () => {
    throw new Error('offline');
  };
  await dialog._submit();
  assert.equal(dialog._submitted, false);
  assert.equal(dialog._status, 'code_dialog.submit_failed');
  assert.equal(timers.size, 0);
  assert.ok(dialog._params);
});

test('missing confirmation shows a status instead of waiting indefinitely', async () => {
  const { dialog, timers } = setup();
  await dialog._submit();
  [...timers.values()][0]();
  assert.equal(dialog._submitted, false);
  assert.equal(dialog._status, 'code_dialog.no_confirmation');
  assert.ok(dialog._params);
});
