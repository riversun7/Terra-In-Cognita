import { describe, expect, it } from "vitest";
import { cellKey, decodeCellKey } from "../cellKey.ts";
import { FACES } from "../faces.ts";
import { childKeys } from "../hierarchy.ts";
import {
  aggregateLevel,
  aggregatePlanetLevels,
  aggregateWater,
  modeOfFour,
  type PlanetLevel,
} from "./aggregate.ts";
import {
  WATER_COAST,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  assertPlanetFields,
} from "./fields.ts";
import { flatPlanetFields, randomPlanetFields } from "./testFields.ts";

const ocean = (depth: number): number => WATER_OCEAN | (depth << WATER_DEPTH_SHIFT);

describe("바이옴 모으기: 가장 많은 것, 동점이면 작은 번호", () => {
  it.each([
    [[1, 1, 1, 1], 1],
    [[4, 4, 4, 1], 4],
    [[3, 3, 1, 1], 1],
    [[5, 2, 2, 7], 2],
    [[2, 9, 9, 2], 2],
    [[9, 8, 7, 6], 6],
    [[0, 255, 255, 7], 255],
    [[13, 0, 13, 0], 0],
  ])("%j → %i", (values, expected) => {
    const [a = 0, b = 0, c = 0, d = 0] = values;
    expect(modeOfFour(a, b, c, d)).toBe(expected);
  });
});

describe("물 비트 모으기", () => {
  it.each([
    ["바다 2칸(수심 1·3) → 바다, 수심은 동점이라 작은 1", [ocean(1), ocean(3), 0, 0], ocean(1)],
    ["바다 1칸 → 바다 아님", [ocean(2), 0, 0, 0], 0],
    ["바다 3칸(2, 2, 3) → 수심 2", [ocean(2), ocean(2), ocean(3), 0], ocean(2)],
    ["바다 4칸(3, 3, 1, 1) → 동점이라 1", [ocean(3), ocean(3), ocean(1), ocean(1)], ocean(1)],
    ["호수 2칸 → 호수", [WATER_LAKE, WATER_LAKE, 0, 0], WATER_LAKE],
    ["바다 2칸 + 호수 2칸 → 바다(호수 아님)", [ocean(1), ocean(1), WATER_LAKE, WATER_LAKE], ocean(1)],
    ["호수 1칸 → 호수 아님", [WATER_LAKE, 0, 0, 0], 0],
    ["강·해안은 한 칸이라도 있으면", [WATER_RIVER, WATER_COAST, 0, 0], WATER_RIVER | WATER_COAST],
    ["바다가 아니면 수심 비트를 버린다", [3 << WATER_DEPTH_SHIFT, 0, 0, 0], 0],
    ["남은 비트(6~7)는 버린다", [0xc0, 0xc0 | ocean(2), ocean(2), 0], ocean(2)],
  ])("%s", (_name, values, expected) => {
    const [a = 0, b = 0, c = 0, d = 0] = values;
    expect(aggregateWater(a, b, c, d)).toBe(expected);
  });
});

/** 레벨 하나를 손으로 만든다 (모든 면, n×n) */
function levelOf(
  level: number,
  fill: (face: number, i: number, j: number) => Partial<Record<string, number>>,
) {
  const n = 2 ** level;
  const count = 6 * n * n;
  const out = {
    level,
    n,
    elevationM: new Int16Array(count),
    biome: new Uint8Array(count),
    temperatureC: new Int8Array(count),
    humidity: new Uint8Array(count),
    forest: new Uint8Array(count),
    water: new Uint8Array(count),
    river: new Uint8Array(count),
  } satisfies PlanetLevel;
  for (const face of FACES) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const values = fill(face, i, j);
        const at = face * n * n + j * n + i;
        out.elevationM[at] = values.elevationM ?? 0;
        out.river[at] = values.river ?? 0;
      }
    }
  }
  return out;
}

