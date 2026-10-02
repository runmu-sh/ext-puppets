/**
 * Feed line bodies: what the game sends is plain text, text with ANSI colour (SGR) escapes, or a little HTML
 * (Underspire renders `span`/`div`/`p`/`br` bodies as HTML and colours the rest from ANSI). Pure helpers, no DOM.
 */

/** A body is HTML when it carries one of the tags Underspire's terminal treats as markup. */
export const isHtml = (s: string): boolean => /<\/?(?:span|div|p|br|b|i|u|em|strong|code|a)\b/i.test(s);

/** A run of text with its ANSI style: `fg` 0–15 (the terminal's 16 base colours) or null, and bold. */
export interface Run { text: string; fg: number | null; bold: boolean }

const ESC = /\u001b\[([0-9;]*)([A-Za-z])|\u001b[^[]?/g;

/** Split ANSI-coloured text into runs. Only SGR colours 30–37, 90–97, 38;5;0–15, bold and resets are kept. */
export function ansiRuns(s: string): Run[] {
  const out: Run[] = [];
  let fg: number | null = null, bold = false, last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.fg === fg && prev.bold === bold) prev.text += t; else out.push({ text: t, fg, bold });
  };
  for (const m of s.matchAll(ESC)) {
    push(s.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    if (m[2] !== 'm') continue;
    const codes = (m[1] || '0').split(';').map((x) => Number(x || 0));
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) { fg = null; bold = false; }
      else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c === 39) fg = null;
      else if (c >= 30 && c <= 37) fg = c - 30;
      else if (c >= 90 && c <= 97) fg = c - 90 + 8;
      else if (c === 38 && codes[i + 1] === 5) { const n = codes[i + 2]; fg = n >= 0 && n < 16 ? n : null; i += 2; }
      else if (c === 38 && codes[i + 1] === 2) i += 4;
    }
  }
  push(s.slice(last));
  return out;
}

/** The text of a body without markup or escapes (for Save). */
export function plain(s: string): string {
  if (!isHtml(s)) return ansiRuns(s).map((r) => r.text).join('');
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\n+$/, '');
}

/** `puppet-<npc>-YYYY-MM-DD-HH-MM-SS.txt`, as Underspire names a saved buffer (UTC). */
export const fileName = (npc: string, now = new Date()): string => `puppet-${npc}-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;

/** The unread badge text: the count, `99+` above 99. */
export const badgeText = (n: number): string => (n > 99 ? '99+' : String(n));

/** An NPC reference from another extension → its id and name. */
export function npcOf(ref: unknown): { id: string; name?: string } | null {
  if (typeof ref === 'string' || typeof ref === 'number') { const id = String(ref).trim().replace(/^#/, ''); return id ? { id } : null; }
  if (ref && typeof ref === 'object') {
    const o = ref as { npc_id?: unknown; id?: unknown; name?: unknown };
    const raw = o.npc_id ?? o.id;
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    const id = String(raw).trim().replace(/^#/, '');
    return id ? { id, ...(typeof o.name === 'string' && o.name ? { name: o.name } : {}) } : null;
  }
  return null;
}

/** Underspire's list order: by slot, then by npc id (numerically when both are numbers). */
export function bySlot(a: { slot?: number | string; npc_id: string | number }, b: { slot?: number | string; npc_id: string | number }): number {
  const sa = Number(a.slot ?? Infinity), sb = Number(b.slot ?? Infinity);
  if (sa !== sb) return (Number.isNaN(sa) ? Infinity : sa) - (Number.isNaN(sb) ? Infinity : sb) || 0;
  const na = Number(a.npc_id), nb = Number(b.npc_id);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a.npc_id).localeCompare(String(b.npc_id));
}
