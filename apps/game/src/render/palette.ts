import type { EnemyKind } from '../sim/types.ts';

/** Central colour palette so the placeholder art and later models share one look. */
export const PALETTE = {
  squad: 0x2f8cff,
  squadAccent: 0xe9f3ff,
  projectile: 0xfff3a0,
  enemyProjectile: 0xff5a3c,
  gateGood: 0x27d17c,
  gateBad: 0xff3b55,
  gateNeutral: 0x9aa6c2,
  gateWeapon: 0xffb020,
  barrier: 0x8892a8,
  barrel: 0xd94a2b,
  hitFlash: 0xffffff,
} as const;

export const ENEMY_COLORS: Record<EnemyKind, number> = {
  runner: 0xe0413c,
  tank: 0x8b2b2b,
  shooter: 0xc84ad8,
  splitter: 0xff8a2a,
  shield: 0x6b6fd6,
  miniboss: 0x5a1f7a,
  boss: 0x3a0f2a,
};
