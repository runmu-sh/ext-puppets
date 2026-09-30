/**
 * @runmu.sh/ext-puppets: remote puppet viewpoints (R-MOD-PUPPETS), after Underspire's template
 * 7493–7500 (06-world-modules §5). GMCP in: Client.Puppets.Manifest / Feed / Scene / Sync. Out:
 * Client.Puppets.Resync (on open) and Client.Puppets.Command (the `cmd` action, default via gmcp,
 * falling back to `@puppet {npc} = {cmd}` when GMCP can't be sent). A 300-line buffer per puppet.
 * The panel title is "Puppets (N)" with N the total unread. `activate` returns the PuppetsApi.
 */
import { defineExtension, type Dispose, type Mu, type PanelMountCtx } from '@muclient/sdk';
import { WorldModule, replay } from '@runmu.sh/ext-kit/module';
import { MODULE_CSS } from '@runmu.sh/ext-kit/css';
import { h, fill } from '@runmu.sh/ext-kit/dom';
import type { Schema } from '@runmu.sh/ext-kit/schema';
import type { FeedLine, Puppet, PuppetsApi, Scene } from './types';

const P = 'Client.Puppets';
export const BUFFER = 300;
const idS: Schema = { type: ['string', 'integer'] };
const lineS: Schema = { type: 'object', required: ['body'], properties: { body: { type: 'string' }, revision: { type: 'number' }, news: { type: 'string' } } };
const sceneS: Schema = { type: 'object', properties: { room: { type: 'object', properties: { name: { type: 'string' }, desc: { type: 'string' } } }, occupants: { type: 'array', items: { type: 'string' } }, exits: { type: 'array', items: { type: 'string' } }, revision: { type: 'number' } } };
const SCHEMAS: Record<string, Schema> = {
  Manifest: { type: 'object', required: ['puppets'], properties: { puppets: { type: 'array', items: { type: 'object', required: ['npc_id'], properties: { npc_id: idS, slot: { type: ['integer', 'string'] }, name: { type: 'string' } } } } } },
  Feed: { type: 'object', required: ['npc_id', 'lines'], properties: { npc_id: idS, lines: { type: 'array', items: lineS } } },
  Scene: { ...sceneS, required: ['npc_id'], properties: { ...sceneS.properties, npc_id: idS } },
  Sync: { type: 'object', required: ['npc_id', 'lines'], properties: { npc_id: idS, revision: { type: 'number' }, lines: { type: 'array', items: lineS }, scene: sceneS } },
};

