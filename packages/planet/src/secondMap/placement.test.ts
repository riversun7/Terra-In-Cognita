// 2차맵 배치 시험(ADR 46 4·7절, ADR 35 "숲") — S2 시험 행성 F6, 시험 소품 규칙(팩 사본).
// - 숲 나누기 몫(숲 밀도가 높은 2차맵에서 차폐 약 35%·은폐 약 20%), 빈 길에는 차폐가 없다.
// - 이어짐: 크기 등급 1이 설 수 있는 칸은 물·벼랑으로 갈린 곳을 빼고 모두 이어진다(갇힌 곳 없음, 지형만 보고 따로 센다).
//   갇힌 곳 잇기는 차폐를 가장 적게 뚫는다(합성 격자).
// - 빈 길이 2차맵 경계(면 경계 포함)를 넘어 이어지고, 엄폐 무늬가 경계에서 안쪽만큼 이어진다.
// - 같은 바이옴이라도 환경(기온 등)에 따라 나무 그림 비중이 달라진다(사용자 요구).
// - 반복 막기: 같은 바이옴 이웃 2차맵의 지문(지표·엄폐 몫, 높이 분위, 8×8 축소)이 서로 다르고 같은 지문이 없다.
import { MAP_PROP_ARTS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { type CellKey, cellKey } from "../cellKey.ts";
import { FACES } from "../faces.ts";
import { cellsPerSide } from "../levels.ts";
import { stepCell } from "../neighbors.ts";
import { WATER_LAKE, WATER_OCEAN } from "../tiles/fields.ts";
import { stepMapCell } from "./edges.ts";
import { type SecondMapTerrain, generateSecondMap } from "./generate.ts";
import { SM_PLACEMENT, SM_TERRAIN, SM_VERTICES, mapCoords } from "./layout.ts";
import { connectPockets } from "./pockets.ts";
import { SM_CLIFF_RELIEF_CM, laneMask } from "./placement.ts";
import { SM_SURFACE } from "./surfaces.ts";
import { testPlanetValues, testPropRules } from "./testPlanetValues.ts";

const LEVEL = 6;
const values = testPlanetValues(LEVEL);
const rules = testPropRules();
const n = cellsPerSide(LEVEL);
const CELLS = SM_PLACEMENT * SM_PLACEMENT;

const cache = new Map<number, SecondMapTerrain>();
function terrain(key: number): SecondMapTerrain {
  let result = cache.get(key);
  if (!result) {
    result = generateSecondMap(values, key, rules);
    cache.set(key, result);
  }
  return result;
}

const keyOf = (cell: number): CellKey => {
  const face = FACES[Math.floor(cell / (n * n))] ?? 0;
  const rest = cell - face * n * n;
  return cellKey(face, LEVEL, rest % n, Math.floor(rest / n));
};
const cellOf = (key: number): number => {
  const map = mapCoords(key);
  return map.face * n * n + map.j * n + map.i;
};
const isLand = (cell: number): boolean => ((values.water[cell] ?? 0) & (WATER_OCEAN | WATER_LAKE)) === 0;

/** 둘레 9칸이 모두 땅이고 숲 밀도가 minForest 이상인 2차맵(앞에서 count개) */
function forestMaps(minForest: number, count: number): CellKey[] {
  const out: CellKey[] = [];
  for (let cell = 0; cell < values.forest.length && out.length < count; cell++) {
    if ((values.forest[cell] ?? 0) < minForest || !isLand(cell)) continue;
    const key = keyOf(cell);
    let ok = true;
    for (let dj = -1; dj <= 1 && ok; dj++) {
      for (let di = -1; di <= 1 && ok; di++) {
        const other = di === 0 && dj === 0 ? key : stepCell(key, di, dj);
        if (other === null || !isLand(cellOf(other)) || (values.forest[cellOf(other)] ?? 0) < minForest)
          ok = false;
      }
    }
    if (ok) out.push(key);
  }
  return out;
}

/** 배치 칸이 지형만으로 설 수 있는가(물·벼랑이 아님) — 생성기와 따로 센다 */
function terrainOpen(t: SecondMapTerrain): Uint8Array {
  const open = new Uint8Array(CELLS);
  for (let py = 0; py < SM_PLACEMENT; py++) {
    for (let px = 0; px < SM_PLACEMENT; px++) {
      const r = py >> 1;
      const c = px >> 1;
      const top = r * SM_VERTICES + c;
      const h = [top, top + 1, top + SM_VERTICES, top + SM_VERTICES + 1].map((v) => t.heightsCm[v] ?? 0);
      const relief = Math.max(...h) - Math.min(...h);
      const kind = t.surface[r * SM_TERRAIN + c] ?? 0;
      open[py * SM_PLACEMENT + px] = kind !== SM_SURFACE.water && relief < SM_CLIFF_RELIEF_CM ? 1 : 0;
    }
  }
  return open;
}

/** 네 방향 연결 요소 번호(enter가 참인 칸만, 아니면 −1) */
function components(enter: (i: number) => boolean): Int32Array {
  const label = new Int32Array(CELLS).fill(-1);
  const queue = new Int32Array(CELLS);
  let next = 0;
  for (let start = 0; start < CELLS; start++) {
    if (label[start] !== -1 || !enter(start)) continue;
    let head = 0;
    let tail = 0;
    label[start] = next;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++] ?? 0;
      const x = i % SM_PLACEMENT;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < SM_PLACEMENT - 1 ? i + 1 : -1,
        i - SM_PLACEMENT,
        i + SM_PLACEMENT,
      ]) {
        if (j < 0 || j >= CELLS || label[j] !== -1 || !enter(j)) continue;
        label[j] = next;
        queue[tail++] = j;
      }
    }
    next += 1;
  }
  return label;
}

