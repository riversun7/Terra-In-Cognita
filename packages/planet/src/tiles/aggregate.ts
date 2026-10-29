// 1차맵 단계별 칸 값 모으기 — ADR 2026-10-29-s2-planet-lod(36) "윗 레벨 값 = 아래 2×2칸에서 모은다"
// 면 레벨 F의 값(생성기 출력)에서 시작해 한 단계씩 위로 모은다(F → F−1 → … → F−4). 정수 연산만 쓴다.
// - 고도·기온·습도·숲: 4칸 평균을 가장 가까운 정수로(.5는 +∞ 쪽, Math.round). 합이 정수라 4로 나눈 값은 정확하다.
// - 바이옴: 가장 많은 것, 동점이면 작은 번호.
// - 물 비트: 바다가 2칸 이상이면 바다. 바다가 아니고 호수가 2칸 이상이면 호수. 강·해안은 한 칸이라도 있으면.
//   수심 등급은 바다일 때만, 바다인 칸들의 등급 중 가장 많은 것(동점이면 작은 등급). 남은 비트(6~7)는 0.
// - 하천 등급: 가장 큰 등급.
// 칸 순서는 PlanetFields와 같다: index = 면 × n² + j × n + i. 아래 2×2는 (2i, 2j), (2i+1, 2j), (2i, 2j+1), (2i+1, 2j+1).
import { cellsPerSide } from "../levels.ts";
import {
  type PlanetFields,
  WATER_COAST,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  assertPlanetFields,
} from "./fields.ts";
import { planetMapLevels } from "./tileIds.ts";

/** 맵 레벨 하나의 칸 값 (타일이 쓰는 것만). 배열 길이는 6 × n² */
export interface PlanetLevel {
  readonly level: number;
  /** 면 한 변 칸 수 = 2^level */
  readonly n: number;
  readonly elevationM: Int16Array;
  readonly biome: Uint8Array;
  readonly temperatureC: Int8Array;
  readonly humidity: Uint8Array;
  readonly forest: Uint8Array;
  readonly water: Uint8Array;
  readonly river: Uint8Array;
}

/** 배열 값 (범위 밖은 0 — 길이는 미리 확인한다) */
function at(array: ArrayLike<number>, index: number): number {
  return array[index] ?? 0;
}

/** 같으면 1 */
function same(x: number, y: number): number {
  return x === y ? 1 : 0;
}

/** 4칸 평균(가장 가까운 정수, .5는 +∞ 쪽) */
function mean4(a: number, b: number, c: number, d: number): number {
  return Math.round((a + b + c + d) / 4);
}

/** 4칸 중 가장 많은 값. 동점이면 작은 값 (칸마다 같은 값이 몇 칸인지 세어 차례로 견준다) */
export function modeOfFour(a: number, b: number, c: number, d: number): number {
  let best = a;
  let bestCount = 1 + same(a, b) + same(a, c) + same(a, d);
  const countB = same(b, a) + 1 + same(b, c) + same(b, d);
  if (countB > bestCount || (countB === bestCount && b < best)) {
    best = b;
    bestCount = countB;
  }
  const countC = same(c, a) + same(c, b) + 1 + same(c, d);
  if (countC > bestCount || (countC === bestCount && c < best)) {
    best = c;
    bestCount = countC;
  }
  const countD = same(d, a) + same(d, b) + same(d, c) + 1;
  if (countD > bestCount || (countD === bestCount && d < best)) best = d;
  return best;
}

/** 비트가 있으면 1 */
function has(value: number, mask: number): number {
  return (value & mask) !== 0 ? 1 : 0;
}

/** 바다 칸이고 수심 등급이 `depth`면 1 */
function oceanAtDepth(value: number, depth: number): number {
  return (value & WATER_OCEAN) !== 0 && (value & WATER_DEPTH_MASK) >> WATER_DEPTH_SHIFT === depth ? 1 : 0;
}

