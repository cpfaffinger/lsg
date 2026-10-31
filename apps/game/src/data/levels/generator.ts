import { BALANCE, ENEMIES, FACTOR_NEUTRAL_INDEX } from '../../sim/balance.ts';
import type { GateSpec } from '../../sim/gates.ts';
import type { LevelDef, Segment, WaveGroup, WorldId } from '../../sim/level.ts';
import { Rng } from '../../sim/rng.ts';
import type { EnemyKind, WeaponId } from '../../sim/types.ts';

/** Mechanics a level may use. The campaign unlocks them one by one. */
export type Feature =
  | 'factor'
  | 'percent'
  | 'tank'
  | 'barrel'
  | 'shooter'
  | 'splitter'
  | 'barrier'
  | 'shield'
  | 'bomber'
  | 'formations'
  | 'ambush'
  | 'trap'
  | 'breath'
  | 'spread'
  | 'laser'
  | 'rocket'
  | 'miniboss'
  | 'boss';

export interface GeneratorParams {
  id: string;
  number: number;
  world: WorldId;
  seed: number;
  /** Gate + wave pairs before the finale. */
  beats: number;
  scrollSpeed: number;
  /** Fraction of the squad's theoretical damage output that waves demand (0.2 easy .. 0.6 hard). */
  difficulty: number;
  features: ReadonlySet<Feature>;
  /** Squad size the player is expected to start with. */
  startUnits: number;
  /** Damage multiplier the player is expected to have from upgrades. */
  power: number;
  finale: 'none' | 'miniboss' | 'boss';
  /** Feature to showcase prominently because it was just unlocked. */
  spotlight?: Feature;
  /** Explicit boss HP multiplier (from tuning); otherwise estimated from the plan. */
  bossHpScale?: number;
}

const BEAT_LENGTH = 50;
const INTRO = 34;
/** Seconds of effective fire a wave is exposed to on its way to the squad. */
const EXPOSURE = 4.2;
const MAX_RUNNERS = 150;
/** Last wave index that features the enemy kind a level introduces. */
const SPOTLIGHT_BEATS = 2;
/** Smallest crowd of a wave never grows beyond this, however large the squad gets. */
const MAX_HORDE_FLOOR = 60;
const BEAT_SEED_STEP = 7919;
/** Soldiers in a shield wall across the lane. */
const PHALANX_SIZE = 7;
/** Width and distance from the middle of each half of a horde attacking from both sides. */
const PINCER_WIDTH = 3.4;
const PINCER_OFFSET = 3;
/** Where an ambush wave stands in a beat and how strong it is compared to the regular wave. */
const AMBUSH_DELAY = 42;
const AMBUSH_SHARE = 0.6;
/** Runners keep at least this share of their base HP (half = one rifle shot). */
const MIN_RUNNER_HP_SCALE = 0.5;
const UNIT_DPS = BALANCE.squad.baseDamage * BALANCE.squad.baseFireRate;

/** Planning model: expected squad strength while walking through the level. */
interface Plan {
  units: number;
  power: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weaponFeature(weapon: WeaponId): Feature | null {
  return weapon === 'rifle' ? null : weapon;
}

function chooseGates(rng: Rng, params: GeneratorParams, plan: Plan, beat: number): GateSpec[] {
  const f = params.features;
  const e = Math.max(3, plan.units);
  // Unit gates are generous on purpose: fast-growing numbers are the heart of the genre.
  const good = () => Math.max(3 + beat, Math.round(e * rng.range(0.45, 0.7)));
  const bad = () => -Math.max(2, Math.round(e * rng.range(0.2, 0.35)));
  interface Option {
    weight: number;
    build: () => GateSpec[];
    /** Conservative planning effect of the better gate. */
    apply: (gates: GateSpec[]) => void;
  }
  const addUnits = (gates: GateSpec[]) => {
    const best = Math.max(...gates.filter((g) => g.op === 'units').map((g) => g.value));
    plan.units += Math.max(0, best) * 0.85;
  };
  const options: Option[] = [
    {
      weight: 3,
      build: () => [
        { op: 'units', value: good() },
        { op: 'units', value: bad() },
      ],
      apply: addUnits,
    },
  ];
  if (f.has('factor')) {
    options.push({
      weight: beat === 0 ? 0.6 : 2.4,
      build: () => [
        { op: 'factor', value: FACTOR_NEUTRAL_INDEX + 1 },
        { op: 'units', value: Math.round(good() * 1.2) },
      ],
      apply: () => {
        plan.units *= 1.7;
      },
    });
    options.push({
      weight: 1.4,
      build: () => [
        { op: 'factor', value: FACTOR_NEUTRAL_INDEX },
        { op: 'units', value: good() },
      ],
      apply: addUnits,
    });
    if (beat > 1) {
      options.push({
        weight: 0.6,
        build: () => [
          { op: 'factor', value: FACTOR_NEUTRAL_INDEX - 1 },
          { op: 'units', value: bad() },
        ],
        apply: () => {
          plan.units *= 0.8;
        },
      });
    }
  }
  if (f.has('percent')) {
    options.push({
      weight: 1.4,
      build: () => [
        { op: 'damage', value: 5 * rng.int(2, 4) },
        { op: 'fireRate', value: 5 * rng.int(2, 4) },
      ],
      apply: () => {
        plan.power *= 1.15;
      },
    });
  }
  if (f.has('trap') && beat > 1) {
    // Both sides cost soldiers; shooting the lesser evil is the way out.
    options.push({
      weight: params.spotlight === 'trap' && beat === 2 ? 50 : 1.2,
      build: () => [
        { op: 'units', value: bad() },
        { op: 'units', value: Math.round(bad() * 1.8) },
      ],
      apply: () => {
        plan.units *= 0.8;
      },
    });
  }
  const weapons = (['spread', 'laser', 'rocket'] as WeaponId[]).filter((w) => {
    const feature = weaponFeature(w);
    return feature !== null && f.has(feature);
  });
  // The first gate must offer soldiers on both sides: the first wave is sized for a grown squad.
  if (weapons.length > 0 && beat > 0) {
    const spotlightWeapon =
      params.spotlight && weapons.includes(params.spotlight as WeaponId)
        ? (params.spotlight as WeaponId)
        : null;
    options.push({
      weight: spotlightWeapon && beat === 1 ? 50 : 2.4,
      build: () => [
        { op: 'weapon', value: 0, weapon: spotlightWeapon ?? rng.pick(weapons) },
        { op: 'units', value: good() },
      ],
      apply: addUnits,
    });
  }

  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng.next() * total;
  let choice = options[0];
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) {
      choice = option;
      break;
    }
  }
  if (!choice) throw new Error('No gate options');
  const gates = choice.build();
  choice.apply(gates);
  // Randomize which side the better gate is on.
  if (rng.chance(0.5)) gates.reverse();
  return gates;
}

