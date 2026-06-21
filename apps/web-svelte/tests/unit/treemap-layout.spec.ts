import { describe, expect, it } from "vitest";
import { squarifyTreemap, type TreemapItem } from "$lib/utils/treemap-layout";

function items(values: number[]): TreemapItem<number>[] {
  return values.map((v, idx) => ({ value: v, data: idx }));
}

describe("squarifyTreemap", () => {
  it("returns nothing for empty / non-positive input", () => {
    expect(squarifyTreemap([], 100, 100)).toEqual([]);
    expect(squarifyTreemap(items([0, -5]), 100, 100)).toEqual([]);
    expect(squarifyTreemap(items([10]), 0, 100)).toEqual([]);
  });

  it("drops zero/negative values but keeps positive ones", () => {
    const tiles = squarifyTreemap(items([6, 0, 4]), 100, 100);
    expect(tiles).toHaveLength(2);
    expect(tiles.map((t) => t.data).sort()).toEqual([0, 2]);
  });

  it("a single item fills the whole rectangle", () => {
    const [tile] = squarifyTreemap(items([42]), 200, 80);
    expect(tile.x).toBeCloseTo(0);
    expect(tile.y).toBeCloseTo(0);
    expect(tile.w).toBeCloseTo(200);
    expect(tile.h).toBeCloseTo(80);
  });

  it("tile areas are proportional to value and cover the rectangle", () => {
    const values = [50, 30, 15, 5];
    const W = 300;
    const H = 200;
    const tiles = squarifyTreemap(items(values), W, H);
    expect(tiles).toHaveLength(4);

    const totalValue = values.reduce((a, b) => a + b, 0);
    const totalArea = W * H;
    for (const t of tiles) {
      const expectedArea = (t.value / totalValue) * totalArea;
      expect(t.w * t.h).toBeCloseTo(expectedArea, 5);
      // tiles stay within bounds
      expect(t.x).toBeGreaterThanOrEqual(-1e-6);
      expect(t.y).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.w).toBeLessThanOrEqual(W + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(H + 1e-6);
    }

    const coveredArea = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(coveredArea).toBeCloseTo(totalArea, 4);
  });
});
