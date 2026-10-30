export type GameStateId = 'boot' | 'menu' | 'playing' | 'paused' | 'levelEnd' | 'shop';

export interface GameState {
  enter?(previous: GameStateId | null): void;
  exit?(next: GameStateId): void;
  update?(dt: number): void;
}

const ALLOWED_TRANSITIONS: Record<GameStateId, readonly GameStateId[]> = {
  boot: ['menu'],
  menu: ['playing', 'shop'],
  playing: ['paused', 'levelEnd', 'menu'],
  paused: ['playing', 'menu'],
  levelEnd: ['menu', 'playing', 'shop'],
  shop: ['menu', 'playing'],
};

export class StateMachine {
  private currentId: GameStateId | null = null;
  private readonly states = new Map<GameStateId, GameState>();
  private readonly listeners = new Set<(next: GameStateId, prev: GameStateId | null) => void>();

  register(id: GameStateId, state: GameState): void {
    this.states.set(id, state);
  }

  get current(): GameStateId | null {
    return this.currentId;
  }

  canTransition(next: GameStateId): boolean {
    if (this.currentId === null) return true;
    return ALLOWED_TRANSITIONS[this.currentId].includes(next);
  }

  transition(next: GameStateId): void {
    if (!this.canTransition(next)) {
      throw new Error(`Invalid state transition ${this.currentId} -> ${next}`);
    }
    const prev = this.currentId;
    if (prev) this.states.get(prev)?.exit?.(next);
    this.currentId = next;
    this.states.get(next)?.enter?.(prev);
    for (const listener of this.listeners) listener(next, prev);
  }

  update(dt: number): void {
    if (this.currentId) this.states.get(this.currentId)?.update?.(dt);
  }

  onChange(listener: (next: GameStateId, prev: GameStateId | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