/** 물 비트 4칸 → 윗 칸 물 비트 (규칙은 파일 머리) */
export function aggregateWater(a: number, b: number, c: number, d: number): number {
  const oceans = has(a, WATER_OCEAN) + has(b, WATER_OCEAN) + has(c, WATER_OCEAN) + has(d, WATER_OCEAN);
  const lakes = has(a, WATER_LAKE) + has(b, WATER_LAKE) + has(c, WATER_LAKE) + has(d, WATER_LAKE);
  let result = (a | b | c | d) & (WATER_RIVER | WATER_COAST);
  if (oceans >= 2) {
    // 바다 칸들의 수심 등급 중 가장 많은 것. 얕은 등급부터 보고 더 많을 때만 바꾸므로 동점이면 작은 등급이 남는다
    let depth = 0;
    let depthCount = 0;
    for (let candidate = 0; candidate < 4; candidate++) {
      const count =
        oceanAtDepth(a, candidate) +
        oceanAtDepth(b, candidate) +
        oceanAtDepth(c, candidate) +
        oceanAtDepth(d, candidate);
      if (count > depthCount) {
        depth = candidate;
        depthCount = count;
      }
    }
    result |= WATER_OCEAN | (depth << WATER_DEPTH_SHIFT);
  } else if (lakes >= 2) {
    result |= WATER_LAKE;
  }
  return result;
}

/** 한 단계 위로 모은다: 레벨 L → L−1 */
export function aggregateLevel(below: PlanetLevel): PlanetLevel {
  const level = below.level - 1;
  if (level < 0) throw new RangeError("a level-0 map level has no level above it");
  const n = cellsPerSide(level);
  const nb = below.n;
  const count = 6 * n * n;
  const elevationM = new Int16Array(count);
  const biome = new Uint8Array(count);
  const temperatureC = new Int8Array(count);
  const humidity = new Uint8Array(count);
  const forest = new Uint8Array(count);
  const water = new Uint8Array(count);
  const river = new Uint8Array(count);
  const e = below.elevationM;
  const t = below.temperatureC;
  const h = below.humidity;
  const f = below.forest;
  const g = below.biome;
  const w = below.water;
  const r = below.river;
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = face * nb * nb + 2 * j * nb + 2 * i;
        const b = a + 1;
        const c = a + nb;
        const d = c + 1;
        const out = face * n * n + j * n + i;
        elevationM[out] = mean4(at(e, a), at(e, b), at(e, c), at(e, d));
        temperatureC[out] = mean4(at(t, a), at(t, b), at(t, c), at(t, d));
        humidity[out] = mean4(at(h, a), at(h, b), at(h, c), at(h, d));
        forest[out] = mean4(at(f, a), at(f, b), at(f, c), at(f, d));
        biome[out] = modeOfFour(at(g, a), at(g, b), at(g, c), at(g, d));
        water[out] = aggregateWater(at(w, a), at(w, b), at(w, c), at(w, d));
        river[out] = Math.max(at(r, a), at(r, b), at(r, c), at(r, d));
      }
    }
  }
  return { level, n, elevationM, biome, temperatureC, humidity, forest, water, river };
}

/**
 * 1차맵 5단계의 칸 값. 결과 순서는 맵 레벨 오름차순(F−4 … F)이다.
 * 맨 끝(레벨 F)은 생성기 배열을 복사하지 않고 그대로 쓴다(고치지 않는다).
 */
export function aggregatePlanetLevels(fields: PlanetFields): PlanetLevel[] {
  assertPlanetFields(fields);
  const faceLevel = fields.meta.faceLevel;
  let current: PlanetLevel = {
    level: faceLevel,
    n: cellsPerSide(faceLevel),
    elevationM: fields.elevationM,
    biome: fields.biome,
    temperatureC: fields.temperatureC,
    humidity: fields.humidity,
    forest: fields.forest,
    water: fields.water,
    river: fields.river,
  };
  const levels = [current];
  for (let step = 1; step < planetMapLevels(faceLevel).length; step++) {
    current = aggregateLevel(current);
    levels.unshift(current);
  }
  return levels;
}
