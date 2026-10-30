import type { WebGLRenderer } from 'three';

/** One marker per build, so a new release gets a fresh chance on every device. */
const SAFE_MODE_KEY = `lsg.gpu.safe.${__LSG_BUILD__}`;
/** Frames after a start or quality change in which the picture is checked for being empty. */
const WATCH_FRAMES = 240;
/** Consecutive empty frames that count as a broken render path. */
const BLANK_LIMIT = 45;

export interface GpuReport {
  renderer: string;
  vendor: string;
  version: string;
  maxTextureSize: number;
  colorBufferFloat: boolean;
  floatRenderTarget: boolean;
  safeMode: boolean;
  log: string[];
}

export function gpuSafeMode(): boolean {
  try {
    return localStorage.getItem(SAFE_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSafeMode(): void {
  try {
    localStorage.setItem(SAFE_MODE_KEY, '1');
  } catch {
    // Without storage the next start simply tries the normal path again.
  }
}

/**
 * Tests whether this GPU can really render into half-float targets, which post-processing and
 * image-based lighting need. Some phones report the extension but fail at draw time.
 */
export function supportsFloatTarget(gl: WebGL2RenderingContext): boolean {
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
    return false;
  }
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(texture);
  return complete;
}

/**
 * Watches the graphics context. When it is lost, a shader fails or the picture stays empty,
 * the game falls back to the simplest render path instead of showing a blank screen, and
 * everything it learns ends up in the debug file.
 */
export class GpuHealth {
  private readonly renderer: WebGLRenderer;
  private readonly gl: WebGL2RenderingContext;
  private readonly pixel = new Uint8Array(4);
  private readonly messages: string[] = [];
  private watchFrames = WATCH_FRAMES;
  private blankFrames = 0;
  private failed = false;
  /** Asks the game to continue with the simplest render path. */
  onFailure: (() => void) | null = null;

  constructor(renderer: WebGLRenderer, canvas: HTMLCanvasElement) {
    this.renderer = renderer;
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.note('context lost');
      // A lost context rarely comes back in a usable state; restart on the safe path once.
      if (!gpuSafeMode()) {
        rememberSafeMode();
        window.location.reload();
      }
    });
    canvas.addEventListener('webglcontextrestored', () => this.note('context restored'));
    renderer.debug.onShaderError = (gl, program) => {
      this.note(`shader error: ${gl.getProgramInfoLog(program)?.slice(0, 300) ?? 'unknown'}`);
      this.fail('shader error');
    };
  }

  private note(message: string): void {
    if (this.messages.length < 40) this.messages.push(message);
    console.warn(`GPU: ${message}`);
  }

  private fail(reason: string): void {
    if (this.failed) return;
    this.failed = true;
    this.note(`falling back to the safe render path: ${reason}`);
    rememberSafeMode();
    this.onFailure?.();
  }

  /** Checks the finished frame while the picture is not yet known to be fine. */
  afterFrame(): void {
    if (this.watchFrames <= 0 || this.gl.isContextLost()) return;
    this.watchFrames--;
    const gl = this.gl;
    gl.readPixels(
      gl.drawingBufferWidth >> 1,
      gl.drawingBufferHeight >> 2,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.pixel,
    );
    const blank = this.pixel[0] === 0 && this.pixel[1] === 0 && this.pixel[2] === 0;
    this.blankFrames = blank ? this.blankFrames + 1 : 0;
    if (this.blankFrames >= BLANK_LIMIT) {
      this.note('picture stayed empty');
      this.blankFrames = 0;
      this.fail('empty picture');
    }
  }

  /** Call after the render path changed. */
  watch(): void {
    this.watchFrames = WATCH_FRAMES;
    this.blankFrames = 0;
  }

  report(): GpuReport {
    const gl = this.gl;
    const lost = gl.isContextLost();
    const info = lost ? null : gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: lost ? 'lost' : String(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
      vendor: lost ? 'lost' : String(gl.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
      version: lost ? 'lost' : String(gl.getParameter(gl.VERSION)),
      maxTextureSize: lost ? 0 : Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      colorBufferFloat: !lost && gl.getExtension('EXT_color_buffer_float') !== null,
      floatRenderTarget: !lost && supportsFloatTarget(gl),
      safeMode: gpuSafeMode(),
      log: [...this.messages],
    };
  }
}
