/** Matches getSmoothStepPath's own default `offset` — how far a path runs straight out
 *  from a handle before it's allowed to bend. Used here only to estimate where that bend
 *  would land by default, so overlap detection lines up with what actually gets drawn. */
export const STEP_OFFSET = 20;

/** Perpendicular gap between adjacent lanes once relations are spread apart. */
const LANE_SPACING = 20;

/** How close two relations' natural bend points have to land (in px) before they're
 *  considered to be running through the same corridor. */
const CORRIDOR_THRESHOLD = 24;

export function dirVector(position: string): { x: number; y: number } {
  switch (position) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    default:
      return { x: 0, y: 1 };
  }
}

export interface EdgeGeometry {
  id: string;
  /** Where this edge's orthogonal path would bend by default (no explicit centerX). */
  centerX: number;
  yMin: number;
  yMax: number;
}

/**
 * Two relations between *different* table/column pairs can still end up with the same
 * default bend point — e.g. several source tables in the same column feeding one target,
 * or a shared target column pulling in several parents — and orthogonal step routing then
 * draws their vertical runs stacked exactly on top of each other over their shared Y range.
 * Unlike the anchor-level "fan" (same handle, offset right at the node), this can happen
 * anywhere along the path, between relations that don't share an endpoint at all.
 *
 * Groups relations whose bend point sits in the same corridor (within CORRIDOR_THRESHOLD)
 * over an overlapping Y range — transitively, via union-find, so a chain of pairwise
 * overlaps all lands in one group — then spreads each group into its own parallel lane
 * around the group's shared corridor. Relations with no collision are left untouched.
 */
export function computeEdgeLanes(geometries: EdgeGeometry[]): Map<string, number> {
  const n = geometries.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = geometries[i];
      const b = geometries[j];
      const sameCorridor = Math.abs(a.centerX - b.centerX) < CORRIDOR_THRESHOLD;
      const overlapsY = a.yMin <= b.yMax && b.yMin <= a.yMax;
      if (sameCorridor && overlapsY) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }

  const laneCenterXByEdge = new Map<string, number>();
  for (const members of groups.values()) {
    if (members.length <= 1) continue;
    const group = members.map((i) => geometries[i]);
    const groupCenterX = group.reduce((sum, g) => sum + g.centerX, 0) / group.length;
    // Top-to-bottom lane order so the fan reads naturally instead of scrambled.
    const sorted = [...group].sort(
      (a, b) => (a.yMin + a.yMax) / 2 - (b.yMin + b.yMax) / 2 || a.id.localeCompare(b.id)
    );
    sorted.forEach((g, index) => {
      const offset = (index - (sorted.length - 1) / 2) * LANE_SPACING;
      laneCenterXByEdge.set(g.id, groupCenterX + offset);
    });
  }

  return laneCenterXByEdge;
}
