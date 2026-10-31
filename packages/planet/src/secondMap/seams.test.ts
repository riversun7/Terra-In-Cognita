// 이음매 시험 — ADR 46 7절 "다음 맵 이동 때 연결이 자연스러운가". S2 시험 행성 F6(칸 24,576개)에서
// 면 안쪽·면 경계(24가지 연결)·정육면체 꼭짓점·대각 이웃·강이 지나는 칸을 골라 맞닿은 2차맵끼리 본다.
// - 공유 꼭짓점(정육면체 점이 같은 꼭짓점)의 높이·물 높이가 비트까지 같다.
// - 경계를 가로지르는 높이 2차 차분의 평균이 2차맵 안쪽과 비슷하다(곧은 주름 없음).
// - 강이 경계를 건너는 쌍이 실제로 있다(변·꼭짓점 둘 다) — 강 규칙을 시험이 거친다.
import { describe, expect, it } from "vitest";
import { type CellKey, cellKey } from "../cellKey.ts";
import { FACES } from "../faces.ts";
import { cellsPerSide } from "../levels.ts";
import { stepCell } from "../neighbors.ts";
import { WATER_RIVER } from "../tiles/fields.ts";
import { type SecondMapTerrain, generateSecondMap } from "./generate.ts";
import { SM_TERRAIN, SM_VERTICES, cubePoint, mapCoords, vertexI, vertexJ } from "./layout.ts";
import { receiverOf } from "./rivers.ts";
import { testPlanetValues, testPropRules } from "./testPlanetValues.ts";

const LEVEL = 6;
const values = testPlanetValues(LEVEL);
const rules = testPropRules();
const n = cellsPerSide(LEVEL);

const cache = new Map<number, SecondMapTerrain>();
function terrain(key: number): SecondMapTerrain {
  let result = cache.get(key);
  if (!result) {
    result = generateSecondMap(values, key, rules);
    cache.set(key, result);
  }
  return result;
}

/** 경계 꼭짓점: 정육면체 점 열쇠 → (행, 열) */
function boundary(key: number): Map<string, [number, number]> {
  const map = mapCoords(key);
  const out = new Map<string, [number, number]>();
  for (let r = 0; r < SM_VERTICES; r++) {
    for (let c = 0; c < SM_VERTICES; c++) {
      if (r !== 0 && r !== SM_TERRAIN && c !== 0 && c !== SM_TERRAIN) continue;
      out.set(cubePoint(map.face, LEVEL + 7, vertexI(map, c), vertexJ(map, r)).join(","), [r, c]);
    }
  }
  return out;
}

/** 경계 꼭짓점에서 안쪽으로 한 칸·두 칸(변 위 꼭짓점만, 꼭짓점 모서리는 null) */
function inward(r: number, c: number, step: number): [number, number] | null {
  const onC = c === 0 || c === SM_TERRAIN;
  const onR = r === 0 || r === SM_TERRAIN;
  if (onC && onR) return null;
  if (onC) return [r, c === 0 ? step : SM_TERRAIN - step];
  return [r === 0 ? step : SM_TERRAIN - step, c];
}

const cellIndexOf = (key: number): number => {
  const map = mapCoords(key);
  return map.face * n * n + map.j * n + map.i;
};

interface PairStats {
  sharedVertices: number;
  riverOnEdge: boolean;
  across: number[];
  inside: number[];
}

/** 두 2차맵의 공유 꼭짓점을 맞춰 보고(다르면 실패) 주름 지표를 모은다 */
function comparePair(a: number, b: number, stats: PairStats): void {
  const ta = terrain(a);
  const tb = terrain(b);
  const ba = boundary(a);
  const bb = boundary(b);
  for (const [cube, [ra, ca]] of ba) {
    const other = bb.get(cube);
    if (!other) continue;
    const [rb, cb] = other;
    const ia = ra * SM_VERTICES + ca;
    const ib = rb * SM_VERTICES + cb;
    stats.sharedVertices += 1;
    expect(ta.heightsCm[ia], `height ${a}/${b} at ${cube}`).toBe(tb.heightsCm[ib]);
    expect(ta.waterLevelCm[ia], `water ${a}/${b} at ${cube}`).toBe(tb.waterLevelCm[ib]);
    const a1 = inward(ra, ca, 1);
    const a2 = inward(ra, ca, 2);
    const b1 = inward(rb, cb, 1);
    const along = ra === 0 || ra === SM_TERRAIN ? ca : ra;
    // 물에 잠긴 꼭짓점(강 물길이 경계에서 건너는 자리 등)은 주름 지표에서 뺀다: 물길 단면이 경계 가운데라 일부러 깊다
    const dry = (ta.waterLevelCm[ia] ?? 0) <= (ta.heightsCm[ia] ?? 0);
    if (dry && a1 && a2 && b1 && along > 8 && along < SM_TERRAIN - 8) {
      const shared = ta.heightsCm[ia] ?? 0;
      stats.across.push(Math.abs(h(ta, a1) - 2 * shared + h(tb, b1)));
      stats.inside.push(Math.abs(h(ta, a2) - 2 * h(ta, a1) + shared));
    }
  }
}

