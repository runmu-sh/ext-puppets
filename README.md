# Puppets (`@runmu.sh/ext-puppets`, id `puppets`)

Remote NPC viewpoints (06-world-modules §5, R-MOD-PUPPETS). It is a first-party extension on the marketplace (`puppets`): install it from Extensions → Discover, then enable it per world. Its settings sub-page is *Settings → Extensions → Puppets*. While it is on it sends `Core.Supports.Add ["Client.Puppets 1"]`.

## GMCP contract
| Direction | Package | Payload |
|---|---|---|
| S→C | `Client.Puppets.Manifest` | `{ "puppets": [{ "npc_id", "slot", "name" }] }`: the whole set; puppets that are missing are dropped |
| S→C | `Client.Puppets.Feed` | `{ "npc_id", "lines": [{ "body", "revision", "action_id"?, "news"? }] }`. `news: "room"` counts as unread unless that puppet is open. |
| S→C | `Client.Puppets.Scene` | `{ "npc_id", "revision", "room": {name, desc?}, "occupants": [..], "exits": [..] }` |
| S→C | `Client.Puppets.Sync` | `{ "npc_id", "revision", "lines": [...], "scene": {...} }`: replaces the buffer |
| C→S | `Client.Puppets.Resync` | `{ "npc_id", "revision" }`, sent when a puppet is opened, with the last revision held |
| C→S | `Client.Puppets.Command` | `{ "npc_id", "cmd" }`. The `cmd` action defaults to via **gmcp**, with a command fallback of `@puppet {npc} = {cmd}` (used when GMCP can't be sent). |

The buffer holds 300 lines per puppet. The panel title is "Puppets (N)", where N is the unread total for the active session. On enable only the Manifest is replayed; feeds that arrived before are not.

## API (`ctx.api('puppets')`, types `@runmu.sh/ext-puppets/types`)
`enable`, `open(npcId?)`, `set('manifest'|'scene', …)`, `push('feed', …)`, `sync(…)`, `get('manifest'|'feed', …)`, `unread(sid?)`, `onAction('cmd', fn)`, `onRequest('resync', fn)` and `configure`.

## What it looks like
The list is made of `.sh-row` lines, each with the slot (`P1`, gold), name, the room (dim, at the right) and a square gold badge with the unread count. A puppet with unread lines is `.hot`, so its ▸ marker is lit. When empty it shows NO REMOTE PUPPET VIEWPOINTS. as an uppercase faint label. The terminal view has a head over an accent rule with `[ BACK ]`, the slot, name and room, then `[ SAVE ]` (download the buffer as `puppet-<npc>-<timestamp>.txt`) and `[ CLEAR ]`. Below that is the scrolling feed, then a small scene summary (room, occupants, exits), with LOADING VIEWPOINT while it resyncs. At the bottom is a `P1>` command line. It uses the SDK 1.5 primitives (`mu.ui.css`).