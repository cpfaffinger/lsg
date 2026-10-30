import {
  hasProgress,
  mergeSaves,
  sanitizeSave,
  type LegalResponse,
  type MeResponse,
  type PlayerProfile,
  type PublicConfigResponse,
  type SaveConflictResponse,
  type SaveData,
  type SaveGetResponse,
  type SavePutResponse,
} from '@lsg/shared';
import type { ProgressStore } from '../meta/progress-store.ts';
import { apiRequest } from './api-client.ts';

export type SyncStatus = 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

/** Per-device record of what was last synchronised with which account. */
interface SyncMeta {
  userId: number;
  serverRevision: number;
  /** Local save revision that matches serverRevision. */
  localRevision: number;
  lastSyncAt: string;
}

const META_KEY = 'lsg.sync.v1';

function readMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta | null): void {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    // Storage blocked: sync still works within this session.
  }
}

type Listener = () => void;

/**
 * Optional Google account + cloud save sync. The game never depends on it: without the API
 * (offline, static hosting, maintenance) everything works as a guest with local saves.
 */
export class AccountService {
  private readonly progress: ProgressStore;
  config: PublicConfigResponse | null = null;
  user: PlayerProfile | null = null;
  status: SyncStatus = 'offline';
  lastSyncAt: string | null = null;
  /** Outcome of a sign-in redirect (#login=...), consumed by the UI once. */
  loginResult: string | null = null;
  private meta: SyncMeta | null = readMeta();
  private pushTimer: number | null = null;
  private syncing: Promise<void> | null = null;
  private readonly listeners = new Set<Listener>();
  private legal: LegalResponse | null = null;

  constructor(progress: ProgressStore) {
    this.progress = progress;
    this.lastSyncAt = this.meta?.lastSyncAt ?? null;
    progress.subscribe((save) => this.onLocalChange(save));
    window.addEventListener('online', () => void this.refresh());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.notify();
  }

  get signInAvailable(): boolean {
    return this.config?.googleLoginEnabled === true;
  }

  async init(): Promise<void> {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const login = hash.get('login');
    if (login) {
      this.loginResult = login;
      history.replaceState(null, '', location.pathname + location.search);
    }
    await this.refresh();
  }

  /** Reloads public config and the session, then syncs. */
  async refresh(): Promise<void> {
    const config = await apiRequest<PublicConfigResponse>('GET', '/api/config');
    if (!config.ok || !config.data) {
      this.config = null;
      this.setStatus('offline');
      return;
    }
    this.config = config.data;
    const me = await apiRequest<MeResponse>('GET', '/api/me');
    this.user = me.ok ? (me.data?.user ?? null) : null;
    this.setStatus(this.user ? 'idle' : 'offline');
    if (this.user) await this.sync();
  }

  signIn(): void {
    location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(location.pathname)}`;
  }

  async signOut(): Promise<void> {
    await apiRequest('POST', '/api/auth/logout');
    this.user = null;
    this.meta = null;
    writeMeta(null);
    this.setStatus('offline');
  }

  async deleteAccount(): Promise<boolean> {
    const result = await apiRequest('DELETE', '/api/me');
    if (!result.ok) return false;
    this.user = null;
    this.meta = null;
    writeMeta(null);
    this.setStatus('offline');
    return true;
  }

  exportUrl(): string {
    return '/api/me/export';
  }

  async loadLegal(): Promise<LegalResponse | null> {
    if (this.legal) return this.legal;
    const result = await apiRequest<LegalResponse>('GET', '/api/legal');
    this.legal = result.ok ? result.data : null;
    return this.legal;
  }

  // ------------------------------------------------------------------ sync

  private onLocalChange(save: SaveData): void {
    if (!this.user || this.syncing) return;
    if (this.meta && this.meta.localRevision === save.revision) return;
    if (this.pushTimer !== null) window.clearTimeout(this.pushTimer);
    // Bursts of changes (end of a run, several purchases) become one upload.
    this.pushTimer = window.setTimeout(() => {
      this.pushTimer = null;
      void this.sync();
    }, 1500);
  }

  /** Runs one sync round; concurrent calls share the same round. */
  sync(): Promise<void> {
    if (!this.user) return Promise.resolve();
    this.syncing ??= this.runSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private adopt(save: SaveData, serverRevision: number, userId: number): void {
    const clean = sanitizeSave(save);
    this.progress.replace(clean);
    this.remember(userId, serverRevision, this.progress.data.revision);
  }

  private remember(userId: number, serverRevision: number, localRevision: number): void {
    this.lastSyncAt = new Date().toISOString();
    this.meta = { userId, serverRevision, localRevision, lastSyncAt: this.lastSyncAt };
    writeMeta(this.meta);
  }

  private async push(save: SaveData, baseRevision: number, userId: number, attempt = 0): Promise<boolean> {
    const result = await apiRequest<SavePutResponse | SaveConflictResponse>('PUT', '/api/save', {
      save,
      baseRevision,
    });
    if (result.ok && result.data && 'serverRevision' in result.data) {
      this.remember(userId, result.data.serverRevision, save.revision);
      return true;
    }
    if (result.status === 409 && result.data && 'save' in result.data && attempt < 2) {
      // Another device synced in between: merge without losing progress, then retry.
      const server = result.data.save ? sanitizeSave(result.data.save) : null;
      const merged = server ? mergeSaves(server, this.progress.data, 'conflict') : this.progress.data;
      this.progress.replace(merged);
      return this.push(this.progress.data, result.data.serverRevision, userId, attempt + 1);
    }
    return false;
  }

  private async runSync(): Promise<void> {
    const user = this.user;
    if (!user) return;
    this.setStatus('syncing');
    const remote = await apiRequest<SaveGetResponse>('GET', '/api/save');
    if (!remote.ok || !remote.data) {
      this.setStatus(remote.status === 401 ? 'offline' : 'error');
      if (remote.status === 401) this.user = null;
      return;
    }
    const local = this.progress.data;
    const server = remote.data.save ? sanitizeSave(remote.data.save) : null;
    const serverRevision = remote.data.serverRevision;
    const meta = this.meta?.userId === user.id ? this.meta : null;
    let ok = true;

    if (!meta) {
      // First sync of this account on this device.
      if (!server) ok = await this.push(local, 0, user.id);
      else if (hasProgress(local)) {
        // Guest progress from this device is added to the account (coins are summed once).
        this.progress.replace(mergeSaves(server, local, 'import'));
        ok = await this.push(this.progress.data, serverRevision, user.id);
      } else this.adopt(server, serverRevision, user.id);
    } else {
      const localChanged = local.revision !== meta.localRevision;
      const serverChanged = serverRevision !== meta.serverRevision;
      if (serverChanged && !localChanged && server) this.adopt(server, serverRevision, user.id);
      else if (localChanged && !serverChanged) ok = await this.push(local, serverRevision, user.id);
      else if (localChanged && serverChanged && server) {
        this.progress.replace(mergeSaves(server, local, 'conflict'));
        ok = await this.push(this.progress.data, serverRevision, user.id);
      } else this.remember(user.id, serverRevision, local.revision);
    }
    this.setStatus(ok ? 'synced' : 'error');
  }
}
