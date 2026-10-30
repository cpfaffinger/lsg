import { BALANCE } from './balance.ts';
import { LANE_WIDTH } from './world.ts';

const SPACING = BALANCE.squad.unitSpacing;
const UNIT_RADIUS = 0.35;
/** Columns that fit into the lane with a small margin. */
export const MAX_COLUMNS = Math.floor((LANE_WIDTH - 1) / SPACING);

export function visibleUnits(count: number): number {
  return Math.min(Math.max(0, Math.floor(count)), BALANCE.squad.visibleCap);
}

/** Squads grow wider first (more satisfying, easier to steer into gates), then deeper. */
export function formationColumns(count: number): number {
  const visible = visibleUnits(count);
  if (visible <= 1) return 1;
  return Math.min(MAX_COLUMNS, Math.ceil(Math.sqrt(visible * 1.6)));
}

export function formationRows(count: number): number {
  const visible = visibleUnits(count);
  if (visible === 0) return 0;
  return Math.ceil(visible / formationColumns(count));
}

/** Half of the squad's width including the unit radius. */
export function squadHalfWidth(count: number): number {
  const cols = formationColumns(count);
  return ((cols - 1) * SPACING) / 2 + UNIT_RADIUS;
}

/** Depth of the squad behind its front row (towards +z). */
export function squadDepth(count: number): number {
  const rows = formationRows(count);
  return Math.max(0, rows - 1) * SPACING + UNIT_RADIUS;
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
  const row = Math.floor(index / cols);
  const col = index % cols;
  const rowsTotal = Math.ceil(visible / cols);
  const inThisRow = row === rowsTotal - 1 ? visible - row * cols : cols;
  out.x = (col - (inThisRow - 1) / 2) * SPACING;
  out.z = row * SPACING;
  return out;
}
