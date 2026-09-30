/**
 * The `muclient` manifest rules (R-EXT-PKG, docs/overhaul/08-extensions.md §1), as a dependency-free
 * module. It mirrors `manifestFromPackageJson` / `wasmDecl` / `packagePath` in
 * clients/web/src/features/extensions/host.ts and `parse` in crates/backend/src/extensions/manifest.rs,
 * taking the stricter rule where the two differ (the client wants `exports` as a string and an `api`
 * of the form `1`, `1.x`, `^1`, `^1.x`).
 *
 * The scaffolder checks what it writes with it, the generated project's build checks its own
 * package.json with a copy of it (scripts/manifest.mjs), and the tests use it.
 */

/** A path inside the package: no `..`, no leading `/`, no scheme, `?` or `#` (host.ts packagePath). */
export function packagePath(p) {
  if (typeof p !== 'string' || !p || p.includes('\0') || p.includes('\\') || p.startsWith('/')) return null;
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' || seg.includes(':') || seg.includes('?') || seg.includes('#')) return null;
    out.push(seg);
  }
  return out.length ? out.join('/') : null;
}

/** `muclient.wasm`: a list of paths, or an object of path → sha256 hex (or null). */
export function wasmDecl(raw) {
  if (raw === undefined || raw === null) return undefined;
  const out = {};
  const add = (p, h) => {
    const clean = packagePath(p);
    if (!clean) throw new Error(`muclient.wasm: "${String(p)}" is not a path inside the package.`);
    if (h !== null && (typeof h !== 'string' || !/^[0-9a-f]{64}$/i.test(h))) throw new Error(`muclient.wasm: the hash for ${clean} is not a sha256 hex string.`);
    out[clean] = h === null ? null : h.toLowerCase();
  };
  if (Array.isArray(raw)) for (const p of raw) add(p, null);
  else if (typeof raw === 'object') for (const [p, h] of Object.entries(raw)) add(p, h);
  else throw new Error('muclient.wasm must be a list of paths or an object of path → sha256.');
  return out;
}

/** The extension id the host derives: `muclient.id`, else the package name without scope and `ext-`. */
export function idOf(pkg) {
  return String(pkg?.muclient?.id ?? pkg?.name ?? '').replace(/^@[^/]+\//, '').replace(/^ext-/, '');
}

export const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** npm package names: lowercase, URL-safe, optional scope. */
export const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Validate a parsed package.json. Returns the normalised manifest or throws with the host's message. */
export function validateManifest(pkg) {
  const m = pkg?.muclient;
  if (!m || typeof m !== 'object') throw new Error('This package has no "muclient" manifest, so it is not a μClient extension.');
  if (typeof pkg.exports !== 'string') throw new Error('The manifest needs "exports" naming the built entry file.');
  const entry = packagePath(pkg.exports);
  if (!entry) throw new Error(`Unsafe "exports" path "${pkg.exports}".`);
  const api = String(m.api ?? '');
  if (!/^\^?1(\.|$)/.test(api)) throw new Error(`It needs extension API ${api || '(unspecified)'}; this μClient provides 1.x.`);
  const id = idOf(pkg);
  if (!ID_RE.test(id)) throw new Error(`Invalid extension id "${id}".`);
  if (typeof pkg.name !== 'string' || !NPM_NAME_RE.test(pkg.name) || pkg.name.length > 214) throw new Error(`Invalid package name "${pkg.name}".`);
  if (m.source !== undefined && !packagePath(m.source)) throw new Error(`muclient.source: "${m.source}" is not a path inside the package.`);
  const wasm = wasmDecl(m.wasm);
  return {
    id, name: pkg.name, displayName: String(m.displayName ?? pkg.name), version: String(pkg.version ?? '0.0.0'),
    description: String(m.description ?? ''), entry, api, source: m.source ?? 'src/index.ts',
    capabilities: Array.isArray(m.capabilities) ? m.capabilities.map(String) : [],
    contributes: m.contributes, ...(wasm ? { wasm } : {}),
  };
}
