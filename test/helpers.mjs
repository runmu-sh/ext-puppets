// Test helpers: the headless host (@runmu.sh/dev/test) with a DOM (happy-dom) and the parts of the 1.12 host the
// test host only records (mu.actions, mu.ui.sanitize, mu.files.save, mu.ui.confirm) modelled after μClient.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const find = () => process.env.MUCLIENT_DEV_TEST ?? createRequire(join(ROOT, 'package.json')).resolve('@runmu.sh/dev/test');
const { createHost } = await import(pathToFileURL(find()).href);

const win = new Window({ url: 'http://localhost/' });
for (const k of ['window', 'document', 'Node', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent', 'DocumentFragment']) globalThis[k] = k === 'window' ? win : win[k];
export const document = win.document;
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** `{name}` placeholders and `[…]` optional segments, as the host fills an action's command template. */
export function fillTemplate(tpl, vars) {
  const sub = (s) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return sub(tpl.replace(/\[([^\]]*)\]/g, (_, seg) => ([...seg.matchAll(/\{(\w+)\}/g)].every((m) => (vars[m[1]] ?? '') !== '') ? seg : ''))).trim();
}

/** A host with the extension loaded. `opts.gmcp` false: GMCP sends are refused (the action falls back to its command). */
export async function boot(opts = {}) {
  const host = createHost({ root: ROOT, sessions: opts.sessions ?? [{ id: 's1', worldId: 'w1' }, { id: 's2', worldId: 'w2' }], settings: opts.settings });
  const mu = host.mu;
  host.gmcpOn = true;
  const send = mu.gmcp.send;
  mu.gmcp.send = async (pkg, data, o) => (host.gmcpOn ? send(pkg, data, o) : false);
  // mu.actions as the host does it (surfaces.ts): prefs `<prefix>.action.<name>.via|cmd`, handlers first, gmcp → command.
  const defs = new Map(), handlers = new Map();
  const key = (id) => { const i = id.lastIndexOf('.'); return `${id.slice(0, i)}.action.${id.slice(i + 1)}`; };
  const via = (id) => mu.settings.get(`${key(id)}.via`) ?? defs.get(id).via;
  host.actionRuns = [];
  mu.actions.define = (spec) => { defs.set(spec.id, spec); if (mu.settings.get(`${key(spec.id)}.via`) === undefined) mu.settings.set(`${key(spec.id)}.via`, spec.via); if (mu.settings.get(`${key(spec.id)}.cmd`) === undefined) mu.settings.set(`${key(spec.id)}.cmd`, spec.command ?? ''); return () => defs.delete(spec.id); };
  mu.actions.handle = (id, fn) => { const s = handlers.get(id) ?? handlers.set(id, new Set()).get(id); s.add(fn); return () => s.delete(fn); };
  mu.actions.visible = (id) => defs.has(id) && via(id) !== 'none';
  mu.actions.run = async (id, args, o) => {
    host.actionRuns.push({ id, args, sid: o?.sid });
    const a = defs.get(id);
    if (!a || !o?.sid) return 'hidden';
    const s = host.sessions.find((x) => x.id === o.sid);
    for (const fn of [...(handlers.get(id) ?? [])]) if ((await fn({ ...args }, { sid: o.sid, worldId: s?.worldId ?? '', character: s?.character ?? '' })) === true) return 'handled';
    const v = via(id);
    if (v === 'none') return 'hidden';
    if (v === 'ext') return (handlers.get(id)?.size ?? 0) ? 'handled' : 'hidden';
    if (v === 'gmcp' && a.gmcp) { const [pkg, data] = a.gmcp(args); if (await mu.gmcp.send(pkg, data, { sid: o.sid })) return 'sent'; }
    const line = fillTemplate(String(mu.settings.get(`${key(id)}.cmd`) ?? ''), args);
    if (!line) return 'hidden';
    await mu.sessions.send(line, { sid: o.sid });
    return 'sent';
  };
  mu.ui.sanitize = (html) => { const t = document.createElement('template'); t.innerHTML = html; for (const e of t.content.querySelectorAll('script,style,iframe')) e.remove(); return t.content; };
  // the class names μClient's mu.ui.css gives (sdk.ts UI_CSS)
  Object.assign(mu.ui.css, { row: 'sh-row', cmd: 'sh-cmd', hot: 'hot', placeholder: 'sh-placeholder' });
  host.saved = [];
  mu.files.save = async (spec) => { host.saved.push(spec); return true; };
  host.confirms = [];
  host.confirmAnswer = true;
  mu.ui.confirm = async (spec) => { host.confirms.push(spec); return host.confirmAnswer; };
  host.gmcpHandlers = [];
  const on = mu.gmcp.on;
  mu.gmcp.on = (pkg, fn, o) => { host.gmcpHandlers.push({ pkg, fn }); return on(pkg, fn, o); };
  await host.load('src/index.ts');
  return host;
}

/** Mount the puppets panel for `sid` into a fresh element, as the host does (`.ext-panel[data-ext=puppets]`). */
export function mount(host, sid) {
  const shell = document.createElement('div');
  shell.className = 'ext-panel';
  shell.dataset.ext = 'puppets';
  const el = document.createElement('div');
  shell.append(el);
  document.body.append(shell);
  const off = host.panels.get('puppets').mount(el, { sid, worldId: host.sessions.find((s) => s.id === sid)?.worldId ?? null, params: {} });
  return { el, $: (s) => el.querySelector(s), $$: (s) => [...el.querySelectorAll(s)], unmount: () => { off?.(); shell.remove(); } };
}

export const calls = (host, path) => host.calls.filter((c) => c.path === path);
export const gmcpSent = (host, pkg) => host.sends('gmcp').filter((s) => s.pkg === pkg);

/** The JSON-schema subset the host checks contracts with (type lists, required, properties, items, enum, $ref). */
export function validate(schema, data, root = schema, path = '$') {
  if (schema.$ref) { const m = /^#\/\$defs\/(.+)$/.exec(schema.$ref); const t = m ? root.$defs?.[m[1]] : undefined; if (!t) return `${path}: unknown $ref`; return validate(t, data, root, path); }
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (schema.type) { const want = [].concat(schema.type), got = typeOf(data); if (!want.some((t) => t === got || (t === 'number' && got === 'integer'))) return `${path}: expected ${want.join(' or ')}, got ${got}`; }
  if (schema.enum && !schema.enum.includes(data)) return `${path}: not one of`;
  if (typeOf(data) === 'object') {
    for (const r of schema.required ?? []) if (!(r in data) || data[r] === undefined) return `${path}.${r}: required`;
    for (const [k, v] of Object.entries(data)) { const ps = schema.properties?.[k]; if (ps) { const e = validate(ps, v, root, `${path}.${k}`); if (e) return e; } }
  }
  if (typeOf(data) === 'array' && schema.items) for (let i = 0; i < data.length; i++) { const e = validate(schema.items, data[i], root, `${path}[${i}]`); if (e) return e; }
  return null;
}

/** Bundle one src module with esbuild so a test can import its exports. */
export async function load(rel) {
  const { build } = await import('esbuild');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const r = await build({ entryPoints: [join(ROOT, rel)], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent', external: ['@muclient/sdk'] });
  const dir = join(ROOT, 'node_modules', '.cache', 'ext-puppets-test');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${rel.replace(/\W+/g, '_')}-${process.pid}.mjs`);
  writeFileSync(out, r.outputFiles[0].contents);
  return import(pathToFileURL(out).href);
}
