// src/index.ts
import { defineExtension, h } from "@muclient/sdk";

// src/css.ts
var S = '.ext-panel[data-ext="puppets"] .puppets';
var CSS = `
${S} { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; background: var(--bg-elev); color: var(--fg); font-size: 1rem; }
${S} button { font-family: inherit; cursor: pointer; }
${S} button:focus-visible, ${S} input:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }
${S} .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
${S} .row { flex-direction: row; gap: 1ch; align-items: baseline; min-height: 24px; }
${S} .row strong, ${S} .term-head strong, ${S} .prompt { color: var(--gold); font-weight: 400; }
${S} small { color: var(--fg-faint); font-size: .8em; }
${S} .where { margin-left: auto; color: var(--fg-dim); font-size: .8em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .pbadge { margin-left: 6px; min-width: 1.4em; padding: 0 .5ch; background: var(--gold); color: var(--bg-deep); font-size: .64rem; text-align: center; }
${S} .term-head { display: flex; gap: 1ch; align-items: center; padding: 5px 8px 5px 10px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; min-width: 0; }
${S} .term-head .tool { flex: none; }
${S} .term-head .where { max-width: 40%; }
${S} .term-head .where + .tool { margin-left: 0; }
${S} .term-head .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
${S} .term-head small { white-space: nowrap; }
${S} .term-head .spacer { margin-left: auto; }
${S} .term-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
${S} .term-line { color: var(--fg); font-size: .9em; white-space: pre-wrap; word-break: break-word; }
${S} .term-line.self { color: var(--fg-dim); }
${S} .term-line a { color: var(--accent-bright); }
${S} .term-line .b { font-weight: 500; }
${S} .term-line .a0 { color: var(--ansi-0); } ${S} .term-line .a1 { color: var(--ansi-1); } ${S} .term-line .a2 { color: var(--ansi-2); } ${S} .term-line .a3 { color: var(--ansi-3); }
${S} .term-line .a4 { color: var(--ansi-4); } ${S} .term-line .a5 { color: var(--ansi-5); } ${S} .term-line .a6 { color: var(--ansi-6); } ${S} .term-line .a7 { color: var(--ansi-7); }
${S} .term-line .a8 { color: var(--ansi-8); } ${S} .term-line .a9 { color: var(--ansi-9); } ${S} .term-line .a10 { color: var(--ansi-10); } ${S} .term-line .a11 { color: var(--ansi-11); }
${S} .term-line .a12 { color: var(--ansi-12); } ${S} .term-line .a13 { color: var(--ansi-13); } ${S} .term-line .a14 { color: var(--ansi-14); } ${S} .term-line .a15 { color: var(--ansi-15); }
${S} .pscene { border-top: 1px solid var(--border); padding: 4px 10px; font-size: .74rem; color: var(--fg-dim); display: flex; flex-direction: column; gap: 1px; flex: 0 0 auto; }
${S} .pscene .rn { color: var(--accent-bright); text-transform: uppercase; letter-spacing: .16em; font-size: .7rem; }
${S} .pscene .lk { color: var(--fg-faint); text-transform: uppercase; letter-spacing: .12em; font-size: .6rem; margin-right: .6ch; }
${S} .term-input { display: flex; gap: .8ch; align-items: center; padding: 6px 10px; border-top: 1px solid var(--accent); flex: 0 0 auto; }
${S} .term-input input { flex: 1; min-width: 0; background: transparent; border: 0; border-radius: 0; outline: none; color: var(--fg); padding: 3px 0; font: inherit; caret-color: var(--accent-bright); min-height: 24px; }
${S} .term-input input::placeholder { color: var(--fg-faint); font-style: normal; letter-spacing: .14em; text-transform: uppercase; font-size: .66rem; opacity: 1; }
${S} .sync, ${S} .empty { color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 10px; margin: 0; }
@media (max-width: 420px) { ${S} button { min-height: 32px; } }
`;