describe("단계 모으기", () => {
  it("평균은 가장 가까운 정수(.5는 +∞ 쪽), 하천은 가장 큰 등급", () => {
    // 레벨 1 면 0의 2×2를 (i, j) 순서로 채운다: (0,0) (1,0) (0,1) (1,1)
    const cases: [number[], number][] = [
      [[1, 2, 2, 2], 2], // 1.75
      [[-1, -2, -2, -2], -2], // -1.75
      [[-1, -1, -2, -2], -1], // -1.5 → -1
      [[1, 1, 2, 2], 2], // 1.5 → 2
      [[32767, 32767, 32767, 32766], 32767],
      [[-32768, -32768, -32768, -32768], -32768],
    ];
    for (const [values, expected] of cases) {
      const below = levelOf(1, (face, i, j) =>
        face === 0 ? { elevationM: values[j * 2 + i], river: i + j } : {},
      );
      const above = aggregateLevel(below);
      expect(above.level).toBe(0);
      expect(above.elevationM[0]).toBe(expected);
      expect(above.river[0]).toBe(2);
    }
  });

  it("윗 칸 = 셀 키 계층의 자식 4칸에서 모은 값 (무작위 F = 5, 모든 단계·모든 칸)", () => {
    const fields = randomPlanetFields(5, 11);
    const levels = aggregatePlanetLevels(fields);
    expect(levels.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
    for (let index = 0; index + 1 < levels.length; index++) {
      const above = levels[index];
      const below = levels[index + 1];
      if (!above || !below) throw new Error("missing level");
      for (const face of FACES) {
        for (let j = 0; j < above.n; j++) {
          for (let i = 0; i < above.n; i++) {
            // 자식 칸 좌표는 계층 코드(childKeys)로 따로 구한다
            const children = childKeys(cellKey(face, above.level, i, j)).map((key) => {
              const cell = decodeCellKey(key);
              return cell.face * below.n * below.n + cell.j * below.n + cell.i;
            });
            const pick = (array: ArrayLike<number>) => children.map((at) => array[at] ?? 0);
            const sum = (array: ArrayLike<number>) => pick(array).reduce((total, value) => total + value, 0);
            // + 0: Math.round(-0.25)는 -0이고 정수 배열에는 0으로 들어간다
            const mean = (array: ArrayLike<number>) => Math.round(sum(array) / 4) + 0;
            const at = face * above.n * above.n + j * above.n + i;
            expect(above.elevationM[at]).toBe(mean(below.elevationM));
            expect(above.temperatureC[at]).toBe(mean(below.temperatureC));
            expect(above.humidity[at]).toBe(mean(below.humidity));
            expect(above.forest[at]).toBe(mean(below.forest));
            const [a = 0, b = 0, c = 0, d = 0] = pick(below.biome);
            expect(above.biome[at]).toBe(modeOfFour(a, b, c, d));
            const [wa = 0, wb = 0, wc = 0, wd = 0] = pick(below.water);
            expect(above.water[at]).toBe(aggregateWater(wa, wb, wc, wd));
            expect(above.river[at]).toBe(Math.max(...pick(below.river)));
          }
        }
      }
    }
  });

  it("맨 아래 단계(F)는 생성기 배열 그대로다(복사·수정 없음)", () => {
    const fields = randomPlanetFields(4, 3);
    const before = fields.elevationM.slice();
    const levels = aggregatePlanetLevels(fields);
    expect(levels.at(-1)?.elevationM).toBe(fields.elevationM);
    expect(fields.elevationM).toEqual(before);
  });

  it("같은 입력이면 같은 결과 (결정성)", () => {
    const a = aggregatePlanetLevels(randomPlanetFields(5, 99));
    const b = aggregatePlanetLevels(randomPlanetFields(5, 99));
    expect(a).toEqual(b);
  });

  it("배열 길이나 면 레벨이 틀리면 RangeError", () => {
    const fields = flatPlanetFields(4, 0);
    expect(() => assertPlanetFields({ ...fields, biome: new Uint8Array(5) })).toThrow(RangeError);
    expect(() => assertPlanetFields({ ...fields, meta: { ...fields.meta, faceLevel: 3 } })).toThrow(
      RangeError,
    );
    expect(() => aggregatePlanetLevels({ ...fields, meta: { ...fields.meta, faceLevel: 5 } })).toThrow(
      RangeError,
    );
    expect(() => assertPlanetFields({ ...fields, meta: { ...fields.meta, generatorVersion: -1 } })).toThrow(
      RangeError,
    );
  });
});
