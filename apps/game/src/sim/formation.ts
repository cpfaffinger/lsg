import { BALANCE } from './balance.ts';
import { LANE_WIDTH } from './world.ts';

const MAX_SPACING = BALANCE.squad.unitSpacing;
const MIN_SPACING = 0.56;
const UNIT_RADIUS = 0.35;
/** Columns that fit into the lane at the tightest spacing. */
export const MAX_COLUMNS = Math.floor((LANE_WIDTH - 1) / MIN_SPACING);

export function visibleUnits(count: number): number {
  return Math.min(Math.max(0, Math.floor(count)), BALANCE.squad.visibleCap);
}

/** Large squads pack tighter so they stay compact on screen. */
export function unitSpacing(count: number): number {
  const t = Math.min(1, Math.max(0, (visibleUnits(count) - 40) / 120));
  return MAX_SPACING + (MIN_SPACING - MAX_SPACING) * t;
}

function maxColumns(count: number): number {
  return Math.floor((LANE_WIDTH - 1) / unitSpacing(count));
}

/** Squads grow wider first (more satisfying, easier to steer into gates), then deeper. */
export function formationColumns(count: number): number {
  const visible = visibleUnits(count);
  if (visible <= 1) return 1;
  return Math.min(maxColumns(count), Math.ceil(Math.sqrt(visible * 1.6)));
}

export function formationRows(count: number): number {
  const visible = visibleUnits(count);
  if (visible === 0) return 0;
  return Math.ceil(visible / formationColumns(count));
}

/** Half of the squad's width including the unit radius. */
export function squadHalfWidth(count: number): number {
  const cols = formationColumns(count);
  return ((cols - 1) * unitSpacing(count)) / 2 + UNIT_RADIUS;
}

/** Depth of the squad behind its front row (towards +z). */
export function squadDepth(count: number): number {
  const rows = formationRows(count);
  return Math.max(0, rows - 1) * unitSpacing(count) + UNIT_RADIUS;
}

export interface SlotOffset {
  x: number;
  z: number;
}

/**
 * Offset of unit `index` relative to the squad centre (front row at z = 0, rows towards +z).
 * The last, partially filled row is centred.
 */
export function formationSlot(index: number, count: number, out: SlotOffset): SlotOffset {
  const visible = visibleUnits(count);
  const cols = formationColumns(count);
  const spacing = unitSpacing(count);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const rowsTotal = Math.ceil(visible / cols);
  const inThisRow = row === rowsTotal - 1 ? visible - row * cols : cols;
  out.x = (col - (inThisRow - 1) / 2) * spacing;
  out.z = row * spacing;
  return out;
}
