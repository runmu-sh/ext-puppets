/**
 * Puppets in the headless μClient host (@runmu.sh/dev/test) with a DOM: the GMCP contract, unread and the tab badge,
 * the 300-line buffer, resync on open, the command line (gmcp and its command fallback), Save / Clear, the list and
 * terminal markup, per-session state, the exported API (incl. add/has/watch for other extensions) and disposal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boot, mount, tick, calls, gmcpSent, validate, document, load, ROOT } from './helpers.mjs';

const MAN = { puppets: [{ npc_id: 6, slot: 2, name: 'Ferry' }, { npc_id: 5, slot: 1, name: 'Wren' }] };
const FEED = { npc_id: 5, lines: [{ body: 'a', revision: 3, news: 'room' }, { body: 'b', revision: 4 }, { body: 'c', revision: 5, news: 'room' }] };
const lastBadge = (host, sid) => calls(host, 'panels.badge').filter((c) => (c.args[2] ?? 's1') === sid).at(-1)?.args[1];

test('manifest, unread from room news, the tab badge, the 300-line buffer and manifest drops', async () => {
  const host = await boot();
  const api = host.ext.api;
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  host.gmcp('s1', 'Client.Puppets.Feed', FEED);
  assert.equal(api.unread('s1'), 2);
  assert.deepEqual(lastBadge(host, 's1'), { count: 2 });
  assert.equal(host.panels.get('puppets').title, 'Puppets', 'the title stays; the count is the badge');
  host.gmcp('s1', 'Client.Puppets.Feed', { npc_id: 6, lines: Array.from({ length: 320 }, (_, i) => ({ body: `l${i}`, revision: 10 + i })) });
  assert.equal(api.get('feed', 6, 's1').length, 300);
  assert.equal(api.get('feed', 6, 's1')[0].body, 'l20');
  assert.deepEqual(api.get('manifest', 's1').map((p) => p.npc_id), ['5', '6'], 'sorted by slot, ids as strings');
  host.gmcp('s1', 'Client.Puppets.Manifest', { puppets: [{ npc_id: 5, slot: 1, name: 'Wren' }] });
  assert.deepEqual(api.get('manifest', 's1').map((p) => p.npc_id), ['5']);
  assert.equal(api.get('feed', 5, 's1').length, 3, 'a puppet kept in the manifest keeps its feed');
  assert.equal(api.unread('s2'), 0, 'per session');
  assert.ok(calls(host, 'panels.touch').some((c) => c.args[0] === 'puppets' && c.args[1] === 's1'), 'data touches the auto panel');
  assert.ok(!calls(host, 'panels.touch').some((c) => c.args[1] === 's2'));
  await host.unload();
});

test('the panel is declared with show auto, and Core.Supports is held while not off', async () => {
  const host = await boot();
  const spec = host.panels.get('puppets');
  assert.equal(spec.show, 'auto');
  assert.equal(spec.singleton, true);
  assert.ok(calls(host, 'gmcp.supports').some((c) => c.args[0].includes('Client.Puppets 1')));
  assert.ok(host.live().includes('gmcp.supports'));
  host.mu.settings.set('puppets.enabled', 'off');
  assert.ok(!host.live().includes('gmcp.supports'), 'off withdraws the package');
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  assert.equal(host.ext.api.get('manifest', 's1').length, 0, 'off ignores GMCP');
  host.mu.settings.set('puppets.enabled', 'auto');
  assert.ok(host.live().includes('gmcp.supports'));
  await host.unload();
});

test('list markup: rows, slot, name, #id, room, square badge (99+), empty state', async () => {
  const host = await boot();
  const w = mount(host, 's1');
  assert.equal(w.$('[data-testid=puppets-empty]').textContent, 'No remote puppet viewpoints.');
  assert.equal(w.$('[data-testid=puppets]').getAttribute('aria-label'), 'Remote puppet viewpoints');
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  host.gmcp('s1', 'Client.Puppets.Scene', { npc_id: 5, revision: 2, room: { name: 'Chapel of Ash' }, occupants: ['a pilgrim'], exits: ['north'] });
  host.gmcp('s1', 'Client.Puppets.Feed', FEED);
  const rows = w.$$('[data-testid=puppets-list] .prow');
  assert.deepEqual(rows.map((r) => r.dataset.id), ['5', '6']);
  assert.ok(rows[0].classList.contains('sh-row') && rows[0].classList.contains('row'));
  assert.ok(rows[0].classList.contains('hot'), 'unread → .hot');
  assert.ok(!rows[1].classList.contains('hot'));
  assert.equal(rows[0].querySelector('strong').textContent, 'P1');
  assert.equal(rows[0].querySelector('.name').textContent, 'Wren');
  assert.equal(rows[0].querySelector('small').textContent, '#5');
  assert.equal(rows[0].querySelector('.where').textContent, 'Chapel of Ash');
  const b = rows[0].querySelector('[data-testid=puppet-unread]');
  assert.equal(b.textContent, '2');
  assert.equal(b.getAttribute('aria-label'), '2 unread');
  host.gmcp('s1', 'Client.Puppets.Feed', { npc_id: 6, lines: Array.from({ length: 120 }, (_, i) => ({ body: `x${i}`, news: 'room' })) });
  assert.equal(w.$('.prow[data-id="6"] [data-testid=puppet-unread]').textContent, '99+');
  assert.equal(w.$('.prow[data-id="6"] [data-testid=puppet-unread]').getAttribute('aria-label'), '120 unread');
  assert.deepEqual(lastBadge(host, 's1'), { count: 122 });
  w.unmount();
  await host.unload();
});

test('opening a puppet marks it read, asks for a resync with the last revision, shows LOADING VIEWPOINT until Sync', async () => {
  const host = await boot();
  const api = host.ext.api;
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  host.gmcp('s1', 'Client.Puppets.Feed', FEED);
  host.gmcp('s1', 'Client.Puppets.Manifest', { puppets: [...MAN.puppets, { npc_id: 7, slot: 3, name: 'Gull' }] });
  const w = mount(host, 's1');
  w.$('[data-id="5"]').click();
  await tick();
  assert.deepEqual(gmcpSent(host, 'Client.Puppets.Resync').at(-1).data, { npc_id: '5', revision: 5 });
  assert.equal(api.unread('s1'), 0);
  assert.equal(lastBadge(host, 's1'), null, 'no unread → the badge is cleared');
  assert.equal(w.$('[data-testid=puppet-feed]').textContent, 'abc');
  // a line arriving while open is not unread
  host.gmcp('s1', 'Client.Puppets.Feed', { npc_id: 5, lines: [{ body: 'd', revision: 6, news: 'room' }] });
  assert.equal(api.unread('s1'), 0);
  // empty puppet: loading until Sync
  w.$('[data-testid=puppet-back]').click();
  w.$('[data-id="7"]').click();
  await tick();
  assert.deepEqual(gmcpSent(host, 'Client.Puppets.Resync').at(-1).data, { npc_id: '7', revision: 0 });
  assert.equal(w.$('.sync').textContent, 'Loading viewpoint');
  host.gmcp('s1', 'Client.Puppets.Sync', { npc_id: 7, revision: 9, lines: [{ body: 'The gull cries.' }], scene: { room: { name: 'Drowned Dock' }, occupants: [], exits: ['south'] } });
  assert.equal(w.$('.sync'), null);
  assert.equal(w.$('[data-testid=puppet-feed]').textContent, 'The gull cries.');
  assert.equal(w.$('[data-testid=puppet-scene] .rn').textContent, 'Drowned Dock');
  assert.match(w.$('[data-testid=puppet-scene]').textContent, /exitssouth/);
  assert.equal(w.$('.term-head .where').textContent, 'Drowned Dock');
  w.unmount();
  // closed panel: lines count again
  host.gmcp('s1', 'Client.Puppets.Feed', { npc_id: 7, lines: [{ body: 'e', news: 'room' }] });
  assert.equal(api.unread('s1'), 1);
  await host.unload();
});

test('terminal head and input: Back, P1, name, #id, room, Save/Clear disabled when empty, Act as placeholder', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  const w = mount(host, 's1');
  w.$('[data-id="6"]').click();
  const back = w.$('[data-testid=puppet-back]');
  assert.equal(back.textContent, 'Back');
  assert.equal(back.getAttribute('title'), 'Back to puppet list');
  assert.ok(back.classList.contains('sh-cmd'));
  assert.equal(w.$('.term-head strong').textContent, 'P2');
  assert.equal(w.$('.term-head .name').textContent, 'Ferry');
  assert.equal(w.$('.term-head small').textContent, '#6');
  const [save, clear] = w.$$('.ptool');
  assert.equal(save.getAttribute('aria-label'), 'download buffer');
  assert.equal(clear.getAttribute('aria-label'), 'clear buffer');
  assert.ok(save.hasAttribute('disabled') && clear.hasAttribute('disabled'), 'disabled on an empty buffer');
  const input = w.$('[data-testid=puppet-input]');
  assert.equal(input.getAttribute('placeholder'), 'Act as Ferry');
  assert.equal(input.getAttribute('aria-label'), 'command for Ferry');
  assert.equal(w.$('.prompt').textContent, 'P2>');
  assert.equal(document.activeElement, input, 'opening from the list focuses the command line');
  w.unmount();
  await host.unload();
});

test('the command line sends Client.Puppets.Command, falls back to @puppet when GMCP is refused, hides when via none', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  const w = mount(host, 's1');
  w.$('[data-id="5"]').click();
  const submit = async (text) => { const i = w.$('[data-testid=puppet-input]'); i.value = text; i.form.dispatchEvent(new window.Event('submit', { cancelable: true })); await tick(); };
  await submit('say hi');
  assert.deepEqual(gmcpSent(host, 'Client.Puppets.Command').at(-1).data, { npc_id: '5', cmd: 'say hi' });
  assert.equal(w.$('[data-testid=puppet-input]').value, '', 'cleared after sending');
  host.gmcpOn = false;
  await submit('bow');
  assert.equal(host.sends('command').at(-1).text, '@puppet 5 = bow');
  host.gmcpOn = true;
  await submit('   ');
  assert.equal(host.actionRuns.length, 2, 'blank is not sent');
  // an extension handles the command itself
  const off = host.ext.api.onAction('cmd', (a, s) => { assert.equal(a.npc, '5'); assert.equal(s.sid, 's1'); return a.cmd === 'mine'; });
  const n = host.sent.length;
  await submit('mine');
  assert.equal(host.sent.length, n, 'handled: nothing sent');
  off();
  host.mu.settings.set('puppets.action.cmd.via', 'none');
  w.$('[data-testid=puppet-back]').click();
  w.$('[data-id="5"]').click();
  assert.equal(w.$('[data-testid=puppet-input]'), null, 'via none hides the command line');
  w.unmount();
  await host.unload();
});

test('Save writes the plain text through mu.files; Clear asks first', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  host.gmcp('s1', 'Client.Puppets.Feed', { npc_id: 5, lines: [{ body: '<span class="x">Wren <b>kneels</b></span>' }, { body: '\u001b[31mred\u001b[0m text' }] });
  const w = mount(host, 's1');
  w.$('[data-id="5"]').click();
  const lines = w.$$('.term-line');
  assert.equal(lines[0].querySelector('b').textContent, 'kneels', 'HTML bodies render through mu.ui.sanitize');
  assert.equal(lines[1].querySelector('.a1').textContent, 'red', 'ANSI colours become .a<n>');
  w.$('[data-testid=puppet-save]').click();
  await tick();
  assert.equal(host.saved.length, 1);
  assert.match(host.saved[0].name, /^puppet-5-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.txt$/);
  assert.equal(host.saved[0].data, 'Wren kneels\nred text');
  host.confirmAnswer = false;
  w.$('[data-testid=puppet-clear]').click();
  await tick();
  assert.equal(host.confirms.at(-1).title, "Clear Wren's buffer?");
  assert.equal(host.ext.api.get('feed', 5, 's1').length, 2, 'cancelled: kept');
  host.confirmAnswer = true;
  w.$('[data-testid=puppet-clear]').click();
  await tick();
  assert.equal(host.ext.api.get('feed', 5, 's1').length, 0);
  assert.equal(w.$$('.term-line').length, 0);
  w.unmount();
  await host.unload();
});

test('source api ignores GMCP; source gmcp ignores the API; onRequest replaces the Resync', async () => {
  const host = await boot();
  const api = host.ext.api;
  api.configure({ source: 'api' });
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  assert.equal(api.get('manifest', 's1').length, 0);
  api.set('manifest', MAN, 's1');
  api.push('feed', FEED, 's1');
  api.set('scene', 5, { room: { name: 'Nave' } }, 's1');
  assert.equal(api.get('manifest', 's1').length, 2);
  assert.equal(api.unread('s1'), 2);
  const asked = [];
  api.onRequest('resync', (a, s) => { asked.push([a, s.sid]); });
  api.open(5);
  await tick();
  assert.deepEqual(asked, [[{ npc_id: '5', revision: 5 }, 's1']]);
  assert.equal(gmcpSent(host, 'Client.Puppets.Resync').length, 0);
  assert.ok(calls(host, 'panels.open').some((c) => c.args[0] === 'puppets'));
  api.sync({ npc_id: 5, revision: 8, lines: [{ body: 'z' }] }, 's1');
  assert.deepEqual(api.get('feed', 5, 's1').map((l) => l.body), ['z']);
  api.configure({ source: 'gmcp' });
  api.set('manifest', { puppets: [] }, 's1');
  assert.equal(api.get('manifest', 's1').length, 2, 'ignored');
  assert.throws(() => api.configure({ actions: { nope: { via: 'none' } } }), /no action "nope"/);
  await host.unload();
});

test('a replayed Feed is not counted again; a replayed Manifest is taken', async () => {
  const host = await boot();
  const on = host.gmcpHandlers.find((x) => x.pkg === 'Client.Puppets');
  on.fn(MAN, { sid: 's1', pkg: 'Client.Puppets.Manifest', replay: true });
  on.fn(FEED, { sid: 's1', pkg: 'Client.Puppets.Feed', replay: true });
  assert.equal(host.ext.api.get('manifest', 's1').length, 2);
  assert.equal(host.ext.api.unread('s1'), 0);
  assert.equal(host.ext.api.get('feed', 5, 's1').length, 0);
  await host.unload();
});

test('per-session state goes when the session closes', async () => {
  const host = await boot();
  host.gmcp('s2', 'Client.Puppets.Manifest', MAN);
  assert.equal(host.ext.api.get('manifest', 's2').length, 2);
  host.close('s2');
  host.open({ id: 's2', worldId: 'w2' });
  assert.equal(host.ext.api.get('manifest', 's2').length, 0);
  await host.unload();
});

test('exports for other extensions: add, has, canAdd, watch', async () => {
  const host = await boot();
  const api = host.ext.api;
  const seen = [];
  const off = api.watch((p) => seen.push(p.map((x) => x.npc_id)), 's1');
  assert.deepEqual(seen, [[]]);
  assert.equal(api.canAdd('s1'), true);
  assert.equal(await api.add({ npc_id: 42, name: 'Old Tom' }, 's1'), 'sent');
  assert.deepEqual(gmcpSent(host, 'Client.Puppets.Add').at(-1), { kind: 'gmcp', sid: 's1', pkg: 'Client.Puppets.Add', data: { npc_id: '42' } });
  host.gmcp('s1', 'Client.Puppets.Manifest', { puppets: [{ npc_id: 42, slot: 1, name: 'Old Tom' }] });
  assert.deepEqual(seen.at(-1), ['42']);
  assert.equal(api.has(42, 's1'), true);
  assert.equal(api.has('#42', 's1'), true);
  assert.equal(await api.add('42', 's1'), 'present', 'already a puppet: not sent again');
  assert.equal(gmcpSent(host, 'Client.Puppets.Add').length, 1);
  // no GMCP and no command template configured: hidden; with a template: the command
  host.gmcpOn = false;
  assert.equal(await api.add('43', 's1'), 'hidden');
  api.configure({ actions: { add: { cmd: '@puppet/add {npc}' } } });
  assert.equal(await api.add('#43', 's1'), 'sent');
  assert.equal(host.sends('command').at(-1).text, '@puppet/add 43');
  host.gmcpOn = true;
  api.configure({ actions: { add: { via: 'none' } } });
  assert.equal(api.canAdd('s1'), false);
  assert.equal(await api.add('44', 's1'), 'hidden');
  api.enable('off');
  assert.equal(await api.add('44', 's1'), 'hidden');
  assert.equal(api.canAdd('s1'), false);
  assert.equal(await api.add('44', 'nope'), 'hidden', 'unknown session');
  await assert.rejects(api.add({}, 's1'), /an npc id/);
  off();
  host.gmcp('s1', 'Client.Puppets.Manifest', { puppets: [] });
  assert.equal(seen.length, 2, 'unwatched');
  await host.unload();
});

test('the contracts in package.json match what is sent and accept what the game sends', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const msgs = pkg.muclient.contributes.gmcp[0].messages;
  const schema = (name) => JSON.parse(readFileSync(join(ROOT, msgs[name].schema), 'utf8'));
  assert.equal(validate(schema('Client.Puppets.Manifest'), MAN), null);
  assert.equal(validate(schema('Client.Puppets.Feed'), FEED), null);
  assert.match(validate(schema('Client.Puppets.Feed'), { npc_id: 1, lines: [{ nobody: 1 }] }), /body: required/);
  assert.equal(validate(schema('Client.Puppets.Scene'), { npc_id: '5', revision: 1, room: { name: 'x' }, occupants: ['a'], exits: [] }), null);
  assert.equal(validate(schema('Client.Puppets.Sync'), { npc_id: 5, revision: 2, lines: [], scene: { room: { name: 'x' } } }), null);
  assert.equal(validate(schema('Client.Puppets.Resync'), { npc_id: '5', revision: 5 }), null);
  assert.equal(validate(schema('Client.Puppets.Command'), { npc_id: '5', cmd: 'say hi' }), null);
  assert.equal(validate(schema('Client.Puppets.Add'), { npc_id: '42' }), null);
  for (const [k, v] of Object.entries(msgs)) assert.equal(v.dir, /Resync|Command|Add/.test(k) ? 'out' : 'in', k);
  assert.ok(pkg.files.includes('schema'));
  assert.ok(pkg.muclient.capabilities.includes('files') && pkg.muclient.capabilities.includes('send-commands'));
});

test('every CSS rule is scoped to the panel and uses tokens only', async () => {
  const { CSS } = await load('src/css.ts');
  const rules = CSS.replace(/@media[^{]+\{([\s\S]*?\})\s*\}/g, '$1').match(/[^{}]+\{[^}]*\}/g);
  for (const r of rules) {
    const sel = r.slice(0, r.indexOf('{')).trim();
    for (const s of sel.split(',')) assert.ok(s.trim().startsWith('.ext-panel[data-ext="puppets"]'), `unscoped: ${s}`);
    assert.doesNotMatch(r, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `colour literal in ${sel}`);
    assert.doesNotMatch(r, /border-radius:\s*[1-9]/, `radius in ${sel}`);
  }
});

test('unload disposes everything', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Puppets.Manifest', MAN);
  await host.unload();
  assert.deepEqual(host.live(), []);
  assert.deepEqual(host.errors, []);
});
