const urls = import.meta.glob('./media/**/*', { query: '?url', import: 'default', eager: true });

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
