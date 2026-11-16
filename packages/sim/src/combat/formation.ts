// 대형(횡대·종대·쐐기·방진) 자리 — 기획 D-558(1541·1542 "집결·따라가기 추가" + "대형 고르기 추가"), D-172(진형은 파티·군단에 저장),
// docs/adr/2026-10-31-combat-core.md "바뀜 (D-558)". 집결·대형 고르기·따라가기가 유닛마다 설 칸을 이것으로 고른다.
// - 앞 = 자기 편 가장자리의 맞은편 쪽. 앞줄부터 채우고, 줄 안에서는 가운데 → 왼쪽 → 오른쪽 차례다.
// - 앞줄에는 사거리가 짧은 유닛부터 선다(같으면 작은 ID) — 근접이 앞, 원거리가 뒤 [임시].
// - 지도 밖·못 서는 칸은 가운데 칸으로 바꾼다(유닛이 그 둘레에 모인다 — 옛 칸 전진 slotsOf와 같은 규칙).
// - 손으로 짠 진형(custom, 답 1965 → D-571 "기본 대형 + 진형 저장 D-172·D-179"): 유닛 사양의 formationSlot(파티 진형판에서 짠 자리)대로 선다.
//   군단이면 파티마다 진형판 하나를 옆으로 CUSTOM_PARTY_GAP 칸씩 벌려 놓는다(파티 ID 차례로 가운데 → 왼쪽 → 오른쪽). 자리가 없는 유닛은 그
//   파티 진형판 뒤에 방진으로 선다 [임시].
// 정수·결정적 계산만 쓴다.
import type { Edge, UnitState } from "./battleTypes.ts";

/** 대형 종류: 횡대(옆으로 넓게)·종대(좁고 길게)·쐐기(앞이 뾰족)·방진(네모, 기본)·손으로 짠 진형(저장한 진형판, D-172) */
export const FORMATION_SHAPES = ["line", "column", "wedge", "block", "custom"] as const;
export type FormationShape = (typeof FORMATION_SHAPES)[number];

/** 대형을 고른 적 없는 묶음의 대형 */
export const DEFAULT_FORMATION: FormationShape = "block";

/** [임시] 횡대 한 줄의 칸 수 */
export const LINE_WIDTH = 8;
/** [임시] 손으로 짠 진형: 군단 파티 진형판 사이 옆 간격(칸 — 진형판 폭 9칸 + 1) */
export const CUSTOM_PARTY_GAP = 10;
/** [임시] 손으로 짠 진형: 자리가 없는 유닛이 서는 진형판 뒤 줄(진형판 깊이 6칸) */
const CUSTOM_FALLBACK_ROW = -6;

export const isFormationShape = (value: unknown): value is FormationShape =>
  typeof value === "string" && (FORMATION_SHAPES as readonly string[]).includes(value);

/** 앞(f)·옆(l) 칸 → 지도 칸 차이(편 가장자리 기준. 0 북이면 앞 = +y) */
export function facingDelta(edge: Edge, f: number, l: number): { dx: number; dy: number } {
  if (edge === 0) return { dx: l, dy: f };
  if (edge === 1) return { dx: -f, dy: l };
  if (edge === 2) return { dx: -l, dy: -f };
  return { dx: f, dy: -l };
}

/** 줄 안 옆 자리 차례: 0, −1, +1, −2, +2 … */
const lateral = (i: number): number => (i % 2 === 1 ? -(i + 1) / 2 : i / 2);

/** n명 대형의 (앞, 옆) 자리. 앞줄이 f = 0이고 뒤줄일수록 f가 작다. custom은 유닛 자리가 없으면 방진과 같다(customOffsets) */
export function formationOffsets(n: number, shape: FormationShape): { f: number; l: number }[] {
  const out: { f: number; l: number }[] = [];
  if (shape === "wedge") {
    // r번째 줄은 2r + 1칸(0번 줄 = 뾰족한 끝 하나)
    for (let row = 0; out.length < n; row++)
      for (let i = 0; i < 2 * row + 1 && out.length < n; i++) out.push({ f: -row, l: lateral(i) });
    return out;
  }
  const width =
    shape === "line"
      ? Math.min(Math.max(1, n), LINE_WIDTH)
      : shape === "column"
        ? Math.min(2, Math.max(1, n))
        : Math.max(1, Math.ceil(Math.sqrt(n)));
  // block·custom(자리 정보 없이 부를 때)
  for (let index = 0; index < n; index++) {
    const row = Math.floor(index / width);
    out.push({ f: -row, l: lateral(index % width) });
  }
  return out;
}

