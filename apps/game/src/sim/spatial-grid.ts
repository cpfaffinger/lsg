/**
 * Uniform grid over the lane (X/Z plane) for broad-phase collision queries.
 * Rebuilt every simulation step; items are referenced by index into the caller's array.
 */
export class SpatialGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<number, number[]>();
  private readonly pool: number[][] = [];

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): number {
    // Lane coordinates are small; offset keeps both components positive for packing.
    return (cx + 512) * 4096 + (cz + 2048);
  }

  clear(): void {
    for (const list of this.cells.values()) {
      list.length = 0;
      this.pool.push(list);
    }
    this.cells.clear();
  }

  insert(index: number, x: number, z: number, radius: number): void {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) {
          list = this.pool.pop() ?? [];
          this.cells.set(k, list);
        }
        list.push(index);
      }
    }
  }

  /** Calls `visit` for every index whose cells overlap the query box; may repeat indices. */
  query(x: number, z: number, radius: number, visit: (index: number) => boolean | void): void {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const index of list) {
          if (visit(index) === true) return;
        }
      }
    }
  }
}
