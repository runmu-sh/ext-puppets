/**
 * The public types of @runmu.sh/ext-puppets. Get the API with `await ctx.api<PuppetsApi>('puppets')` (or the package
 * name `@runmu.sh/ext-puppets`); add `"dependsOn": ["puppets"]` to your manifest, or catch the rejection when Puppets is
 * not enabled in the world and degrade (hide your "Add puppet" button).
 *
 * The API is per caller (SDK 1.12 `ctx.exports`): what you register through it (`watch`, `onAction`, `onRequest`) is
 * removed when your extension is disabled.
 */
import type { Dispose } from '@muclient/sdk';

export interface Puppet { npc_id: string | number; slot?: number | string; name?: string }
export interface FeedLine { body: string; revision?: number; action_id?: string | number; news?: 'room' | 'self' | string }
export interface Scene { room?: { name?: string; desc?: string }; occupants?: string[]; exits?: string[]; revision?: number }
export type Mode = 'off' | 'auto' | 'on';
export type Source = 'gmcp' | 'api' | 'both';
/** The session an action or request runs for. `send` and `gmcp` send to that session. */
export interface ActionSession { sid: string; worldId: string; character: string; send(cmd: string): Promise<void>; gmcp(pkg: string, data?: unknown): Promise<boolean> }
/** `npc` is the puppet's npc_id; `cmd` what was typed (the `cmd` action); `name` the NPC's name when known (the `add` action). */
export interface ActionArgs { action: string; npc: string; cmd?: string; name?: string; [k: string]: string | undefined }
/** Return true to handle the action yourself: the configured send is then skipped. */
export type ActionHandler = (args: ActionArgs, s: ActionSession) => boolean | void | Promise<boolean | void>;
export type RequestHandler = (args: { npc_id: string; revision: number }, s: ActionSession) => void | Promise<void>;
/** What `add` did: the action's result, or `'present'` when the NPC is already one of the session's puppets. */
export type AddResult = 'sent' | 'handled' | 'hidden' | 'duplicate' | 'present';
/** An NPC to add: its id, or an object with the id (`npc_id` or `id`) and optionally its name. */
export type NpcRef = string | number | { npc_id?: string | number; id?: string | number; name?: string };

export interface PuppetsApi {
  enable(mode: Mode, worldId?: string | null): void;
  /** Open the panel; with `npcId`, that puppet's viewpoint (marks it read and asks for a resync). */
  open(npcId?: string | number): void;
  /** Same shape as Client.Puppets.Manifest: the full set; puppets not listed are dropped. */
  set(what: 'manifest', data: { puppets: Puppet[] }, sid?: string): void;
  /** Same shape as Client.Puppets.Scene. */
  set(what: 'scene', npcId: string | number, scene: Scene, sid?: string): void;
  /** Same shape as Client.Puppets.Feed (`news: 'room'` lines count as unread). */
  push(what: 'feed', data: { npc_id: string | number; lines: FeedLine[] }, sid?: string): void;
  /** Same shape as Client.Puppets.Sync: replaces the buffer and scene. */
  sync(data: { npc_id: string | number; revision?: number; lines: FeedLine[]; scene?: Scene }, sid?: string): void;
  /** The puppets in manifest order (`npc_id` as a string). */
  get(what: 'manifest', sid?: string): readonly Puppet[];
  get(what: 'feed', npcId: string | number, sid?: string): readonly FeedLine[];
  /** Total unread of the session (the count on the Puppets tab). */
  unread(sid?: string): number;
  onAction(action: 'cmd' | 'add' | string, fn: ActionHandler): Dispose;
  onRequest(kind: 'resync', fn: RequestHandler): Dispose;
  configure(cfg: { enabled?: Mode; source?: Source; actions?: Record<string, { via?: 'command' | 'gmcp' | 'ext' | 'none'; cmd?: string }>; options?: Record<string, unknown> }, worldId?: string | null): void;

  // ── @since 1.2.0: for other extensions (an activity feed's "Add puppet") ──

  /**
   * Ask the game to make `npc` one of the session's puppets (default: the active session). Runs the `add` action:
   * GMCP `Client.Puppets.Add { npc_id }` by default. There is no command fallback unless the player (or
   * `configure({ actions: { add: { cmd } } })`) sets one, e.g. `@puppet/add {npc}`; without one a refused GMCP send
   * resolves `'hidden'`. The game answers with a new Client.Puppets.Manifest. Resolves `'present'`
   * without sending when the NPC is already a puppet, `'hidden'` when Puppets is off in the world or the action is
   * hidden. Never rejects for a missing session: it resolves `'hidden'`.
   */
  add(npc: NpcRef, sid?: string): Promise<AddResult>;
  /** The NPC is one of the session's puppets (Underspire's "In puppets"). */
  has(npcId: string | number, sid?: string): boolean;
  /** Whether `add` can send in the session: Puppets is not off there and the `add` action is not hidden. */
  canAdd(sid?: string): boolean;
  /** Call `fn` with the session's puppets now and whenever the set changes. Removed when the caller is disabled. */
  watch(fn: (puppets: readonly Puppet[]) => void, sid?: string): Dispose;
}
