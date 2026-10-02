/**
 * @runmu.sh/ext-puppets: remote puppet viewpoints, after Underspire's puppets view.
 *
 * GMCP in (checked by the host against schema/*.json): Client.Puppets.Manifest / Feed / Scene / Sync.
 * Out: Client.Puppets.Resync (when a puppet is opened), Client.Puppets.Command (the `puppets.cmd` action, falling
 * back to `@puppet {npc} = {cmd}`), Client.Puppets.Add (the `puppets.add` action, for other extensions).
 * A 300-line buffer per puppet. The unread total is the badge on the panel's tab. The API is `ctx.exports`.
 */
import { defineExtension, h, type ActionSession as HostSession, type Dispose, type Mu, type PanelMountCtx } from '@muclient/sdk';
import { CSS } from './css';
import { ansiRuns, badgeText, bySlot, fileName, isHtml, npcOf, plain } from './text';
import type { ActionArgs, ActionHandler, ActionSession, AddResult, FeedLine, Mode, Puppet, PuppetsApi, RequestHandler, Scene, Source } from './types';

const P = 'Client.Puppets';
const PANEL = 'puppets';
export const BUFFER = 300;
/** Resync gets no answer (an api-only world, an old server): stop showing LOADING VIEWPOINT. */
const RESYNC_MS = 4000;
const ACTIONS = { cmd: 'puppets.cmd', add: 'puppets.add' } as const;
type ActionName = keyof typeof ACTIONS;