const onBorder = (i: number): boolean => {
  const x = i % SM_PLACEMENT;
  const y = Math.floor(i / SM_PLACEMENT);
  return x === 0 || y === 0 || x === SM_PLACEMENT - 1 || y === SM_PLACEMENT - 1;
};

/** 시험 격자에 정사각형 고리(테두리) 값을 쓴다 */
const ring = (x0: number, y0: number, size: number, value: number, target: Uint8Array) => {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      if (x === x0 || y === y0 || x === x0 + size - 1 || y === y0 + size - 1)
        target[y * SM_PLACEMENT + x] = value;
    }
  }
};

/** 몫 평균 */
const avg = (list: readonly { share: number }[]) => list.reduce((sum, s) => sum + s.share, 0) / list.length;

/** 2차맵 지문: 지표 몫 11 + 엄폐 몫 3 + 높이 분위 3(m) + 8×8 차폐 축소 64 */
const fingerprint = (t: SecondMapTerrain): number[] => {
  const surface = Array.from({ length: 11 }, () => 0);
  for (const kind of t.surface) surface[kind] = (surface[kind] ?? 0) + 1 / t.surface.length;
  const cover = [0, 0, 0];
  for (const value of t.cover) cover[value] = (cover[value] ?? 0) + 1 / t.cover.length;
  const heights = [...t.heightsCm].toSorted((p, q) => p - q);
  const quantiles = [0.1, 0.5, 0.9].map((q) => (heights[Math.floor(q * (heights.length - 1))] ?? 0) / 1000);
  // 8×8 축소: 덩이마다 차폐 몫
  const thumb = Array.from({ length: 64 }, () => 0);
  for (let i = 0; i < CELLS; i++) {
    if (t.cover[i] !== 2) continue;
    const bx = (i % SM_PLACEMENT) >> 5;
    const by = Math.floor(i / SM_PLACEMENT) >> 5;
    thumb[by * 8 + bx] = (thumb[by * 8 + bx] ?? 0) + 1 / 1024;
  }
  return [...surface, ...cover, ...quantiles, ...thumb];
};

