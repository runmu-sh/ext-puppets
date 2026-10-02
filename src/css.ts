/**
 * The panel's look (after Underspire's puppets view). Every rule is scoped to this extension's panels, uses theme
 * tokens only, and sits on top of the host's `sh-row` / `sh-cmd` primitives.
 */
const S = '.ext-panel[data-ext="puppets"] .puppets';

export const CSS = `
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
