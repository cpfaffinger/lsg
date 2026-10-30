/**
 * World coordinate conventions (shared by simulation and rendering):
 * - X: horizontal across the lane, 0 = lane centre.
 * - Z: along the lane. The squad stays near z = 0; content spawns at negative z
 *   (far away) and scrolls towards +z.
 * - Y: up (rendering only; the simulation is 2D on the X/Z plane).
 */
export const LANE_HALF_WIDTH = 5;
export const LANE_WIDTH = LANE_HALF_WIDTH * 2;
/** Distance ahead of the squad where new content appears. */
export const SPAWN_DISTANCE = 90;
/** Content behind the squad beyond this z is removed. */
export const DESPAWN_Z = 12;
export const SQUAD_Z = 0;