// src/text.ts
var isHtml = (s) => /<\/?(?:span|div|p|br|b|i|u|em|strong|code|a)\b/i.test(s);
var ESC = /\u001b\[([0-9;]*)([A-Za-z])|\u001b[^[]?/g;
function ansiRuns(s) {
  const out = [];
  let fg = null, bold = false, last = 0;
  const push = (t) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.fg === fg && prev.bold === bold) prev.text += t;
    else out.push({ text: t, fg, bold });
  };
  for (const m of s.matchAll(ESC)) {
    push(s.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    if (m[2] !== "m") continue;
    const codes = (m[1] || "0").split(";").map((x) => Number(x || 0));
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) {
        fg = null;
        bold = false;
      } else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c === 39) fg = null;
      else if (c >= 30 && c <= 37) fg = c - 30;
      else if (c >= 90 && c <= 97) fg = c - 90 + 8;
      else if (c === 38 && codes[i + 1] === 5) {
        const n = codes[i + 2];
        fg = n >= 0 && n < 16 ? n : null;
        i += 2;
      } else if (c === 38 && codes[i + 1] === 2) i += 4;
    }
  }
  push(s.slice(last));
  return out;
}
function plain(s) {
  if (!isHtml(s)) return ansiRuns(s).map((r) => r.text).join("");
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div)>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n+$/, "");
}
var fileName = (npc, now = /* @__PURE__ */ new Date()) => `puppet-${npc}-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
var badgeText = (n) => n > 99 ? "99+" : String(n);
function npcOf(ref) {
  if (typeof ref === "string" || typeof ref === "number") {
    const id = String(ref).trim().replace(/^#/, "");
    return id ? { id } : null;
  }
  if (ref && typeof ref === "object") {
    const o = ref;
    const raw = o.npc_id ?? o.id;
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    const id = String(raw).trim().replace(/^#/, "");
    return id ? { id, ...typeof o.name === "string" && o.name ? { name: o.name } : {} } : null;
  }
  return null;
}
function bySlot(a, b) {
  const sa = Number(a.slot ?? Infinity), sb = Number(b.slot ?? Infinity);
  if (sa !== sb) return (Number.isNaN(sa) ? Infinity : sa) - (Number.isNaN(sb) ? Infinity : sb) || 0;
  const na = Number(a.npc_id), nb = Number(b.npc_id);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a.npc_id).localeCompare(String(b.npc_id));
}

// src/index.ts
var P = "Client.Puppets";
var PANEL = "puppets";
var BUFFER = 300;
var RESYNC_MS = 4e3;
var ACTIONS = { cmd: "puppets.cmd", add: "puppets.add" };
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var lineOk = (l) => isObj(l) && typeof l.body === "string";
var idOk = (v) => typeof v === "string" || typeof v === "number";
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    const subs = ctx.subscriptions;
    const states = /* @__PURE__ */ new Map();
    const S2 = (sid) => states.get(sid) ?? states.set(sid, { pups: /* @__PURE__ */ new Map(), open: null, mounted: 0 }).get(sid);
    const redraws = /* @__PURE__ */ new Set();
    const lastBadge = /* @__PURE__ */ new Map();
    const watchers = /* @__PURE__ */ new Set();
    subs.push(mu.sessions.each((s) => () => {
      const st = states.get(s.id);
      for (const p of st?.pups.values() ?? []) clearTimeout(p.timer);
      states.delete(s.id);
      lastBadge.delete(s.id);
    }));
    const active = () => mu.sessions.active()?.id ?? null;
    const need = (sid) => {
      const s = sid ?? active();
      if (!s) throw new Error("puppets: no active session");
      return s;
    };
    const sessionOf = (sid) => mu.sessions.list().find((s) => s.id === sid) ?? null;
    mu.ui.style(CSS);
    mu.settings.define({
      title: "Puppets",
      items: [{ key: "puppets.source", label: "Driven by", default: "both", kind: "select", scope: "world", group: "Puppets", options: [{ value: "both", label: "gmcp + api" }, { value: "gmcp", label: "gmcp" }, { value: "api", label: "api" }] }]
    });
    const setting = (key, sid, fallback) => {
      try {
        const v = mu.settings.get(key, sid ? { sid } : void 0);
        return v === void 0 || v === null ? fallback : v;
      } catch {
        return fallback;
      }
    };
    const mode = (sid) => {
      const v = setting("puppets.enabled", sid, "auto");
      return v === "off" || v === "on" ? v : "auto";
    };
    const source = (sid) => {
      const v = setting("puppets.source", sid, "both");
      return v === "gmcp" || v === "api" ? v : "both";
    };
    const acceptsGmcp = (sid) => mode(sid) !== "off" && source(sid) !== "api";
    const acceptsApi = (sid) => mode(sid) !== "off" && source(sid) !== "gmcp";
    mu.actions.define({
      id: ACTIONS.cmd,
      label: "Command",
      group: "Puppets",
      via: "gmcp",
      command: "@puppet {npc} = {cmd}",
      gmcp: (v) => [`${P}.Command`, { npc_id: v.npc, cmd: v.cmd }],
      args: { npc: { label: "puppet npc id" }, cmd: { label: "command" } }
    });
    mu.actions.define({
      id: ACTIONS.add,
      label: "Add puppet",
      group: "Puppets",
      via: "gmcp",
      command: "",
      gmcp: (v) => [`${P}.Add`, { npc_id: v.npc }],
      args: { npc: { label: "npc id" } }
    });
    const list = (sid) => [...S2(sid).pups.values()].sort((a, b) => bySlot(a.p, b.p));
    const total = (sid) => [...S2(sid).pups.values()].reduce((n, p) => n + p.unread, 0);
    let registered = false;
    const badge = (sid) => {
      if (!registered) return;
      const n = total(sid);
      if (lastBadge.get(sid) === n) return;
      lastBadge.set(sid, n);
      try {
        mu.panels.badge(PANEL, n ? { count: n } : null, sid);
      } catch (e) {
        mu.log.warn("badge failed", e);
      }
    };
    const changed = (sid, roster = false) => {
      badge(sid);
      for (const f of [...redraws]) f();
      if (roster) {
        const now = list(sid).map((p) => ({ ...p.p }));
        for (const w of [...watchers]) if ((w.sid ?? active()) === sid) {
          try {
            w.fn(now);
          } catch (e) {
            mu.log.error("puppets watch failed", e);
          }
        }
      }
    };
    const touch = (sid) => {
      if (registered) {
        try {
          mu.panels.touch(PANEL, sid);
        } catch {
        }
      }
    };
    const isOpen = (sid, id) => {
      const st = S2(sid);
      return st.open === id && st.mounted > 0;
    };
    const pupOf = (sid, id) => {
      const st = S2(sid);
      let p = st.pups.get(id);
      if (!p) {
        p = { p: { npc_id: id }, lines: [], scene: null, unread: 0, revision: 0, syncing: false };
        st.pups.set(id, p);
      }
      return p;
    };
    const setManifest = (sid, puppets) => {
      const st = S2(sid);
      const rows = puppets.filter((x) => isObj(x) && idOk(x.npc_id));
      const ids = new Set(rows.map((p) => String(p.npc_id)));
      for (const [id, p] of [...st.pups]) if (!ids.has(id)) {
        clearTimeout(p.timer);
        st.pups.delete(id);
      }
      for (const r of rows) {
        const q = pupOf(sid, String(r.npc_id));
        q.p = { npc_id: String(r.npc_id), ...r.slot !== void 0 ? { slot: r.slot } : {}, ...typeof r.name === "string" ? { name: r.name } : q.p.name ? { name: q.p.name } : {} };
      }
      if (st.open && !st.pups.has(st.open)) st.open = null;
      if (rows.length) touch(sid);
      changed(sid, true);
    };
    const pushFeed = (sid, id, lines) => {
      const ok = lines.filter(lineOk);
      const isNew = !S2(sid).pups.has(id);
      const p = pupOf(sid, id);
      p.lines.push(...ok);
      if (p.lines.length > BUFFER) p.lines.splice(0, p.lines.length - BUFFER);
      for (const l of ok) if (typeof l.revision === "number") p.revision = Math.max(p.revision, l.revision);
      if (!isOpen(sid, id)) p.unread += ok.filter((l) => l.news === "room").length;
      touch(sid);
      changed(sid, isNew);
    };
    const setScene = (sid, id, sc) => {
      const isNew = !S2(sid).pups.has(id);
      const p = pupOf(sid, id);
      p.scene = { ...isObj(sc.room) ? { room: sc.room } : {}, ...Array.isArray(sc.occupants) ? { occupants: sc.occupants.map(String) } : {}, ...Array.isArray(sc.exits) ? { exits: sc.exits.map(String) } : {}, ...typeof sc.revision === "number" ? { revision: sc.revision } : {} };
      if (typeof sc.revision === "number") p.revision = Math.max(p.revision, sc.revision);
      changed(sid, isNew);
    };
    const sync = (sid, d) => {
      const isNew = !S2(sid).pups.has(String(d.npc_id));
      const p = pupOf(sid, String(d.npc_id));
      p.lines = (Array.isArray(d.lines) ? d.lines.filter(lineOk) : []).slice(-BUFFER);
      if (isObj(d.scene)) {
        p.scene = null;
        setScene(sid, String(d.npc_id), d.scene);
      }
      if (typeof d.revision === "number") p.revision = d.revision;
      p.syncing = false;
      clearTimeout(p.timer);
      changed(sid, isNew);
    };
    const requests = /* @__PURE__ */ new Set();
    const oldSession = (s) => ({
      ...s,
      send: (c) => mu.sessions.send(c, { sid: s.sid }),
      gmcp: async (pkg, data) => await mu.gmcp.send(pkg, data, { sid: s.sid }) === true
    });
    const resync = async (sid, id, revision) => {
      const hs = [...requests];
      const sess = sessionOf(sid);
      if (hs.length) {
        for (const fn of hs) {
          try {
            await fn({ npc_id: id, revision }, oldSession({ sid, worldId: sess?.worldId ?? "", character: sess?.character ?? "" }));
          } catch (e) {
            mu.log.error("resync handler failed", e);
          }
        }
        return;
      }
      if (source(sid) !== "api") await mu.gmcp.send(`${P}.Resync`, { npc_id: id, revision }, { sid });
    };
    const openPuppet = (sid, id) => {
      const st = S2(sid);
      if (id === null) {
        st.open = null;
        changed(sid);
        return;
      }
      const p = st.pups.get(id);
      if (!p) return;
      st.open = id;
      p.unread = 0;
      p.syncing = true;
      clearTimeout(p.timer);
      p.timer = setTimeout(() => {
        if (p.syncing) {
          p.syncing = false;
          changed(sid);
        }
      }, RESYNC_MS);
      changed(sid);
      void resync(sid, id, p.revision);
    };
    const run = (a, vars, sid) => mu.actions.run(ACTIONS[a], vars, { sid });
    const shows = (a, sid) => !!sid && mu.actions.visible(ACTIONS[a], sid) !== false;
    subs.push(mu.gmcp.on(P, (data, meta) => {
      const { sid, pkg } = meta;
      const sub = pkg.slice(P.length + 1).toLowerCase();
      if (!acceptsGmcp(sid) || !isObj(data)) return;
      if (sub === "manifest") {
        if (Array.isArray(data.puppets)) setManifest(sid, data.puppets);
      } else if (sub === "feed") {
        if (!meta.replay && idOk(data.npc_id) && Array.isArray(data.lines)) pushFeed(sid, String(data.npc_id), data.lines);
      } else if (sub === "scene") {
        if (idOk(data.npc_id)) setScene(sid, String(data.npc_id), data);
      } else if (sub === "sync") {
        if (idOk(data.npc_id)) sync(sid, data);
      }
    }));
    const body = (l) => {
      if (isHtml(l.body)) return [mu.ui.sanitize(l.body, "inline")];
      return ansiRuns(l.body).map((r) => r.fg === null && !r.bold ? document.createTextNode(r.text) : h("span", { class: [r.fg !== null ? `a${r.fg}` : "", r.bold ? "b" : ""].filter(Boolean).join(" ") }, r.text));
    };
    const save = async (p) => {
      if (!p.lines.length) return;
      await mu.files.save({ name: fileName(p.p.npc_id), type: "text/plain;charset=utf-8", data: p.lines.map((l) => plain(l.body)).join("\n") });
    };
    const clear = async (sid, p) => {
      if (!p.lines.length) return;
      const who = p.p.name ?? `#${p.p.npc_id}`;
      if (!await mu.ui.confirm({ title: `Clear ${who}'s buffer?`, confirm: "Clear", danger: true })) return;
      p.lines = [];
      changed(sid);
    };
    function mount(el, pc) {
      const root = h("section", { class: "puppets", "data-testid": "puppets", role: "region", "aria-label": "Remote puppet viewpoints" });
      el.append(root);
      const sid0 = pc.sid;
      const sidOf = () => sid0 ?? active();
      if (sid0) S2(sid0).mounted++;
      let feedAtEnd = true, shown = null, focusInput = false;
      const fill = (...kids) => root.replaceChildren(...kids.filter((k) => !!k));
      const draw = () => {
        const sid = sidOf();
        const was = root.contains(document.activeElement) ? document.activeElement.dataset.focus : void 0;
        if (!sid) {
          fill(h("p", { class: "empty" }, "No session"));
          return;
        }
        const st = S2(sid);
        const p = st.open ? st.pups.get(st.open) : void 0;
        if (!p) {
          shown = null;
          const rows = list(sid);
          fill(rows.length ? h("div", { class: "list", "data-testid": "puppets-list" }, rows.map((q) => {
            const id = q.p.npc_id;
            return h(
              "button",
              { class: `${mu.ui.css.row} row prow${q.unread ? ` ${mu.ui.css.hot}` : ""}`, type: "button", "data-id": id, "data-focus": `row-${id}`, onclick: () => {
                focusInput = true;
                openPuppet(sid, id);
              } },
              h("strong", null, `P${q.p.slot ?? ""}`),
              h("span", { class: "name" }, q.p.name ?? `#${id}`),
              h("small", null, `#${id}`),
              h("span", { class: "where" }, q.scene?.room?.name ?? ""),
              q.unread ? h("span", { class: "pbadge", "data-testid": "puppet-unread", "aria-label": `${q.unread} unread` }, badgeText(q.unread)) : null
            );
          })) : h("p", { class: "empty", "data-testid": "puppets-empty" }, "No remote puppet viewpoints."));
        } else {
          const id = p.p.npc_id, name = p.p.name ?? `#${id}`;
          if (shown !== id) {
            shown = id;
            feedAtEnd = true;
          }
          const draft = root.querySelector("[data-testid=puppet-input]")?.value ?? "";
          const feed = h(
            "div",
            { class: "term-feed", "data-testid": "puppet-feed", role: "log", "aria-live": "polite" },
            p.lines.map((l) => h("div", { class: `term-line${l.news === "self" ? " self" : ""}` }, body(l))),
            p.syncing && !p.lines.length ? h("div", { class: "sync" }, "Loading viewpoint") : null
          );
          const sc = p.scene;
          const tool = (label, title, focus, fn, testid) => h("button", { class: `${mu.ui.css.cmd} tool ptool`, type: "button", title, "aria-label": title, "data-focus": focus, ...testid ? { "data-testid": testid } : {}, disabled: !p.lines.length, onclick: fn }, label);
          let input = null;
          const form = shows("cmd", sid) ? h(
            "form",
            {
              class: "term-input",
              onsubmit: async (e) => {
                e.preventDefault();
                const cmd = input.value.trim();
                if (!cmd) return;
                input.value = "";
                await run("cmd", { npc: id, cmd }, sid);
              }
            },
            h("span", { class: "prompt", "aria-hidden": "true" }, `P${p.p.slot ?? ""}>`),
            input = h("input", { type: "text", placeholder: `Act as ${name}`, "aria-label": `command for ${name}`, autocomplete: "off", spellcheck: "false", "data-testid": "puppet-input", "data-focus": "input" })
          ) : null;
          if (input) input.value = draft;
          fill(
            h(
              "div",
              { class: "term-head" },
              h("button", { class: `${mu.ui.css.cmd} back pback`, type: "button", title: "Back to puppet list", "aria-label": "Back to puppet list", "data-testid": "puppet-back", "data-focus": "back", onclick: () => openPuppet(sid, null) }, "Back"),
              h("strong", null, `P${p.p.slot ?? ""}`),
              h("span", { class: "name" }, name),
              h("small", null, `#${id}`),
              h("span", { class: "where" }, sc?.room?.name ?? ""),
              tool("Save", "download buffer", "dl", () => void save(p), "puppet-save"),
              tool("Clear", "clear buffer", "clear", () => void clear(sid, p), "puppet-clear")
            ),
            feed,
            sc && (sc.room?.name || sc.occupants?.length || sc.exits?.length) ? h(
              "div",
              { class: "pscene", "data-testid": "puppet-scene" },
              sc.room?.name ? h("span", { class: "rn" }, sc.room.name) : null,
              sc.occupants?.length ? h("span", null, h("span", { class: "lk" }, "here"), sc.occupants.join(", ")) : null,
              sc.exits?.length ? h("span", null, h("span", { class: "lk" }, "exits"), sc.exits.join(" \xB7 ")) : null
            ) : null,
            form
          );
          if (feedAtEnd) feed.scrollTop = feed.scrollHeight;
          feed.addEventListener("scroll", () => {
            feedAtEnd = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 4;
          });
          if (focusInput && input) {
            focusInput = false;
            input.focus({ preventScroll: true });
            return;
          }
        }
        focusInput = false;
        if (was) root.querySelector(`[data-focus="${was}"]`)?.focus();
      };
      redraws.add(draw);
      const off = mu.sessions.on("switch", () => draw());
      draw();
      return () => {
        redraws.delete(draw);
        off();
        if (sid0) {
          const st = states.get(sid0);
          if (st) st.mounted = Math.max(0, st.mounted - 1);
        }
        root.remove();
      };
    }
    mu.panels.register({ id: PANEL, title: "Puppets", singleton: true, defaultPosition: "right-top", show: "auto", order: 60, mount });
    registered = true;
    for (const s of mu.sessions.list()) {
      badge(s.id);
      if (list(s.id).length) touch(s.id);
    }
    let supportsOff = null;
    const syncSupports = () => {
      const want = mode(active()) !== "off";
      if (want && !supportsOff) supportsOff = mu.gmcp.supports([`${P} 1`]);
      if (!want && supportsOff) {
        supportsOff();
        supportsOff = null;
      }
    };
    syncSupports();
    subs.push(() => {
      supportsOff?.();
      supportsOff = null;
    }, mu.sessions.on("switch", () => syncSupports()));
    try {
      subs.push(mu.settings.watch("puppets.enabled", () => {
        syncSupports();
        for (const f of [...redraws]) f();
      }));
    } catch {
    }
    const wrap = (name, fn) => (args, s) => fn({ action: name, npc: args.npc ?? "", ...args }, oldSession(s));
    const configure = (cfg, w) => {
      const set = (key, v) => mu.settings.set(`puppets.${key}`, v, w);
      for (const a of Object.keys(cfg.actions ?? {})) if (!(a in ACTIONS)) throw new Error(`Puppets: no action "${a}"`);
      if (cfg.enabled) set("enabled", cfg.enabled);
      if (cfg.source) set("source", cfg.source);
      for (const [a, c] of Object.entries(cfg.actions ?? {})) {
        if (c.via) set(`action.${a}.via`, c.via);
        if (c.cmd !== void 0) set(`action.${a}.cmd`, c.cmd);
      }
      for (const [o, v] of Object.entries(cfg.options ?? {})) set(o, v);
      syncSupports();
      for (const f of [...redraws]) f();
    };
    const api = (track) => ({
      enable: (m, w) => configure({ enabled: m }, w),
      open(npcId) {
        mu.panels.open(PANEL);
        const s = active();
        if (s && npcId !== void 0) openPuppet(s, String(npcId));
      },
      set(what, a, b, c) {
        if (what === "manifest") {
          const s = need(b);
          if (acceptsApi(s)) setManifest(s, Array.isArray(a?.puppets) ? a.puppets : []);
        } else {
          const s = need(c);
          if (acceptsApi(s) && isObj(b)) setScene(s, String(a), b);
        }
      },
      push: (_w, d, sid) => {
        const s = need(sid);
        if (acceptsApi(s) && idOk(d?.npc_id)) pushFeed(s, String(d.npc_id), Array.isArray(d.lines) ? d.lines : []);
      },
      sync: (d, sid) => {
        const s = need(sid);
        if (acceptsApi(s) && idOk(d?.npc_id)) sync(s, d);
      },
      get(what, a, b) {
        if (what === "manifest") return list(need(a)).map((p) => ({ ...p.p }));
        return [...S2(need(b)).pups.get(String(a))?.lines ?? []];
      },
      unread: (sid) => total(need(sid)),
      onAction: (a, fn) => {
        if (!(a in ACTIONS)) throw new Error(`Puppets: no action "${a}"`);
        return track(mu.actions.handle(ACTIONS[a], wrap(a, fn)));
      },
      onRequest: (k, fn) => {
        if (k !== "resync") throw new Error(`Puppets: no request "${k}"`);
        requests.add(fn);
        return track(() => {
          requests.delete(fn);
        });
      },
      configure,
      async add(npc, sid) {
        const n = npcOf(npc);
        if (!n) throw new Error("Puppets.add: an npc id, or { npc_id, name? }");
        const s = sid ?? active();
        if (!s || !sessionOf(s) || mode(s) === "off") return "hidden";
        if (S2(s).pups.has(n.id)) return "present";
        return run("add", { npc: n.id, ...n.name ? { name: n.name } : {} }, s);
      },
      has: (npcId, sid) => {
        const s = sid ?? active();
        return !!s && S2(s).pups.has(String(npcId).replace(/^#/, ""));
      },
      canAdd: (sid) => {
        const s = sid ?? active();
        return !!s && !!sessionOf(s) && mode(s) !== "off" && shows("add", s);
      },
      watch(fn, sid) {
        const w = { sid, fn };
        watchers.add(w);
        const s = sid ?? active();
        if (s) {
          try {
            fn(list(s).map((p) => ({ ...p.p })));
          } catch (e) {
            mu.log.error("puppets watch failed", e);
          }
        }
        return track(() => {
          watchers.delete(w);
        });
      }
    });
    ctx.exports((caller) => api((d) => caller.track(d)));
  }
});
export {
  BUFFER,
  index_default as default
};