/** Splits a wave HP budget across the enemy kinds this level may use. */
function buildWave(rng: Rng, params: GeneratorParams, budget: number, plan: Plan, beat: number): WaveGroup[] {
  const f = params.features;
  const groups: WaveGroup[] = [];
  const specials: { kind: EnemyKind; feature: Feature; share: number; count: [number, number] }[] = [
    { kind: 'tank', feature: 'tank', share: 0.3, count: [1, 3] },
    { kind: 'shooter', feature: 'shooter', share: 0.15, count: [2, 5] },
    { kind: 'splitter', feature: 'splitter', share: 0.25, count: [2, 6] },
    { kind: 'shield', feature: 'shield', share: 0.2, count: [2, 5] },
    { kind: 'bomber', feature: 'bomber', share: 0.08, count: [3, 8] },
  ];
  let remaining = budget;
  for (const special of specials) {
    if (!f.has(special.feature)) continue;
    // A new kind leads the first waves of its level; after that it mixes in like any other.
    const spotlight = params.spotlight === special.feature && beat <= SPOTLIGHT_BEATS;
    // The first wave of a level never introduces a kind: the squad is still tiny there.
    if (beat === 0 && !(spotlight && plan.units >= 6)) continue;
    if (!spotlight && !rng.chance(0.45)) continue;
    let share = budget * special.share * (spotlight ? 1.4 : 1);
    const baseHp = ENEMIES[special.kind].hp;
    // Special enemies are only added when the budget can pay for at least one of them;
    // the level that introduces a kind always shows one.
    const affordable = Math.floor(share / baseHp);
    if (affordable < 1) {
      if (!spotlight) continue;
      // The level that introduces a kind shows one, at reduced strength for the small squad.
      share = baseHp * 0.45;
    }
    const count = Math.max(1, Math.min(rng.int(special.count[0], special.count[1]), affordable));
    const hpScale = Math.max(affordable < 1 ? 0.45 : 1, share / (count * baseHp));
    groups.push({
      kind: special.kind,
      count,
      pattern: special.kind === 'tank' ? 'line' : rng.pick(['line', 'scatter'] as const),
      hpScale: Number(hpScale.toFixed(2)),
      width: special.kind === 'tank' ? 6 : undefined,
    });
    remaining -= share;
  }
  // Formations: a shield wall across the whole lane, or the horde coming in from both sides.
  const formation =
    f.has('formations') &&
    beat > 0 &&
    (params.spotlight === 'formations' ? beat <= SPOTLIGHT_BEATS : rng.chance(0.3));
  const pincer = formation && rng.chance(0.5);
  if (formation && !pincer) {
    const share = budget * 0.25;
    groups.push({
      kind: 'shield',
      count: PHALANX_SIZE,
      pattern: 'line',
      hpScale: Number(Math.max(0.6, share / (PHALANX_SIZE * ENEMIES.shield.hp)).toFixed(2)),
    });
    remaining -= share;
  }
  remaining = Math.max(budget * 0.35, remaining);
  // Waves are hordes: the HP budget buys many weak runners rather than a few tough ones.
  // Runners die to a single rifle shot at the weakest, so the crowd melts satisfyingly.
  const runnerHp = ENEMIES.runner.hp;
  // The floor follows the difficulty too: the very first wave decides whether a small squad gets
  // the chance to grow, so tuning must be able to shrink it.
  const hordeShare = 0.5 + params.difficulty * 1.6;
  const hordeFloor = clamp(Math.round((6 + plan.units * 2.5 + beat * 5) * hordeShare), 6, MAX_HORDE_FLOOR);
  const affordable = Math.round(remaining / (runnerHp * MIN_RUNNER_HP_SCALE));
  const count = clamp(Math.max(hordeFloor, affordable), hordeFloor, MAX_RUNNERS);
  const hpScale = Math.max(MIN_RUNNER_HP_SCALE, remaining / (count * runnerHp));
  const pattern = rng.pick(['grid', 'grid', 'scatter', 'wedge'] as const);
  const perUnit = 1 + params.difficulty * 5;
  const horde: WaveGroup = {
    kind: 'runner',
    count,
    pattern,
    hpScale: Number(hpScale.toFixed(2)),
    perUnit: Number(perUnit.toFixed(2)),
  };
  if (pincer) {
    const half = {
      ...horde,
      count: Math.ceil(count / 2),
      pattern: 'grid' as const,
      width: PINCER_WIDTH,
      perUnit: Number((perUnit / 2).toFixed(2)),
    };
    groups.unshift({ ...half, x: -PINCER_OFFSET }, { ...half, x: PINCER_OFFSET });
  } else {
    groups.unshift(horde);
  }
  return groups.map((group) => ({ ...group, expectedUnits: Math.round(plan.units) }));
}

