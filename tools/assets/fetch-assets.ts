/**
 * Downloads the CC0 assets the game uses from Poly Haven and records their provenance.
 *
 *   node tools/assets/fetch-assets.ts
 *
 * Files land in apps/game/src/media/ and a provenance list is written to
 * apps/game/src/media/credits.json (also used for the in-game credits).
 * All Poly Haven assets are CC0 (https://polyhaven.com/license).
 */
import fs from 'node:fs';
import path from 'node:path';

interface AssetRequest {
  id: string;
  kind: 'hdri' | 'texture';
  /** Map names in the Poly Haven files API (textures only). */
  maps?: string[];
  usedFor: string;
}

const ASSETS: AssetRequest[] = [
  { id: 'goegap', kind: 'hdri', usedFor: 'Dust Valley lighting and reflections' },
  { id: 'shanghai_bund', kind: 'hdri', usedFor: 'Neon City lighting and reflections' },
  { id: 'studio_small_08', kind: 'hdri', usedFor: 'Orbit Station lighting and reflections' },
  {
    id: 'aerial_beach_01',
    kind: 'texture',
    maps: ['Diffuse', 'nor_gl'],
    usedFor: 'Dust Valley lane surface',
  },
  { id: 'asphalt_02', kind: 'texture', maps: ['Diffuse', 'nor_gl'], usedFor: 'Neon City lane surface' },
  {
    id: 'blue_metal_plate',
    kind: 'texture',
    maps: ['Diffuse', 'nor_gl'],
    usedFor: 'Orbit Station lane surface',
  },
];

const OUT = path.resolve('apps/game/src/media');

/** Assets from other sources, kept when this script rewrites the credits. */
const AUDIO_CREDITS = [
  {
    name: 'Synthwave House Loop',
    authors: ['Fupi'],
    usedFor: 'Synthwave music',
    source: 'https://opengameart.org/node/124154',
  },
  {
    name: 'Synth Wave',
    authors: ['Pro Sensory'],
    usedFor: 'Synthwave music',
    source: 'https://opengameart.org/content/synth-wave',
  },
  {
    name: 'Oldskool',
    authors: ['Of Far Different Nature'],
    usedFor: 'Synthwave music',
    source: 'https://opengameart.org/content/oldskool',
  },
  {
    name: 'Funky Disco Beats to Boogie/Woogie to',
    authors: ['Fupi'],
    usedFor: 'Disco music',
    source: 'https://opengameart.org/content/funky-disco-beats-to-boogiewoogie-to',
  },
  {
    name: 'Funked Up',
    authors: ['Joth'],
    usedFor: 'Disco music',
    source: 'https://opengameart.org/content/funked-up',
  },
  {
    name: 'Funky House',
    authors: ['Of Far Different Nature'],
    usedFor: 'Disco music',
    source: 'https://opengameart.org/content/funky-house',
  },
  {
    name: 'Free Rhythm Game Music Pack 1',
    authors: ['tricksntraps'],
    usedFor: 'EDM music',
    source: 'https://opengameart.org/content/free-rhythm-game-music-pack-1',
  },
  {
    name: 'Bouncer',
    authors: ['Of Far Different Nature'],
    usedFor: 'EDM music',
    source: 'https://opengameart.org/node/107501',
  },
  {
    name: 'Toon Shooter Game Kit',
    authors: ['Quaternius'],
    usedFor: 'soldiers, enemies and weapons',
    source: 'https://quaternius.com/packs/toonshootergamekit.html',
  },
  {
    name: 'Sci-Fi Sounds, Impact Sounds, Interface Sounds, Music Jingles',
    authors: ['Kenney'],
    usedFor: 'sound effects',
    source: 'https://kenney.nl/assets/category:Audio',
  },
  {
    name: 'Determined Pursuit',
    authors: ['Emma_MA'],
    usedFor: 'menu music',
    source: 'https://opengameart.org/content/determined-pursuit-epic-orchestra-loop',
  },
  {
    name: 'Action Music Loop',
    authors: ['AppPro'],
    usedFor: 'Dust Valley music',
    source: 'https://opengameart.org/content/action-music-loop',
  },
  {
    name: 'Fast fight / battle music',
    authors: ['Ville Nousiainen', 'Xythe', 'mutkanto'],
    usedFor: 'Neon City music',
    source: 'https://opengameart.org/content/fast-fight-battle-music',
  },
  {
    name: 'Friendly Talk On a Robotic Battlefield',
    authors: ['illin'],
    usedFor: 'Orbit Station music',
    source: 'https://opengameart.org/content/friendly-talk-on-a-robotic-battlefield-looped',
  },
  {
    name: 'Heavy battle music',
    authors: ['Davieplier'],
    usedFor: 'boss music',
    source: 'https://opengameart.org/content/heavy-battle-music',
  },
];
const RESOLUTION = '1k';

async function json(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { 'user-agent': 'lsg-asset-fetch/1.0' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

async function download(url: string, file: string): Promise<number> {
  if (fs.existsSync(file)) return fs.statSync(file).size;
  const response = await fetch(url, { headers: { 'user-agent': 'lsg-asset-fetch/1.0' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return data.length;
}

type FileEntry = { url: string; size: number };
type FileTree = Record<string, Record<string, Record<string, FileEntry>>>;

const credits: unknown[] = [];
for (const asset of ASSETS) {
  const info = await json(`https://api.polyhaven.com/info/${asset.id}`);
  const files = (await json(`https://api.polyhaven.com/files/${asset.id}`)) as unknown as FileTree;
  const authors = Object.keys((info.authors as Record<string, string>) ?? {});
  const written: string[] = [];
  if (asset.kind === 'hdri') {
    const entry = files.hdri?.[RESOLUTION]?.hdr;
    if (!entry) throw new Error(`${asset.id}: no ${RESOLUTION} HDR`);
    const target = path.join(OUT, 'hdri', `${asset.id}_${RESOLUTION}.hdr`);
    await download(entry.url, target);
    written.push(path.relative(OUT, target).replaceAll('\\', '/'));
  } else {
    for (const map of asset.maps ?? []) {
      const entry = files[map]?.[RESOLUTION]?.jpg;
      if (!entry) throw new Error(`${asset.id}: no ${RESOLUTION} ${map} jpg`);
      const name = map === 'Diffuse' ? 'diff' : map === 'nor_gl' ? 'nor' : map.toLowerCase();
      const target = path.join(OUT, 'textures', asset.id, `${name}_${RESOLUTION}.jpg`);
      await download(entry.url, target);
      written.push(path.relative(OUT, target).replaceAll('\\', '/'));
    }
  }
  credits.push({
    id: asset.id,
    name: info.name,
    kind: asset.kind,
    authors,
    license: 'CC0 1.0',
    source: `https://polyhaven.com/a/${asset.id}`,
    files: written,
    usedFor: asset.usedFor,
    changes: 'none',
  });
  console.info(`${asset.id}: ${written.join(', ')}`);
}

fs.writeFileSync(
  path.join(OUT, 'credits.json'),
  `${JSON.stringify([...credits, ...AUDIO_CREDITS], null, 2)}\n`,
);
console.info(`wrote ${path.join(OUT, 'credits.json')}`);
