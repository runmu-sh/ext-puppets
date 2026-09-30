/**
 * The public types of @runmu.sh/ext-puppets (06-world-modules §5, §6). Get the API with
 * `await ctx.api<PuppetsApi>('@runmu.sh/ext-puppets')`.
 */
import type { Dispose } from '@muclient/sdk';

export interface Puppet { npc_id: string | number; slot?: number | string; name?: string }
export interface FeedLine { body: string; revision?: number; action_id?: string | number; news?: 'room' | 'self' | string }
export interface Scene { room?: { name?: string; desc?: string }; occupants?: string[]; exits?: string[]; revision?: number }
export type Mode = 'off' | 'auto' | 'on';
export interface ActionSession { sid: string; worldId: string; character: string; send(cmd: string): Promise<void>; gmcp(pkg: string, data?: unknown): Promise<boolean> }
/** `npc` is the puppet's npc_id; `cmd` what was typed. */
export interface ActionArgs { action: string; npc: string; cmd?: string; [k: string]: string | undefined }
export type ActionHandler = (args: ActionArgs, s: ActionSession) => boolean | void | Promise<boolean | void>;
export type RequestHandler = (args: { npc_id: string; revision: number }, s: ActionSession) => void | Promise<void>;

export interface PuppetsApi {
  enable(mode: Mode, worldId?: string | null): void;
  open(npcId?: string | number): void;
  /** Same shape as Client.Puppets.Manifest: the full set; puppets not listed are dropped. */
  set(what: 'manifest', data: { puppets: Puppet[] }, sid?: string): void;
  /** Same shape as Client.Puppets.Scene. */
  set(what: 'scene', npcId: string | number, scene: Scene, sid?: string): void;
  /** Same shape as Client.Puppets.Feed (`news: 'room'` lines count as unread). */
  push(what: 'feed', data: { npc_id: string | number; lines: FeedLine[] }, sid?: string): void;
  /** Same shape as Client.Puppets.Sync: replaces the buffer and scene. */
  sync(data: { npc_id: string | number; revision?: number; lines: FeedLine[]; scene?: Scene }, sid?: string): void;
  get(what: 'manifest', sid?: string): readonly Puppet[];
  get(what: 'feed', npcId: string | number, sid?: string): readonly FeedLine[];
  /** Total unread (the N in "Puppets (N)"). */
  unread(sid?: string): number;
  onAction(action: 'cmd' | string, fn: ActionHandler): Dispose;
  onRequest(kind: 'resync', fn: RequestHandler): Dispose;
  configure(cfg: { enabled?: Mode; source?: 'gmcp' | 'api' | 'both'; actions?: Record<string, { via?: 'command' | 'gmcp' | 'ext' | 'none'; cmd?: string }>; options?: Record<string, unknown> }, worldId?: string | null): void;
}
