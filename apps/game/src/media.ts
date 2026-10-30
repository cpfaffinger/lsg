const urls = import.meta.glob('./media/**/*', { query: '?url', import: 'default', eager: true });

/** Paths below src/media that start with `prefix`, for example `audio/sfx/`. */
export function mediaFiles(prefix: string): string[] {
  const root = './media/';
  return Object.keys(urls)
    .map((key) => key.slice(root.length))
    .filter((path) => path.startsWith(prefix));
}

/**
 * Public URL of a file in src/media, for example `hdri/goegap_1k.hdr`. Production URLs carry a
 * content hash, so browsers, Cloudflare and the service worker can cache them forever and a
 * changed file is always fetched fresh.
 */
export function mediaUrl(path: string): string {
  const url = urls[`./media/${path}`];
  if (typeof url !== 'string') throw new Error(`Unknown media file: ${path}`);
  return url;
}
