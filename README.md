# Puppets (`@runmu.sh/ext-puppets`, id `puppets`)

Remote NPC viewpoints. Each puppet gets a feed, its scene, and a command line that acts as that NPC. Install it from Extensions → Discover in μClient (`puppets`), then enable it per world. Its settings are under *Settings → Extensions → Puppets*. While it is not off it sends `Core.Supports.Add ["Client.Puppets 1"]`.

Needs μClient extension API **1.12** or later. Capabilities: `send-commands` (the command line and its fallback) and `files` (Save).

## GMCP contract

Every message has a JSON schema in `schema/`, declared in `package.json`. The host rejects a payload that doesn't match (the session shows an error) before Puppets sees it.

| Dir | Package | Payload |
|---|---|---|
| S→C | `Client.Puppets.Manifest` | `{ "puppets": [{ "npc_id", "slot"?, "name"? }] }`: the whole set; puppets missing from it are dropped. Sorted by slot, then npc id. |
| S→C | `Client.Puppets.Feed` | `{ "npc_id", "lines": [{ "body", "revision"?, "action_id"?, "news"? }] }`. A `news: "room"` line counts as unread unless that puppet is open. A body containing `<span`, `<div`, `<p` or `<br` is treated as HTML (sanitised), anything else as text with ANSI colours. |
| S→C | `Client.Puppets.Scene` | `{ "npc_id", "revision"?, "room"?: { "name"?, "desc"? }, "occupants"?: [..], "exits"?: [..] }` |
| S→C | `Client.Puppets.Sync` | `{ "npc_id", "revision"?, "lines": [...], "scene"?: {...} }`: replaces the buffer (the answer to Resync) |
| C→S | `Client.Puppets.Resync` | `{ "npc_id", "revision" }`, sent when a puppet is opened, with the last revision held |
| C→S | `Client.Puppets.Command` | `{ "npc_id", "cmd" }`: the `cmd` action, via **gmcp** by default, falling back to the command `@puppet {npc} = {cmd}` when GMCP can't be sent |
| C→S | `Client.Puppets.Add` | `{ "npc_id" }`: the `add` action (another extension's "Add puppet"), via **gmcp**, no command fallback unless one is set. The game answers with a new Manifest. |

`npc_id` may be a number or a string; Puppets always sends it as a string. The buffer holds the last 300 lines per puppet. The unread total for a session is shown as the badge on the Puppets tab (the title stays "Puppets"), and the panel adds itself, unfocused, the first time a Manifest or Feed arrives. When Puppets is enabled late, the host replays the last Manifest; replayed Feeds are ignored so nothing is counted twice.

Each action's route (`gmcp`, `command`, `ext`, `none`) and command template can be changed per world under *Settings → Extensions → Puppets → Actions* (keys `ext.puppets.puppets.action.cmd.via|cmd` and `….add.via|cmd`, as in 1.1).

## Settings

| Key | Default | |
|---|---|---|
| `ext.puppets.puppets.enabled` | `auto` | Show panel: `auto` (when the game sends puppets), `on`, `off`. Provided by μClient for the panel. |
| `ext.puppets.puppets.source` | `gmcp` | Driven by: `gmcp`, `api` (another extension), or `both`. |

## API (`await ctx.api<PuppetsApi>('puppets')`, types in `src/types.ts`, `@runmu.sh/ext-puppets/types`)

Add `"dependsOn": ["puppets"]` to your manifest, or catch the rejection when Puppets isn't enabled in the world. What you register through the API is removed when your extension is disabled. `sid` defaults to the active session.

| Method | |
|---|---|
| `enable(mode, worldId?)` | `off` / `auto` / `on` |
| `open(npcId?)` | open the panel, or a puppet's viewpoint (marks it read, asks for a resync) |
| `set('manifest', {puppets}, sid?)`, `set('scene', npcId, scene, sid?)`, `push('feed', {npc_id, lines}, sid?)`, `sync({...}, sid?)` | drive Puppets yourself (source `api` or `both`); same shapes as the GMCP messages |
| `get('manifest', sid?)`, `get('feed', npcId, sid?)`, `unread(sid?)` | read the state |
| `onAction('cmd' \| 'add', fn)` | see a command or add before it is sent; return `true` to handle it yourself |
| `onRequest('resync', fn)` | answer a resync yourself instead of sending `Client.Puppets.Resync` |
| `configure({enabled?, source?, actions?}, worldId?)` | set modes and action routes |
| **1.2** `add(npc, sid?) → Promise<'sent'\|'handled'\|'hidden'\|'duplicate'\|'present'>` | ask the game to make `npc` (an id, or `{npc_id\|id, name?}`) a puppet. `'present'`: already one, nothing sent. `'hidden'`: Puppets is off there, the action is hidden, there is no session, or GMCP was refused and no fallback is set. |
| **1.2** `has(npcId, sid?)` | is the NPC already a puppet (Underspire's "In puppets") |
| **1.2** `canAdd(sid?)` | whether `add` would be sent (Puppets not off, `add` action not hidden) |
| **1.2** `watch(fn, sid?) → dispose` | called now and on every manifest change with the session's puppets |

```ts
import type { PuppetsApi } from '@runmu.sh/ext-puppets/types';
const puppets = await ctx.api<PuppetsApi>('puppets').catch(() => null);
if (puppets?.canAdd(sid) && !puppets.has(npc.id, sid)) await puppets.add({ npc_id: npc.id, name: npc.name }, sid);
```

## What it looks like

The list is made of `.sh-row` lines: the slot (`P1`, gold), the name, `#<npc id>` (small, faint), the room (dim, at the right) and a square gold badge with the unread count (`99+` above 99). A puppet with unread lines is `.hot`, so its ▸ marker is lit. With no puppets it shows NO REMOTE PUPPET VIEWPOINTS. The terminal view has a head over an accent rule with `[ BACK ]`, the slot, name, `#id` and room, then `[ SAVE ]` (download the buffer as plain text, `puppet-<npc>-<YYYY-MM-DD-HH-MM-SS>.txt`) and `[ CLEAR ]` (asks first). Below is the scrolling feed, then a small scene summary (room, occupants, exits), with LOADING VIEWPOINT while it resyncs. At the bottom is a `P1>` command line with the placeholder ACT AS <NAME>, focused when the puppet is opened.

Test ids: `puppets`, `puppets-list`, `puppets-empty`, `puppet-unread`, `puppet-back`, `puppet-save`, `puppet-clear`, `puppet-feed`, `puppet-scene`, `puppet-input`.

## Develop

`npm run build && npm run typecheck && npm test` (headless host from `@runmu.sh/dev/test`, with happy-dom).