interface Pup { p: Puppet & { npc_id: string }; lines: FeedLine[]; scene: Scene | null; unread: number; revision: number; syncing: boolean; timer?: ReturnType<typeof setTimeout> }
interface St { pups: Map<string, Pup>; open: string | null; mounted: number }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const lineOk = (l: unknown): l is FeedLine => isObj(l) && typeof l.body === 'string';
const idOk = (v: unknown): v is string | number => typeof v === 'string' || typeof v === 'number';

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    const subs = ctx.subscriptions;

    // ── per-session state (dropped when the session closes) ──
    const states = new Map<string, St>();
    const S = (sid: string): St => states.get(sid) ?? states.set(sid, { pups: new Map(), open: null, mounted: 0 }).get(sid)!;
    const redraws = new Set<() => void>();
    const lastBadge = new Map<string, number>();
    const watchers = new Set<{ sid: string | undefined; fn: (p: readonly Puppet[]) => void }>();
    subs.push(mu.sessions.each((s) => () => {
      const st = states.get(s.id);
      for (const p of st?.pups.values() ?? []) clearTimeout(p.timer);
      states.delete(s.id);
      lastBadge.delete(s.id);
    }));

    const active = () => mu.sessions.active()?.id ?? null;
    const need = (sid?: string) => { const s = sid ?? active(); if (!s) throw new Error('puppets: no active session'); return s; };
    const sessionOf = (sid: string) => mu.sessions.list().find((s) => s.id === sid) ?? null;

    // ── settings: Show panel (the host's row, from `show: 'auto'`), Driven by, and the actions' via/command ──
    mu.ui.style(CSS);
    mu.settings.define({
      title: 'Puppets',
      items: [{ key: 'puppets.source', label: 'Driven by', default: 'both', kind: 'select', scope: 'world', group: 'Puppets', options: [{ value: 'both', label: 'gmcp + api' }, { value: 'gmcp', label: 'gmcp' }, { value: 'api', label: 'api' }] }],
    });
    const setting = <T>(key: string, sid: string | null, fallback: T): T => {
      try { const v = mu.settings.get<T>(key, sid ? { sid } : undefined); return v === undefined || v === null ? fallback : v; } catch { return fallback; }
    };
    const mode = (sid: string | null): Mode => { const v = setting<string>('puppets.enabled', sid, 'auto'); return v === 'off' || v === 'on' ? v : 'auto'; };
    const source = (sid: string | null): Source => { const v = setting<string>('puppets.source', sid, 'both'); return v === 'gmcp' || v === 'api' ? v : 'both'; };
    const acceptsGmcp = (sid: string) => mode(sid) !== 'off' && source(sid) !== 'api';
    const acceptsApi = (sid: string) => mode(sid) !== 'off' && source(sid) !== 'gmcp';

    mu.actions.define({
      id: ACTIONS.cmd, label: 'Command', group: 'Puppets', via: 'gmcp', command: '@puppet {npc} = {cmd}',
      gmcp: (v) => [`${P}.Command`, { npc_id: v.npc, cmd: v.cmd }], args: { npc: { label: 'puppet npc id' }, cmd: { label: 'command' } },
    });
    // No command fallback by default: a world whose game has one sets it (Settings → Extensions → Puppets).
    mu.actions.define({
      id: ACTIONS.add, label: 'Add puppet', group: 'Puppets', via: 'gmcp', command: '',
      gmcp: (v) => [`${P}.Add`, { npc_id: v.npc }], args: { npc: { label: 'npc id' } },
    });

    // ── the model ──
    const list = (sid: string): Pup[] => [...S(sid).pups.values()].sort((a, b) => bySlot(a.p, b.p));
    const total = (sid: string) => [...S(sid).pups.values()].reduce((n, p) => n + p.unread, 0);
    let registered = false;
    const badge = (sid: string) => {
      if (!registered) return;
      const n = total(sid);
      if (lastBadge.get(sid) === n) return;
      lastBadge.set(sid, n);
      try { mu.panels.badge(PANEL, n ? { count: n } : null, sid); } catch (e) { mu.log.warn('badge failed', e); }
    };
    const changed = (sid: string, roster = false) => {
      badge(sid);
      for (const f of [...redraws]) f();
      if (roster) {
        const now = list(sid).map((p) => ({ ...p.p }));
        for (const w of [...watchers]) if ((w.sid ?? active()) === sid) { try { w.fn(now); } catch (e) { mu.log.error('puppets watch failed', e); } }
      }
    };
    const touch = (sid: string) => { if (registered) { try { mu.panels.touch(PANEL, sid); } catch { /* not offered */ } } };
    const isOpen = (sid: string, id: string) => { const st = S(sid); return st.open === id && st.mounted > 0; };

    const pupOf = (sid: string, id: string): Pup => {
      const st = S(sid);
      let p = st.pups.get(id);
      if (!p) { p = { p: { npc_id: id }, lines: [], scene: null, unread: 0, revision: 0, syncing: false }; st.pups.set(id, p); }
      return p;
    };
    const setManifest = (sid: string, puppets: unknown[]) => {
      const st = S(sid);
      const rows = puppets.filter((x): x is Puppet => isObj(x) && idOk(x.npc_id));
      const ids = new Set(rows.map((p) => String(p.npc_id)));
      for (const [id, p] of [...st.pups]) if (!ids.has(id)) { clearTimeout(p.timer); st.pups.delete(id); }
      for (const r of rows) {
        const q = pupOf(sid, String(r.npc_id));
        q.p = { npc_id: String(r.npc_id), ...(r.slot !== undefined ? { slot: r.slot } : {}), ...(typeof r.name === 'string' ? { name: r.name } : q.p.name ? { name: q.p.name } : {}) };
      }
      if (st.open && !st.pups.has(st.open)) st.open = null;
      if (rows.length) touch(sid);
      changed(sid, true);
    };
    const pushFeed = (sid: string, id: string, lines: unknown[]) => {
      const ok = lines.filter(lineOk);
      const isNew = !S(sid).pups.has(id);
      const p = pupOf(sid, id);
      p.lines.push(...ok);
      if (p.lines.length > BUFFER) p.lines.splice(0, p.lines.length - BUFFER);
      for (const l of ok) if (typeof l.revision === 'number') p.revision = Math.max(p.revision, l.revision);
      if (!isOpen(sid, id)) p.unread += ok.filter((l) => l.news === 'room').length;
      touch(sid);
      changed(sid, isNew);
    };
    const setScene = (sid: string, id: string, sc: Scene) => {
      const isNew = !S(sid).pups.has(id);
      const p = pupOf(sid, id);
      p.scene = { ...(isObj(sc.room) ? { room: sc.room } : {}), ...(Array.isArray(sc.occupants) ? { occupants: sc.occupants.map(String) } : {}), ...(Array.isArray(sc.exits) ? { exits: sc.exits.map(String) } : {}), ...(typeof sc.revision === 'number' ? { revision: sc.revision } : {}) };
      if (typeof sc.revision === 'number') p.revision = Math.max(p.revision, sc.revision);
      changed(sid, isNew);
    };
    const sync = (sid: string, d: { npc_id: string | number; revision?: number; lines?: unknown; scene?: Scene }) => {
      const isNew = !S(sid).pups.has(String(d.npc_id));
      const p = pupOf(sid, String(d.npc_id));
      p.lines = (Array.isArray(d.lines) ? d.lines.filter(lineOk) : []).slice(-BUFFER);
      if (isObj(d.scene)) { p.scene = null; setScene(sid, String(d.npc_id), d.scene); }
      if (typeof d.revision === 'number') p.revision = d.revision;
      p.syncing = false;
      clearTimeout(p.timer);
      changed(sid, isNew);
    };

    // ── actions and requests ──
    const requests = new Set<RequestHandler>();
    const oldSession = (s: { sid: string; worldId: string; character: string }): ActionSession => ({
      ...s, send: (c) => mu.sessions.send(c, { sid: s.sid }), gmcp: async (pkg, data) => (await mu.gmcp.send(pkg, data, { sid: s.sid })) === true,
    });
    const resync = async (sid: string, id: string, revision: number) => {
      const hs = [...requests];
      const sess = sessionOf(sid);
      if (hs.length) {
        for (const fn of hs) { try { await fn({ npc_id: id, revision }, oldSession({ sid, worldId: sess?.worldId ?? '', character: sess?.character ?? '' })); } catch (e) { mu.log.error('resync handler failed', e); } }
        return;
      }
      if (source(sid) !== 'api') await mu.gmcp.send(`${P}.Resync`, { npc_id: id, revision }, { sid });
    };
    const openPuppet = (sid: string, id: string | null) => {
      const st = S(sid);
      if (id === null) { st.open = null; changed(sid); return; }
      const p = st.pups.get(id);
      if (!p) return;
      st.open = id;
      p.unread = 0;
      p.syncing = true;
      clearTimeout(p.timer);
      p.timer = setTimeout(() => { if (p.syncing) { p.syncing = false; changed(sid); } }, RESYNC_MS);
      changed(sid);
      void resync(sid, id, p.revision);
    };
    const run = (a: ActionName, vars: Record<string, string>, sid: string) => mu.actions.run(ACTIONS[a], vars, { sid });
    const shows = (a: ActionName, sid: string | null) => !!sid && mu.actions.visible(ACTIONS[a], sid) !== false;

    // ── GMCP ──
    subs.push(mu.gmcp.on(P, (data, meta) => {
      const { sid, pkg } = meta;
      const sub = pkg.slice(P.length + 1).toLowerCase();
      if (!acceptsGmcp(sid) || !isObj(data)) return;
      // A replayed Feed is only the last batch: counting it again would be wrong. Snapshots replay fine.
      if (sub === 'manifest') { if (Array.isArray(data.puppets)) setManifest(sid, data.puppets); }
      else if (sub === 'feed') { if (!meta.replay && idOk(data.npc_id) && Array.isArray(data.lines)) pushFeed(sid, String(data.npc_id), data.lines); }
      else if (sub === 'scene') { if (idOk(data.npc_id)) setScene(sid, String(data.npc_id), data as Scene); }
      else if (sub === 'sync') { if (idOk(data.npc_id)) sync(sid, data as never); }
    }));

    // ── the panel ──
    const body = (l: FeedLine): Node[] => {
      if (isHtml(l.body)) return [mu.ui.sanitize(l.body, 'inline')];
      return ansiRuns(l.body).map((r) => (r.fg === null && !r.bold ? document.createTextNode(r.text) : h('span', { class: [r.fg !== null ? `a${r.fg}` : '', r.bold ? 'b' : ''].filter(Boolean).join(' ') }, r.text)));
    };
    const save = async (p: Pup) => {
      if (!p.lines.length) return;
      await mu.files.save({ name: fileName(p.p.npc_id), type: 'text/plain;charset=utf-8', data: p.lines.map((l) => plain(l.body)).join('\n') });
    };
    const clear = async (sid: string, p: Pup) => {
      if (!p.lines.length) return;
      const who = p.p.name ?? `#${p.p.npc_id}`;
      if (!(await mu.ui.confirm({ title: `Clear ${who}'s buffer?`, confirm: 'Clear', danger: true }))) return;
      p.lines = [];
      changed(sid);
    };

    function mount(el: HTMLElement, pc: PanelMountCtx): Dispose {
      const root = h('section', { class: 'puppets', 'data-testid': 'puppets', role: 'region', 'aria-label': 'Remote puppet viewpoints' });
      el.append(root);
      const sid0 = pc.sid;
      const sidOf = () => sid0 ?? active();
      if (sid0) S(sid0).mounted++;
      let feedAtEnd = true, shown: string | null = null, focusInput = false;
      const fill = (...kids: Array<Node | null>) => root.replaceChildren(...kids.filter((k): k is Node => !!k));
      const draw = () => {
        const sid = sidOf();
        const was = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
        if (!sid) { fill(h('p', { class: 'empty' }, 'No session')); return; }
        const st = S(sid);
        const p = st.open ? st.pups.get(st.open) : undefined;
        if (!p) {
          shown = null;
          const rows = list(sid);
          fill(rows.length ? h('div', { class: 'list', 'data-testid': 'puppets-list' }, rows.map((q) => {
            const id = q.p.npc_id;
            return h('button', { class: `${mu.ui.css.row} row prow${q.unread ? ` ${mu.ui.css.hot}` : ''}`, type: 'button', 'data-id': id, 'data-focus': `row-${id}`, onclick: () => { focusInput = true; openPuppet(sid, id); } },
              h('strong', null, `P${q.p.slot ?? ''}`), h('span', { class: 'name' }, q.p.name ?? `#${id}`), h('small', null, `#${id}`),
              h('span', { class: 'where' }, q.scene?.room?.name ?? ''),
              q.unread ? h('span', { class: 'pbadge', 'data-testid': 'puppet-unread', 'aria-label': `${q.unread} unread` }, badgeText(q.unread)) : null);
          })) : h('p', { class: 'empty', 'data-testid': 'puppets-empty' }, 'No remote puppet viewpoints.'));
        } else {
          const id = p.p.npc_id, name = p.p.name ?? `#${id}`;
          if (shown !== id) { shown = id; feedAtEnd = true; }
          const draft = (root.querySelector('[data-testid=puppet-input]') as HTMLInputElement | null)?.value ?? '';
          const feed = h('div', { class: 'term-feed', 'data-testid': 'puppet-feed', role: 'log', 'aria-live': 'polite' },
            p.lines.map((l) => h('div', { class: `term-line${l.news === 'self' ? ' self' : ''}` }, body(l))),
            p.syncing && !p.lines.length ? h('div', { class: 'sync' }, 'Loading viewpoint') : null);
          const sc = p.scene;
          const tool = (label: string, title: string, focus: string, fn: () => void, testid?: string) =>
            h('button', { class: `${mu.ui.css.cmd} tool ptool`, type: 'button', title, 'aria-label': title, 'data-focus': focus, ...(testid ? { 'data-testid': testid } : {}), disabled: !p.lines.length, onclick: fn }, label);
          let input: HTMLInputElement | null = null;
          const form = shows('cmd', sid) ? h('form', {
            class: 'term-input', onsubmit: async (e: Event) => {
              e.preventDefault();
              const cmd = input!.value.trim();
              if (!cmd) return;
              input!.value = '';
              await run('cmd', { npc: id, cmd }, sid);
            },
          }, h('span', { class: 'prompt', 'aria-hidden': 'true' }, `P${p.p.slot ?? ''}>`),
          (input = h('input', { type: 'text', placeholder: `Act as ${name}`, 'aria-label': `command for ${name}`, autocomplete: 'off', spellcheck: 'false', 'data-testid': 'puppet-input', 'data-focus': 'input' }))) : null;
          if (input) input.value = draft;
          fill(
            h('div', { class: 'term-head' },
              h('button', { class: `${mu.ui.css.cmd} back pback`, type: 'button', title: 'Back to puppet list', 'aria-label': 'Back to puppet list', 'data-testid': 'puppet-back', 'data-focus': 'back', onclick: () => openPuppet(sid, null) }, 'Back'),
              h('strong', null, `P${p.p.slot ?? ''}`), h('span', { class: 'name' }, name), h('small', null, `#${id}`),
              h('span', { class: 'where' }, sc?.room?.name ?? ''),
              tool('Save', 'download buffer', 'dl', () => void save(p), 'puppet-save'),
              tool('Clear', 'clear buffer', 'clear', () => void clear(sid, p), 'puppet-clear')),
            feed,
            sc && (sc.room?.name || sc.occupants?.length || sc.exits?.length) ? h('div', { class: 'pscene', 'data-testid': 'puppet-scene' },
              sc.room?.name ? h('span', { class: 'rn' }, sc.room.name) : null,
              sc.occupants?.length ? h('span', null, h('span', { class: 'lk' }, 'here'), sc.occupants.join(', ')) : null,
              sc.exits?.length ? h('span', null, h('span', { class: 'lk' }, 'exits'), sc.exits.join(' · ')) : null) : null,
            form);
          if (feedAtEnd) feed.scrollTop = feed.scrollHeight;
          feed.addEventListener('scroll', () => { feedAtEnd = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 4; });
          if (focusInput && input) { focusInput = false; input.focus({ preventScroll: true }); return; }
        }
        focusInput = false;
        if (was) (root.querySelector(`[data-focus="${was}"]`) as HTMLElement | null)?.focus();
      };
      redraws.add(draw);
      const off = mu.sessions.on('switch', () => draw());
      draw();
      return () => { redraws.delete(draw); off(); if (sid0) { const st = states.get(sid0); if (st) st.mounted = Math.max(0, st.mounted - 1); } root.remove(); };
    }

    mu.panels.register({ id: PANEL, title: 'Puppets', singleton: true, defaultPosition: 'right-top', show: 'auto', order: 60, mount });
    registered = true;
    for (const s of mu.sessions.list()) { badge(s.id); if (list(s.id).length) touch(s.id); }

    // Core.Supports while Puppets is not off in the active session's world (as before: off withdraws it).
    let supportsOff: Dispose | null = null;
    const syncSupports = () => {
      const want = mode(active()) !== 'off';
      if (want && !supportsOff) supportsOff = mu.gmcp.supports([`${P} 1`]);
      if (!want && supportsOff) { supportsOff(); supportsOff = null; }
    };
    syncSupports();
    subs.push(() => { supportsOff?.(); supportsOff = null; }, mu.sessions.on('switch', () => syncSupports()));
    try { subs.push(mu.settings.watch('puppets.enabled', () => { syncSupports(); for (const f of [...redraws]) f(); })); } catch { /* the row is the host's; an older host has none */ }

    // ── the exported API (one per calling extension; what it registers goes when it is disabled) ──
    const wrap = (name: string, fn: ActionHandler) => (args: Record<string, string>, s: HostSession) =>
      fn({ action: name, npc: args.npc ?? '', ...args } as ActionArgs, oldSession(s));
    const configure: PuppetsApi['configure'] = (cfg, w) => {
      const set = (key: string, v: unknown) => mu.settings.set(`puppets.${key}`, v, w);
      for (const a of Object.keys(cfg.actions ?? {})) if (!(a in ACTIONS)) throw new Error(`Puppets: no action "${a}"`);
      if (cfg.enabled) set('enabled', cfg.enabled);
      if (cfg.source) set('source', cfg.source);
      for (const [a, c] of Object.entries(cfg.actions ?? {})) {
        if (c.via) set(`action.${a}.via`, c.via);
        if (c.cmd !== undefined) set(`action.${a}.cmd`, c.cmd);
      }
      for (const [o, v] of Object.entries(cfg.options ?? {})) set(o, v);
      syncSupports();
      for (const f of [...redraws]) f();
    };
    const api = (track: (d: Dispose) => Dispose): PuppetsApi => ({
      enable: (m, w) => configure({ enabled: m }, w),
      open(npcId) { mu.panels.open(PANEL); const s = active(); if (s && npcId !== undefined) openPuppet(s, String(npcId)); },
      set(what: 'manifest' | 'scene', a: any, b?: any, c?: string) {
        if (what === 'manifest') { const s = need(b); if (acceptsApi(s)) setManifest(s, Array.isArray(a?.puppets) ? a.puppets : []); }
        else { const s = need(c); if (acceptsApi(s) && isObj(b)) setScene(s, String(a), b as Scene); }
      },
      push: (_w, d, sid) => { const s = need(sid); if (acceptsApi(s) && idOk(d?.npc_id)) pushFeed(s, String(d.npc_id), Array.isArray(d.lines) ? d.lines : []); },
      sync: (d, sid) => { const s = need(sid); if (acceptsApi(s) && idOk(d?.npc_id)) sync(s, d); },
      get(what: 'manifest' | 'feed', a?: any, b?: string): any {
        if (what === 'manifest') return list(need(a)).map((p) => ({ ...p.p }));
        return [...(S(need(b)).pups.get(String(a))?.lines ?? [])];
      },
      unread: (sid) => total(need(sid)),
      onAction: (a, fn) => {
        if (!(a in ACTIONS)) throw new Error(`Puppets: no action "${a}"`);
        return track(mu.actions.handle(ACTIONS[a as ActionName], wrap(a, fn)));
      },
      onRequest: (k, fn) => {
        if (k !== 'resync') throw new Error(`Puppets: no request "${k}"`);
        requests.add(fn);
        return track(() => { requests.delete(fn); });
      },
      configure,
      async add(npc, sid): Promise<AddResult> {
        const n = npcOf(npc);
        if (!n) throw new Error('Puppets.add: an npc id, or { npc_id, name? }');
        const s = sid ?? active();
        if (!s || !sessionOf(s) || mode(s) === 'off') return 'hidden';
        if (S(s).pups.has(n.id)) return 'present';
        return run('add', { npc: n.id, ...(n.name ? { name: n.name } : {}) }, s);
      },
      has: (npcId, sid) => { const s = sid ?? active(); return !!s && S(s).pups.has(String(npcId).replace(/^#/, '')); },
      canAdd: (sid) => { const s = sid ?? active(); return !!s && !!sessionOf(s) && mode(s) !== 'off' && shows('add', s); },
      watch(fn, sid) {
        const w = { sid, fn };
        watchers.add(w);
        const s = sid ?? active();
        if (s) { try { fn(list(s).map((p) => ({ ...p.p }))); } catch (e) { mu.log.error('puppets watch failed', e); } }
        return track(() => { watchers.delete(w); });
      },
    });
    ctx.exports((caller) => api((d) => caller.track(d)));
  },
});