/** 손으로 짠 진형의 (앞, 옆) 자리 — members 차례 그대로(파티 ID 차례로 진형판을 옆으로 벌린다) */
export function customOffsets(members: readonly UnitState[]): { f: number; l: number }[] {
  const parties = [...new Set(members.map((unit) => unit.party))].toSorted((a, b) => a - b);
  const missing = new Map<number, number>();
  return members.map((unit) => {
    const shift = lateral(parties.indexOf(unit.party)) * CUSTOM_PARTY_GAP;
    const slot = unit.formationSlot;
    if (slot && Number.isInteger(slot.f) && Number.isInteger(slot.l))
      return { f: Math.min(0, slot.f), l: slot.l + shift };
    const index = missing.get(unit.party) ?? 0;
    missing.set(unit.party, index + 1);
    const width = 3;
    return { f: CUSTOM_FALLBACK_ROW - Math.floor(index / width), l: lateral(index % width) + shift };
  });
}

/** 대형 자리에 설 차례: 사거리 짧은 유닛부터(같으면 작은 ID) */
export function formationOrder(members: readonly UnitState[]): UnitState[] {
  return members.toSorted((a, b) => a.range - b.range || a.id - b.id);
}

/**
 * 묶음의 대형 자리: 기준 칸(cx, cy)을 대형 가운데(anchor = "center") 또는 앞줄 가운데(anchor = "front")로 놓는다.
 * passable(칸, 유닛)이 거짓이거나 지도 밖이면 기준 칸
 */
export function formationSlots(
  members: readonly UnitState[],
  shape: FormationShape,
  edge: Edge,
  center: { readonly x: number; readonly y: number },
  size: number,
  passable: (cell: number, unit: UnitState) => boolean,
  anchor: "center" | "front" = "center",
): { unit: number; cell: number }[] {
  if (members.length === 0) return [];
  // 손으로 짠 진형은 유닛마다 자리가 정해져 있다(ID 차례). 나머지는 사거리 짧은 유닛부터 앞줄
  const ordered = shape === "custom" ? members.toSorted((a, b) => a.id - b.id) : formationOrder(members);
  const offsets = shape === "custom" ? customOffsets(ordered) : formationOffsets(ordered.length, shape);
  let minF = 0;
  for (const offset of offsets) minF = Math.min(minF, offset.f);
  const rows = 1 - minF;
  const shift = anchor === "center" ? Math.floor(rows / 2) : 0;
  const cx = Math.min(size - 1, Math.max(0, center.x));
  const cy = Math.min(size - 1, Math.max(0, center.y));
  const fallback = cy * size + cx;
  return ordered.map((unit, index) => {
    const offset = offsets[index] ?? { f: 0, l: 0 };
    const { dx, dy } = facingDelta(edge, offset.f + shift, offset.l);
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || y < 0 || x >= size || y >= size) return { unit: unit.id, cell: fallback };
    const cell = y * size + x;
    return { unit: unit.id, cell: unit.air || passable(cell, unit) ? cell : fallback };
  });
}

/** 자기 편 가장자리에서 떨어진 거리(칸): 클수록 앞섰다 */
export function edgeProgress(edge: Edge, x: number, y: number, size: number): number {
  if (edge === 0) return y;
  if (edge === 1) return size - 1 - x;
  if (edge === 2) return size - 1 - y;
  return x;
}

/** 맞은편 가장자리 한 줄(전진 방향 — 본 적이 없을 때 걸어갈 곳) */
export function oppositeEdgeCells(edge: Edge, size: number): number[] {
  return Array.from({ length: size }, (_, i) => {
    if (edge === 0) return (size - 1) * size + i;
    if (edge === 1) return i * size;
    if (edge === 2) return i;
    return i * size + size - 1;
  });
}

/** 자기 편 가장자리 한 줄(지연전·견제가 물러나는 쪽) */
export function ownEdgeCells(edge: Edge, size: number): number[] {
  const opposite: Edge = edge === 0 ? 2 : edge === 1 ? 3 : edge === 2 ? 0 : 1;
  return oppositeEdgeCells(opposite, size);
}

/** 유닛들의 정수 평균 자리 */
export function centroidOf(members: readonly { readonly x: number; readonly y: number }[]): {
  x: number;
  y: number;
} {
  let sx = 0;
  let sy = 0;
  for (const unit of members) {
    sx += unit.x;
    sy += unit.y;
  }
  const n = Math.max(1, members.length);
  return { x: Math.floor(sx / n), y: Math.floor(sy / n) };
}