/** Builds a complete level from generator parameters. Deterministic for a given seed. */
export function generateLevel(params: GeneratorParams): LevelDef {
  const plan: Plan = { units: params.startUnits, power: params.power };
  const segments: Segment[] = [];
  const lossPerWave = 0.1;

  for (let beat = 0; beat < params.beats; beat++) {
    const start = INTRO + beat * BEAT_LENGTH;
    // Every beat rolls on its own, so the difficulty changes wave sizes but not the course.
    const rng = new Rng(params.seed + beat * BEAT_SEED_STEP);
    const waveRng = new Rng(params.seed + beat * BEAT_SEED_STEP + 1);
    segments.push({ type: 'gates', at: start, gates: chooseGates(rng, params, plan, beat) });

    if (params.features.has('barrier') && beat > 0 && rng.chance(0.3)) {
      const side = rng.pick([-1, 1]);
      // Walls stand at one edge so there is always a free side to steer to.
      const width = rng.range(2, 3);
      segments.push({ type: 'obstacle', at: start + 13, kind: 'barrier', x: side * (5 - width / 2), width });
    }

    // Early waves are gentler so the squad can grow first.
    const ramp = clamp(0.55 + beat * 0.12, 0.55, 1.15);
    const budget = plan.units * plan.power * UNIT_DPS * EXPOSURE * params.difficulty * ramp;
    segments.push({ type: 'wave', at: start + 30, groups: buildWave(waveRng, params, budget, plan, beat) });

    // An ambush: a second wave right behind the first, with no gate to recover in between.
    const ambush =
      params.features.has('ambush') &&
      beat > 1 &&
      (params.spotlight === 'ambush' ? beat % 2 === 0 : rng.chance(0.3));
    if (ambush) {
      const groups = buildWave(waveRng, params, budget * AMBUSH_SHARE, plan, beat);
      segments.push({ type: 'wave', at: start + AMBUSH_DELAY, groups });
    }

    if (params.features.has('barrel') && rng.chance(params.spotlight === 'barrel' ? 0.9 : 0.35)) {
      segments.push({ type: 'obstacle', at: start + 26, kind: 'barrel', x: rng.range(-3.5, 3.5) });
    }
    plan.units *= 1 - lossPerWave;
  }

  const end = INTRO + params.beats * BEAT_LENGTH;
  if (params.finale !== 'none') {
    const seconds = params.finale === 'boss' ? 26 : 12;
    const hp = plan.units * plan.power * UNIT_DPS * seconds * params.difficulty * 1.6;
    const kind = params.finale;
    const hpScale = params.bossHpScale ?? Number((hp / ENEMIES[kind].hp).toFixed(3));
    segments.push({
      type: 'boss',
      at: end + 10,
      kind,
      hpScale,
      expectedUnits: Math.round(plan.units),
      fierce: kind === 'boss' && params.features.has('breath'),
    });
  }

  return {
    id: params.id,
    number: params.number,
    world: params.world,
    seed: params.seed,
    scrollSpeed: params.scrollSpeed,
    length: end + (params.finale === 'none' ? 0 : 20),
    segments,
  };
}