/** 꼭짓점 (행, 열)의 높이 */
const h = (t: SecondMapTerrain, [r, c]: [number, number]): number => t.heightsCm[r * SM_VERTICES + c] ?? 0;

function emptyStats(): PairStats {
  return { sharedVertices: 0, riverOnEdge: false, across: [], inside: [] };
}

const mean = (list: readonly number[]): number =>
  list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);

describe("2차맵 이음매", () => {
  it("면 경계 24가지 연결(변 끝·가운데 자리)에서 공유 변이 같다", () => {
    const stats = emptyStats();
    for (const face of FACES) {
      for (const [i, j, di, dj] of [
        [0, 31, -1, 0],
        [0, 0, -1, 0],
        [n - 1, 31, 1, 0],
        [n - 1, n - 1, 1, 0],
        [31, 0, 0, -1],
        [n - 1, 0, 0, -1],
        [31, n - 1, 0, 1],
        [0, n - 1, 0, 1],
      ] as const) {
        const a = cellKey(face, LEVEL, i, j);
        const b = stepCell(a, di, dj);
        if (b === null) throw new Error("edge neighbour must exist");
        comparePair(a, b, stats);
      }
    }
    // 48쌍 × 129꼭짓점
    expect(stats.sharedVertices).toBe(48 * 129);
    expect(mean(stats.across)).toBeLessThan(mean(stats.inside) * 1.25 + 1);
  });

  it("정육면체 꼭짓점 8곳: 칸 셋이 꼭짓점·변을 같은 값으로 나눈다", () => {
    const stats = emptyStats();
    let corners = 0;
    for (const face of FACES) {
      for (const [i, j] of [
        [0, 0],
        [n - 1, 0],
        [0, n - 1],
        [n - 1, n - 1],
      ] as const) {
        const a = cellKey(face, LEVEL, i, j);
        for (const [di, dj] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          const b = stepCell(a, di, dj);
          if (b === null) {
            corners += 1;
            continue;
          }
          comparePair(a, b, stats);
        }
      }
    }
    // 꼭짓점 칸 24개마다 없는 대각선이 하나
    expect(corners).toBe(24);
    expect(stats.sharedVertices).toBeGreaterThan(0);
  });

  it("강이 지나는 칸과 그 8이웃: 공유 변·꼭짓점이 같고, 강이 변과 꼭짓점을 실제로 건넌다", () => {
    const stats = emptyStats();
    const rivers: number[] = [];
    let edgeFlows = 0;
    let cornerFlows = 0;
    for (let cell = 0; cell < values.water.length && rivers.length < 10; cell += 37) {
      if (((values.water[cell] ?? 0) & WATER_RIVER) === 0) continue;
      const receiver = receiverOf(values, cell);
      if (receiver < 0) continue;
      rivers.push(cell);
    }
    expect(rivers.length).toBeGreaterThan(3);
    for (const cell of rivers) {
      const face = FACES[Math.floor(cell / (n * n))] ?? 0;
      const j = Math.floor((cell - face * n * n) / n);
      const i = cell - face * n * n - j * n;
      const a = cellKey(face, LEVEL, i, j);
      const receiver = receiverOf(values, cell);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const b = stepCell(a, di, dj);
          if (b === null) continue;
          if (cellIndexOf(b) === receiver) {
            if (di !== 0 && dj !== 0) cornerFlows += 1;
            else edgeFlows += 1;
          }
          comparePair(a, b, stats);
        }
      }
    }
    expect(edgeFlows).toBeGreaterThan(0);
    expect(cornerFlows).toBeGreaterThan(0);
    expect(mean(stats.across)).toBeLessThan(mean(stats.inside) * 1.25 + 1);
  });

  it("같은 2차맵을 두 번 만들면 비트까지 같다(결정적)", () => {
    const key: CellKey = cellKey(2, LEVEL, 10, 50);
    const first = generateSecondMap(values, key, rules);
    const second = generateSecondMap(values, key, rules);
    expect(second.hash).toBe(first.hash);
    expect([...second.heightsCm]).toEqual([...first.heightsCm]);
  });
});