interface Pup { p: Puppet; lines: FeedLine[]; scene: Scene | null; unread: number; revision: number; syncing: boolean }
interface St { order: string[]; pups: Map<string, Pup> }

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    const stOf = new Map<string, St>();
    const S = (sid: string) => stOf.get(sid) ?? stOf.set(sid, { order: [], pups: new Map() }).get(sid)!;
    const active = () => mu.sessions.active()?.id ?? null;
    const need = (sid?: string) => { const s = sid ?? active(); if (!s) throw new Error('no active session'); return s; };
    const views = new Map<string, { open: string | null }>();
    const viewOf = (sid: string) => views.get(sid) ?? views.set(sid, { open: null }).get(sid)!;

    const mod = new WorldModule(mu, {
      key: 'puppets', title: 'Puppets', panels: ['puppets'], pkg: P,
      actions: { cmd: { label: 'Command', via: 'gmcp', cmd: '@puppet {npc} = {cmd}' } },
      gmcpAction: (_a, v) => [`${P}.Command`, { npc_id: v.npc, cmd: v.cmd }],
    });
    mu.ui.style(MODULE_CSS);
    mu.settings.define({ title: 'Puppets', items: mod.settingItems() });

    const redraws = new Set<() => void>();
    const total = (sid: string | null) => (sid ? [...S(sid).pups.values()].reduce((n, p) => n + p.unread, 0) : 0);
    let lastTitle = '';
    let registered = false; // GMCP replayed during activate may land before the panel exists
    const retitle = () => {
      if (!registered) return;
      const n = total(active());
      const t = n ? `Puppets (${n})` : 'Puppets';
      if (t !== lastTitle) { lastTitle = t; mu.panels.update('puppets', { title: t }); }
    };
    const redraw = () => { redraws.forEach((f) => f()); retitle(); };
    /** A line is unread when it is room news and that puppet's terminal isn't the one open. */
    const isOpen = (sid: string, id: string) => viewOf(sid).open === id && openIn.has(sid);
    const openIn = new Set<string>();

    const pupOf = (sid: string, id: string) => {
      const st = S(sid);
      let p = st.pups.get(id);
      if (!p) { p = { p: { npc_id: id }, lines: [], scene: null, unread: 0, revision: 0, syncing: false }; st.pups.set(id, p); if (!st.order.includes(id)) st.order.push(id); }
      return p;
    };
    const setManifest = (sid: string, list: Puppet[]) => {
      const st = S(sid);
      const ids = list.map((p) => String(p.npc_id));
      for (const id of [...st.pups.keys()]) if (!ids.includes(id)) st.pups.delete(id);
      for (const p of list) pupOf(sid, String(p.npc_id)).p = { ...p, npc_id: String(p.npc_id) };
      st.order = ids;
      const v = viewOf(sid);
      if (v.open && !st.pups.has(v.open)) v.open = null;
      mod.touched(sid);
      redraw();
    };
    const pushFeed = (sid: string, id: string, lines: FeedLine[]) => {
      const p = pupOf(sid, id);
      p.lines.push(...lines);
      if (p.lines.length > BUFFER) p.lines.splice(0, p.lines.length - BUFFER);
      for (const l of lines) if (typeof l.revision === 'number') p.revision = Math.max(p.revision, l.revision);
      if (!isOpen(sid, id)) p.unread += lines.filter((l) => l.news === 'room').length;
      mod.touched(sid);
      redraw();
    };
    const setScene = (sid: string, id: string, sc: Scene) => { const p = pupOf(sid, id); p.scene = sc; if (typeof sc.revision === 'number') p.revision = Math.max(p.revision, sc.revision); redraw(); };
    const sync = (sid: string, d: { npc_id: string | number; revision?: number; lines: FeedLine[]; scene?: Scene }) => {
      const p = pupOf(sid, String(d.npc_id));
      p.lines = d.lines.slice(-BUFFER);
      if (d.scene) p.scene = d.scene;
      if (typeof d.revision === 'number') p.revision = d.revision;
      p.syncing = false;
      redraw();
    };
    const openPuppet = (sid: string, id: string) => {
      const p = S(sid).pups.get(id);
      if (!p) return;
      viewOf(sid).open = id;
      p.unread = 0;
      p.syncing = true;
      redraw();
      void mod.request('resync', `${P}.Resync`, { npc_id: id, revision: p.revision }, sid);
      // Nothing comes back (api-only world, old server): stop showing "loading viewpoint…".
      setTimeout(() => { if (p.syncing) { p.syncing = false; redraw(); } }, 4000);
    };

    const handle = (pkg: string, data: unknown, sid: string) => {
      const sub = pkg.slice(P.length + 1);
      const schema = SCHEMAS[sub];
      if (!schema || !mod.acceptsGmcp(sid) || !mod.check(sid, pkg, schema, data)) return;
      const d = data as any;
      if (sub === 'Manifest') setManifest(sid, d.puppets);
      else if (sub === 'Feed') pushFeed(sid, String(d.npc_id), d.lines);
      else if (sub === 'Scene') setScene(sid, String(d.npc_id), d);
      else sync(sid, d);
    };
    mu.gmcp.on(P, (data, { sid, pkg }) => handle(pkg, data, sid));
    replay(mu, [`${P}.Manifest`], handle);

    function mount(el: HTMLElement, pc: PanelMountCtx): Dispose {
      el.classList.add('mx', 'puppets');
      el.dataset.testid = 'puppets';
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', 'Remote puppet viewpoints');
      const sidOf = () => pc.sid ?? active();
      let feedAtEnd = true;
      const draw = () => {
        const sid = sidOf();
        const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
        if (!sid) { fill(el, h('p', { class: 'empty' }, 'No session')); return; }
        const st = S(sid), v = viewOf(sid);
        const p = v.open ? st.pups.get(v.open) : undefined;
        if (!p) {
          fill(el, st.order.length ? h('div', { class: 'list', 'data-testid': 'puppets-list' }, st.order.map((id) => {
            const q = st.pups.get(id)!;
            return h('button', { class: `sh-row row prow${q.unread ? ' hot' : ''}`, type: 'button', 'data-id': id, 'data-focus': `row-${id}`, onclick: () => openPuppet(sid, id) },
              h('strong', null, `P${q.p.slot ?? '·'}`), h('span', { class: 'name' }, q.p.name ?? `#${id}`),
              h('small', { class: 'where' }, q.scene?.room?.name ?? ''),
              q.unread ? h('span', { class: 'pbadge', 'data-testid': 'puppet-unread', 'aria-label': `${q.unread} unread` }, String(q.unread)) : null);
          })) : h('p', { class: 'empty', 'data-testid': 'puppets-empty' }, 'No remote puppet viewpoints.'));
        } else {
          const id = String(p.p.npc_id);
          const feed = h('div', { class: 'term-feed', 'data-testid': 'puppet-feed', role: 'log', 'aria-live': 'polite' },
            p.lines.map((l) => h('div', { class: `term-line${l.news === 'self' ? ' self' : ''}` }, l.body)),
            p.syncing && !p.lines.length ? h('div', { class: 'sync' }, 'Loading viewpoint') : null);
          const sc = p.scene;
          fill(el,
            h('div', { class: 'term-head' },
              h('button', { class: 'sh-cmd back pback', type: 'button', title: 'Back to puppet list', 'data-testid': 'puppet-back', 'data-focus': 'back', onclick: () => { v.open = null; draw(); } }, 'Back'),
              h('strong', null, `P${p.p.slot ?? '·'}`), h('span', { class: 'name' }, p.p.name ?? `#${id}`),
              h('small', { class: 'where' }, sc?.room?.name ?? ''),
              h('button', { class: 'sh-cmd tool ptool', type: 'button', title: 'download buffer', 'aria-label': 'download buffer', 'data-focus': 'dl', disabled: !p.lines.length, onclick: () => download(p) }, 'Save'),
              h('button', { class: 'sh-cmd tool ptool', type: 'button', title: 'clear buffer', 'aria-label': 'clear buffer', 'data-testid': 'puppet-clear', 'data-focus': 'clear', disabled: !p.lines.length, onclick: () => { p.lines = []; redraw(); } }, 'Clear')),
            feed,
            sc ? h('div', { class: 'pscene', 'data-testid': 'puppet-scene' },
              sc.room?.name ? h('span', { class: 'rn' }, sc.room.name) : null,
              sc.occupants?.length ? h('span', null, h('span', { class: 'lk' }, 'here'), sc.occupants.join(', ')) : null,
              sc.exits?.length ? h('span', null, h('span', { class: 'lk' }, 'exits'), sc.exits.join(' · ')) : null) : null,
            mod.shows('cmd', sid) ? h('form', {
              class: 'term-input', onsubmit: async (e: Event) => {
                e.preventDefault();
                const input = el.querySelector<HTMLInputElement>('[data-testid=puppet-input]')!;
                const cmd = input.value.trim();
                if (!cmd) return;
                input.value = '';
                await mod.run('cmd', { npc: id, cmd }, sid);
              },
            }, h('span', { class: 'prompt', 'aria-hidden': 'true' }, `P${p.p.slot ?? '·'}>`),
              h('input', { type: 'text', 'aria-label': `command for ${p.p.name ?? id}`, autocomplete: 'off', 'data-testid': 'puppet-input', 'data-focus': 'input' })) : null);
          if (feedAtEnd) feed.scrollTop = feed.scrollHeight;
          feed.addEventListener('scroll', () => { feedAtEnd = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 4; });
        }
        if (focused) (el.querySelector(`[data-focus="${focused}"]`) as HTMLElement | null)?.focus();
      };
      const sid0 = sidOf();
      if (sid0) openIn.add(sid0);
      redraws.add(draw);
      const off = mu.sessions.on('switch', () => draw());
      draw();
      return () => { redraws.delete(draw); off(); if (sid0) openIn.delete(sid0); el.replaceChildren(); };
    }
    const download = (p: Pup) => {
      const blob = new Blob([p.lines.map((l) => l.body).join('\n') + '\n'], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `puppet-${p.p.npc_id}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    mu.panels.register({ id: 'puppets', title: 'Puppets', singleton: true, defaultPosition: 'right-bottom', inViewsMenu: false, mount });
    registered = true;
    retitle();
    // Views visibility, Core.Supports and redraws follow the mode and role once the panels exist.
    ctx.subscriptions.push(...mod.bind(), mod.onChange(redraw), mu.sessions.on('switch', () => retitle()));

    const api: PuppetsApi = {
      enable: (mode, w) => mod.configure({ enabled: mode }, w),
      open(npcId) { mu.panels.open('puppets'); const s = active(); if (s && npcId !== undefined) openPuppet(s, String(npcId)); },
      set(what: 'manifest' | 'scene', a: any, b?: any, c?: string) {
        if (what === 'manifest') { const s = need(b); if (mod.acceptsApi(s)) setManifest(s, a.puppets ?? []); }
        else { const s = need(c); if (mod.acceptsApi(s)) setScene(s, String(a), b); }
      },
      push: (_w, d, sid) => { const s = need(sid); if (mod.acceptsApi(s)) pushFeed(s, String(d.npc_id), d.lines ?? []); },
      sync: (d, sid) => { const s = need(sid); if (mod.acceptsApi(s)) sync(s, d); },
      get(what: 'manifest' | 'feed', a?: any, b?: string): any {
        if (what === 'manifest') return [...S(need(a)).order.map((id) => S(need(a)).pups.get(id)!.p)];
        return [...(S(need(b)).pups.get(String(a))?.lines ?? [])];
      },
      unread: (sid) => total(need(sid)),
      onAction: (a, fn) => mod.onAction(a, fn as never),
      onRequest: (k, fn) => mod.onRequest(k, fn as never),
      configure: (cfg, w) => mod.configure(cfg, w),
    };
    return api;
  },
});
