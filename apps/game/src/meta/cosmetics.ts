/** Purely visual squad skins. Bought with coins or unlocked by stars; never affect gameplay. */
export interface CosmeticDef {
  id: string;
  /** Main body colour (sRGB hex). */
  body: number;
  /** Accent colour for helmet/visor. */
  accent: number;
  /** Projectile glow colour. */
  projectile: number;
  cost: number;
  /** Alternatively unlocked by collecting this many stars. */
  starsRequired: number | null;
}

export const COSMETICS: CosmeticDef[] = [
  { id: 'classic', body: 0x2f8cff, accent: 0xe9f3ff, projectile: 0xfff3a0, cost: 0, starsRequired: 0 },
  { id: 'jungle', body: 0x3f9b4a, accent: 0xd8e6b0, projectile: 0xd4ff8a, cost: 400, starsRequired: null },
  { id: 'crimson', body: 0xc0303e, accent: 0xffd0c8, projectile: 0xffb27a, cost: 600, starsRequired: null },
  { id: 'arctic', body: 0xe8f1ff, accent: 0x5fb8ff, projectile: 0xaee6ff, cost: 900, starsRequired: null },
  { id: 'neon', body: 0x2a1f5c, accent: 0x36f5ff, projectile: 0xff4fd8, cost: 0, starsRequired: 30 },
  { id: 'gold', body: 0xd9a520, accent: 0xfff2b8, projectile: 0xffe066, cost: 0, starsRequired: 60 },
  { id: 'shadow', body: 0x1b1d26, accent: 0xff3b55, projectile: 0xff5a3c, cost: 0, starsRequired: 90 },
];

export function cosmeticById(id: string): CosmeticDef {
  return COSMETICS.find((c) => c.id === id) ?? (COSMETICS[0] as CosmeticDef);
}
