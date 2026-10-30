/**
 * Unified horizontal input for touch, mouse and keyboard.
 *
 * Pointer input is relative: dragging moves the squad by the same on-screen distance,
 * independent of where the finger started. Keyboard input produces a steering axis.
 * Consumers read and reset `consumeDragDelta()` once per simulation step.
 */
export class InputController {
  private dragDeltaPx = 0;
  private activePointerId: number | null = null;
  private lastPointerX = 0;
  private readonly keys = new Set<string>();
  private readonly element: HTMLElement;
  private readonly abort = new AbortController();

  /** Set while a pointer is held down; useful for "touch to start" prompts. */
  pointerDown = false;
  /** Fired on the first user interaction (needed to unlock Web Audio). */
  onFirstInteraction: (() => void) | null = null;
  private interacted = false;

  constructor(element: HTMLElement) {
    this.element = element;
    const opts = { signal: this.abort.signal };
    element.addEventListener('pointerdown', this.handlePointerDown, opts);
    window.addEventListener('pointermove', this.handlePointerMove, opts);
    window.addEventListener('pointerup', this.handlePointerUp, opts);
    window.addEventListener('pointercancel', this.handlePointerUp, opts);
    window.addEventListener('keydown', this.handleKeyDown, opts);
    window.addEventListener('keyup', this.handleKeyUp, opts);
    window.addEventListener('blur', () => this.keys.clear(), opts);
  }

  dispose(): void {
    this.abort.abort();
  }

  /** Horizontal drag distance in CSS pixels since the last call. */
  consumeDragDelta(): number {
    const delta = this.dragDeltaPx;
    this.dragDeltaPx = 0;
    return delta;
  }

  /** Keyboard steering axis in [-1, 1]. */
  get keyAxis(): number {
    let axis = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) axis -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) axis += 1;
    return axis;
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  get viewportWidth(): number {
    return this.element.clientWidth || window.innerWidth;
  }

  private markInteraction(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.onFirstInteraction?.();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    this.markInteraction();
    this.activePointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.pointerDown = true;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.dragDeltaPx += event.clientX - this.lastPointerX;
    this.lastPointerX = event.clientX;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.pointerDown = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.markInteraction();
    this.keys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };
}
