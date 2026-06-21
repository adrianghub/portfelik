/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
 *
 * Pure geometry helper: takes value-weighted items plus a target rectangle and
 * returns one tile per positive-value item, laid out to keep tiles as close to
 * square as possible. No DOM, no framework — trivially unit-testable.
 */

export interface TreemapItem<T> {
  value: number;
  data: T;
}

export interface TreemapTile<T> {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  data: T;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Worst aspect ratio of a row of areas laid along a side of length `side`. */
function worstRatio(areas: number[], side: number): number {
  if (areas.length === 0 || side <= 0) return Infinity;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const a of areas) {
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/** Place a finished row of tiles inside `rect`, returning the leftover rect. */
function layoutRow<T>(
  row: Array<{ area: number; value: number; data: T }>,
  rect: Rect,
  tiles: TreemapTile<T>[]
): Rect {
  const rowSum = row.reduce((s, r) => s + r.area, 0);
  if (rowSum <= 0) return rect;

  if (rect.w <= rect.h) {
    // Horizontal band across the top; tiles laid left → right.
    const bandHeight = rowSum / rect.w;
    let cursorX = rect.x;
    for (const r of row) {
      const tileWidth = r.area / bandHeight;
      tiles.push({
        x: cursorX,
        y: rect.y,
        w: tileWidth,
        h: bandHeight,
        value: r.value,
        data: r.data,
      });
      cursorX += tileWidth;
    }
    return { x: rect.x, y: rect.y + bandHeight, w: rect.w, h: rect.h - bandHeight };
  }

  // Vertical band down the left; tiles laid top → bottom.
  const bandWidth = rowSum / rect.h;
  let cursorY = rect.y;
  for (const r of row) {
    const tileHeight = r.area / bandWidth;
    tiles.push({
      x: rect.x,
      y: cursorY,
      w: bandWidth,
      h: tileHeight,
      value: r.value,
      data: r.data,
    });
    cursorY += tileHeight;
  }
  return { x: rect.x + bandWidth, y: rect.y, w: rect.w - bandWidth, h: rect.h };
}

export function squarifyTreemap<T>(
  items: TreemapItem<T>[],
  width: number,
  height: number
): TreemapTile<T>[] {
  const positive = items.filter((i) => i.value > 0);
  const total = positive.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];

  const scale = (width * height) / total;
  const scaled = positive.map((i) => ({ area: i.value * scale, value: i.value, data: i.data }));

  const tiles: TreemapTile<T>[] = [];
  let rect: Rect = { x: 0, y: 0, w: width, h: height };
  let row: typeof scaled = [];
  let i = 0;

  while (i < scaled.length) {
    const next = scaled[i];
    const side = Math.min(rect.w, rect.h);
    const currentWorst = worstRatio(
      row.map((r) => r.area),
      side
    );
    const nextWorst = worstRatio([...row.map((r) => r.area), next.area], side);

    if (row.length === 0 || nextWorst <= currentWorst) {
      row.push(next);
      i += 1;
    } else {
      rect = layoutRow(row, rect, tiles);
      row = [];
    }
  }
  if (row.length > 0) layoutRow(row, rect, tiles);

  return tiles;
}