/** 지문 거리(유클리드) */
const distance = (p: readonly number[], q: readonly number[]) =>
  Math.sqrt(p.reduce((sum, value, k) => sum + (value - (q[k] ?? 0)) * (value - (q[k] ?? 0)), 0));

describe("2차맵 배치", () => {
  const forests = forestMaps(200, 6);

  it("숲 밀도가 높은 2차맵: 차폐 약 35%·은폐 약 20%(숲 밀도에 비례), 빈 길에는 차폐가 없다", () => {
    expect(forests.length).toBeGreaterThanOrEqual(4);
    for (const key of forests) {
      const t = terrain(key);
      const lane = laneMask(mapCoords(key), values.seed);
      const density = values.forest[cellOf(key)] ?? 0;
      let counted = 0;
      const shares = [0, 0, 0];
      for (let i = 0; i < CELLS; i++) {
        const cover = t.cover[i] ?? 0;
        if (lane[i] === 1) {
          expect(cover, `lane cell ${i} of ${key}`).not.toBe(2);
          continue;
        }
        counted += 1;
        shares[cover] = (shares[cover] ?? 0) + 1;
      }
      const dense = (shares[2] ?? 0) / counted;
      const sparse = (shares[1] ?? 0) / counted;
      // 출발값 × F/255 ± 덩이 노이즈·흩기 소품·갇힌 곳 잇기 몫
      expect(dense, `dense ${key}`).toBeGreaterThan((0.35 * density) / 255 - 0.1);
      expect(dense, `dense ${key}`).toBeLessThan((0.35 * density) / 255 + 0.12);
      expect(sparse, `sparse ${key}`).toBeGreaterThan((0.2 * density) / 255 - 0.08);
      expect(sparse, `sparse ${key}`).toBeLessThan((0.2 * density) / 255 + 0.12);
    }
  });

  it("빈 길은 16칸마다 폭 2칸이고 흔들린다(곧은 줄 되풀이가 아니다)", () => {
    const lane = laneMask(mapCoords(cellKey(0, LEVEL, 20, 20)), values.seed);
    let share = 0;
    for (let i = 0; i < CELLS; i++) share += lane[i] ?? 0;
    // 가로·세로 띠 2/16씩, 겹친 곳 빼면 약 23%
    expect(share / CELLS).toBeGreaterThan(0.18);
    expect(share / CELLS).toBeLessThan(0.28);
    // 같은 열이 위에서 아래까지 모두 길인 곧은 세로 줄은 거의 없다
    let straight = 0;
    for (let x = 0; x < SM_PLACEMENT; x++) {
      let all = true;
      for (let y = 0; y < SM_PLACEMENT && all; y++) all = lane[y * SM_PLACEMENT + x] === 1;
      if (all) straight += 1;
    }
    expect(straight).toBeLessThan(4);
  });

  it("크기 등급 1이 설 수 있는 칸은 물·벼랑으로 갈린 곳을 빼고 이어져 있다(숲·바위가 가둔 곳이 없다)", () => {
    const keys = [...forests, keyOf(8 + 15 * n), keyOf(7 + 7 * n), keyOf(47 + n)];
    for (const key of keys) {
      const t = terrain(key);
      const open = terrainOpen(t);
      const passable = (i: number): boolean => open[i] === 1 && t.cover[i] !== 2;
      const withCover = components(passable);
      const terrainOnly = components((i) => open[i] === 1);
      // 지형 요소마다: 그 안의 설 수 있는 칸이 엄폐 요소 하나에 모두 들거나, 엄폐 요소마다 가장자리에 닿는다
      const touches = new Map<number, boolean>();
      for (let i = 0; i < CELLS; i++) {
        const c = withCover[i] ?? -1;
        if (c >= 0 && onBorder(i)) touches.set(c, true);
      }
      const coverOfTerrain = new Map<number, Set<number>>();
      for (let i = 0; i < CELLS; i++) {
        const c = withCover[i] ?? -1;
        if (c < 0) continue;
        const group = terrainOnly[i] ?? -1;
        const set = coverOfTerrain.get(group) ?? new Set<number>();
        set.add(c);
        coverOfTerrain.set(group, set);
      }
      for (const [group, set] of coverOfTerrain) {
        if (set.size <= 1) continue;
        const enclosed = [...set].filter((c) => !touches.get(c));
        expect(enclosed, `map ${key} terrain group ${group}: ${set.size} pieces`).toEqual([]);
      }
    }
  });

  it("갇힌 곳 잇기: 숲 고리 안 빈터는 차폐를 가장 적게(한 칸) 뚫어 잇고, 물로 갈린 섬과 큰 덩이는 그대로다", () => {
    const open = new Uint8Array(CELLS).fill(1);
    const cover = new Uint8Array(CELLS);
    ring(100, 100, 7, 2, cover); // 숲 고리(두께 1) → 안쪽 5×5가 갇힌다
    ring(99, 99, 9, 2, cover); // 두께 2로
    ring(150, 150, 7, 0, open); // 물 고리 안 섬 → 지형으로 갈렸으니 그대로
    const before = cover.slice();
    const carved = connectPockets(open, cover);
    // 두께 2 고리를 뚫는 데 차폐 두 칸
    expect(carved).toBe(2);
    let changed = 0;
    for (let i = 0; i < CELLS; i++) {
      if (cover[i] !== before[i]) {
        changed += 1;
        expect([before[i], cover[i]]).toEqual([2, 1]);
      }
    }
    expect(changed).toBe(2);
    // 빈터는 빈터 그대로, 이제 가장자리와 이어진다
    expect(cover[103 * SM_PLACEMENT + 103]).toBe(0);
    const pieces = components((i) => open[i] === 1 && cover[i] !== 2);
    expect(pieces[103 * SM_PLACEMENT + 103]).toBe(pieces[0]);
    // 섬은 물로 갈려 따로다
    expect(pieces[153 * SM_PLACEMENT + 153]).not.toBe(pieces[0]);
    expect(connectPockets(open, cover)).toBe(0);
  });

  it("빈 길이 2차맵 경계를 넘어 이어진다(면 경계·뒤집힌 변 포함)", () => {
    let matched = 0;
    let total = 0;
    for (const face of FACES) {
      for (const [i, j, dx, dy] of [
        [0, 20, -1, 0],
        [n - 1, 20, 1, 0],
        [20, 0, 0, 1],
        [20, n - 1, 0, -1],
        [10, 10, 1, 0],
      ] as const) {
        const a = cellKey(face, LEVEL, i, j);
        const laneA = laneMask(mapCoords(a), values.seed);
        const masks = new Map<number, Uint8Array>();
        for (let k = 0; k < SM_PLACEMENT; k++) {
          const x = dx < 0 ? 0 : dx > 0 ? SM_PLACEMENT - 1 : k;
          const y = dy > 0 ? SM_PLACEMENT - 1 : dy < 0 ? 0 : k;
          if (laneA[y * SM_PLACEMENT + x] !== 1) continue;
          const step = stepMapCell(a, 8, x, y, dx, dy);
          if (!step) continue;
          let laneB = masks.get(step.mapKey);
          if (!laneB) {
            laneB = laneMask(mapCoords(step.mapKey), values.seed);
            masks.set(step.mapKey, laneB);
          }
          total += 1;
          // 띠 가장자리는 흔들기 때문에 한 칸 어긋날 수 있다: 맞은편 칸이나 그 옆(변을 따라 ±1)이 길이면 이어진 것
          const along =
            dx !== 0
              ? [0, 1, -1].map((d) => [step.x, step.y + d])
              : [0, 1, -1].map((d) => [step.x + d, step.y]);
          if (
            along.some(
              ([x2 = -1, y2 = -1]) =>
                x2 >= 0 &&
                y2 >= 0 &&
                x2 < SM_PLACEMENT &&
                y2 < SM_PLACEMENT &&
                laneB[y2 * SM_PLACEMENT + x2] === 1,
            )
          ) {
            matched += 1;
          }
        }
      }
    }
    expect(total).toBeGreaterThan(500);
    expect(matched / total).toBeGreaterThan(0.97);
  });

  it("엄폐 무늬가 2차맵 경계에서 안쪽만큼 이어진다(경계 너머 같음 비율 ≥ 안쪽의 0.9배)", () => {
    let acrossSame = 0;
    let insideSame = 0;
    let pairs = 0;
    for (const a of forests) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const ta = terrain(a);
        for (let k = 0; k < SM_PLACEMENT; k++) {
          const x = dx > 0 ? SM_PLACEMENT - 1 : k;
          const y = dy > 0 ? SM_PLACEMENT - 1 : k;
          const step = stepMapCell(a, 8, x, y, dx, dy);
          if (!step) continue;
          const tb = terrain(step.mapKey);
          const here = ta.cover[y * SM_PLACEMENT + x] ?? 0;
          const inward = ta.cover[(y - dy) * SM_PLACEMENT + (x - dx)] ?? 0;
          const across = tb.cover[step.y * SM_PLACEMENT + step.x] ?? 0;
          pairs += 1;
          if (here === across) acrossSame += 1;
          if (here === inward) insideSame += 1;
        }
      }
    }
    expect(pairs).toBeGreaterThan(1000);
    expect(acrossSame / pairs).toBeGreaterThanOrEqual(0.9 * (insideSame / pairs));
  });

  it("같은 바이옴이라도 기온에 따라 나무 그림 비중이 달라진다(침엽수 몫이 추운 곳에서 크다)", () => {
    const conifer = MAP_PROP_ARTS.indexOf("tree_conifer");
    const samples: { temperature: number; share: number }[] = [];
    for (const key of forestMaps(120, 40)) {
      const t = terrain(key);
      let trees = 0;
      let conifers = 0;
      for (let i = 0; i < CELLS; i++) {
        if ((t.cover[i] ?? 0) === 0 || (t.art[i] ?? 0) === 0) continue;
        trees += 1;
        if (t.art[i] === conifer) conifers += 1;
      }
      if (trees > 1000)
        samples.push({ temperature: values.temperatureC[cellOf(key)] ?? 0, share: conifers / trees });
    }
    expect(samples.length).toBeGreaterThan(8);
    const sorted = samples.toSorted((p, q) => p.temperature - q.temperature);
    const third = Math.floor(sorted.length / 3);
    expect(avg(sorted.slice(0, third))).toBeGreaterThan(avg(sorted.slice(-third)));
  });

  it("반복 막기: 같은 바이옴 이웃 2차맵 쌍의 지문이 서로 떨어져 있고, 같은 지문이 없다", () => {
    const prints = new Map<number, number[]>();
    const keys = forestMaps(150, 24);
    for (const key of keys) prints.set(key, fingerprint(terrain(key)));
    const neighbourDistances: number[] = [];
    for (const key of keys) {
      const right = stepCell(key, 1, 0);
      if (right === null || (values.biome[cellOf(right)] ?? -1) !== (values.biome[cellOf(key)] ?? -2))
        continue;
      neighbourDistances.push(distance(prints.get(key) ?? [], fingerprint(terrain(right))));
    }
    expect(neighbourDistances.length).toBeGreaterThan(4);
    // 8×8 차폐 축소만으로도 같은 무늬면 0이다. 숲 덩이(8칸)가 전역 노이즈라 이웃끼리 크게 다르다
    expect(Math.min(...neighbourDistances)).toBeGreaterThan(0.3);
    const texts = new Set([...prints.values()].map((p) => p.map((v) => v.toFixed(4)).join(",")));
    expect(texts.size).toBe(prints.size);
  });
});
