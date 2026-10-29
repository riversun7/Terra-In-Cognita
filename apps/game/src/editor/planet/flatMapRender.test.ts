// 평면 미니맵 그리기 시험 — 픽셀 → 칸 표(격자 계약의 xyzToCell과 같은지, 기준 표에서 끌어낸 표, 극·날짜변경선), 색,
// 음영 범위, 크기·좌표, 키보드
import {
  MAX_FACE_LEVEL,
  WATER_LAKE,
  WATER_OCEAN,
  cellKey,
  cellsPerSide,
  isFace,
  neighbors8,
  planetCellCount,
} from "@terra/planet";
import { describe, expect, it } from "vitest";
import {
  FLAT_MAP_LOOKUP_BASE_LEVEL,
  FLAT_MAP_MAX_WIDTH,
  FLAT_MAP_SHADE_RANGE,
  FLAT_MAP_UNKNOWN_COLOR,
  type FlatMapFields,
  FlatMapLookupCache,
  type FlatMapSize,
  buildFlatMapLookup,
  createFlatMapPalette,
  flatMapBackingSize,
  flatMapFraction,
  flatMapPixelAt,
  flatMapPixelCenter,
  flatMapPixelRatioLimit,
  flatMapPointAt,
  flatMapShade,
  moveFlatMapPoint,
  paintFlatMap,
} from "./flatMapRender.ts";
import { cellAtLatLon } from "./cellReport.ts";

/** 기대값: 칸 정보창의 위도·경도 → 칸(cellReport.ts cellAtLatLon, 엔진 방향 식 → 격자 계약 xyzToCell → 배열 번호) */
function expectedIndex(faceLevel: number, latDeg: number, lonDeg: number): number {
  return cellAtLatLon(faceLevel, latDeg, lonDeg).index;
}

/** 배열 번호 → 면·i·j */
function cellOf(index: number, faceLevel: number): { face: number; i: number; j: number } {
  const n = cellsPerSide(faceLevel);
  const face = Math.floor(index / (n * n));
  const rest = index - face * n * n;
  return { face, i: rest % n, j: Math.floor(rest / n) };
}

function keyOf(index: number, faceLevel: number) {
  const { face, i, j } = cellOf(index, faceLevel);
  if (!isFace(face)) throw new Error(`bad face ${face}`);
  return cellKey(face, faceLevel, i, j);
}

/** 시험용 결과: 칸마다 같은 값(fill) 또는 번호로 정한 값 */
function makeFields(
  faceLevel: number,
  value: (cell: number) => { biome: number; elevationM: number; water: number },
): FlatMapFields {
  const count = planetCellCount(faceLevel);
  const biome = new Uint8Array(count);
  const elevationM = new Int16Array(count);
  const water = new Uint8Array(count);
  for (let c = 0; c < count; c++) {
    const v = value(c);
    biome[c] = v.biome;
    elevationM[c] = v.elevationM;
    water[c] = v.water;
  }
  return { biome, elevationM, water, meta: { faceLevel } };
}

function makeImage(size: FlatMapSize) {
  return { ...size, data: new Uint8ClampedArray(size.width * size.height * 4) };
}

function pixel(image: { width: number; data: Uint8ClampedArray }, x: number, y: number): number[] {
  const k = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(k, k + 4));
}

describe("평면 미니맵 픽셀 → 칸 표", () => {
  it("모든 픽셀이 칸 정보창과 같은 길(엔진 방향 식 → xyzToCell)의 칸이다 — 홀수 높이(가운데 줄이 적도)도", () => {
    // 538×269는 휴대폰 흉내의 그림 크기다. 높이가 홀수면 가운데 줄이 정확히 위도 0°라 x·y가 같은 방향(±45°·±135°) 근처를 지난다
    for (const [faceLevel, width] of [
      [4, 64],
      [5, 200],
      [5, 538],
      [7, 256],
      [7, 302],
      [9, 128],
      [9, 538],
    ] as const) {
      const size = { width, height: width / 2 };
      const lookup = buildFlatMapLookup(faceLevel, size);
      let differ = 0;
      for (let y = 0; y < size.height; y++) {
        for (let x = 0; x < size.width; x++) {
          const center = flatMapPixelCenter(x, y, size);
          if (lookup.cells[y * size.width + x] !== expectedIndex(faceLevel, center.latDeg, center.lonDeg)) {
            differ++;
          }
        }
      }
      expect(differ, `F${faceLevel} ${width}`).toBe(0);
    }
  });

  it("알려진 방향(표): 적도의 경도 ±90° 픽셀은 면 1·4의 가운데 2×2(면 중심은 칸 넷의 꼭짓점), 날짜변경선 양 끝은 면 3", () => {
    // 538×269: 가운데 줄(y = 134)의 위도가 정확히 0°, x = 134·403의 경도가 정확히 −90°·90°
    const size = { width: 538, height: 269 };
    expect(flatMapPixelCenter(134, 134, size)).toEqual({ latDeg: 0, lonDeg: -90 });
    expect(flatMapPixelCenter(403, 134, size)).toEqual({ latDeg: 0, lonDeg: 90 });
    for (const faceLevel of [4, 6, 9]) {
      const n = cellsPerSide(faceLevel);
      const lookup = buildFlatMapLookup(faceLevel, size);
      const at = (x: number) => cellOf(lookup.cells[134 * size.width + x] ?? -1, faceLevel);
      for (const [x, face] of [
        [134, 4],
        [403, 1],
      ] as const) {
        const cell = at(x);
        expect(cell.face, `F${faceLevel} x ${x}`).toBe(face);
        expect([n / 2 - 1, n / 2]).toContain(cell.i);
        expect([n / 2 - 1, n / 2]).toContain(cell.j);
      }
      expect(at(0).face).toBe(3);
      expect(at(size.width - 1).face).toBe(3);
    }
    // 2×1: 두 픽셀의 중심이 (0°, −90°)·(0°, 90°)
    const tiny = buildFlatMapLookup(6, { width: 2, height: 1 });
    expect(cellOf(tiny.cells[0] ?? -1, 6).face).toBe(4);
    expect(cellOf(tiny.cells[1] ?? -1, 6).face).toBe(1);
  });

  it("극: 맨 위 줄은 모두 면 2(+z), 맨 아래 줄은 모두 면 5(−z)의 가운데 근처", () => {
    const faceLevel = 7;
    const n = cellsPerSide(faceLevel);
    const size = { width: 512, height: 256 };
    const lookup = buildFlatMapLookup(faceLevel, size);
    for (let x = 0; x < size.width; x++) {
      const top = cellOf(lookup.cells[x] ?? -1, faceLevel);
      const bottom = cellOf(lookup.cells[(size.height - 1) * size.width + x] ?? -1, faceLevel);
      expect(top.face).toBe(2);
      expect(bottom.face).toBe(5);
      for (const cell of [top, bottom]) {
        expect(Math.abs(cell.i + 0.5 - n / 2)).toBeLessThan(2);
        expect(Math.abs(cell.j + 0.5 - n / 2)).toBeLessThan(2);
      }
    }
  });

  it("날짜변경선: 줄마다 왼쪽 끝 픽셀과 오른쪽 끝 픽셀은 같은 칸이거나 맞닿은 칸(이음매 없음)", () => {
    // 픽셀 폭(360° ÷ 폭)이 가장 작은 칸보다 좁아야 두 끝 픽셀이 맞닿은 칸에 든다: F5 → 256점(1.4°), F7 → 1,024점(0.35°)
    for (const [faceLevel, width] of [
      [5, 256],
      [7, 1024],
    ] as const) {
      const size = { width, height: width / 2 };
      const lookup = buildFlatMapLookup(faceLevel, size);
      for (let y = 0; y < size.height; y++) {
        const left = lookup.cells[y * size.width] ?? -1;
        const right = lookup.cells[y * size.width + size.width - 1] ?? -1;
        if (left === right) continue;
        expect(neighbors8(keyOf(left, faceLevel)), `F${faceLevel} row ${y}`).toContain(
          keyOf(right, faceLevel),
        );
      }
      // 적도 바로 위 줄: 둘 다 면 3, i는 같고 j가 하나 차이(경도 −180°와 180°는 같은 자오선)
      const row = size.height / 2 - 1;
      const left = cellOf(lookup.cells[row * size.width] ?? -1, faceLevel);
      const right = cellOf(lookup.cells[row * size.width + size.width - 1] ?? -1, faceLevel);
      expect([left.face, right.face]).toEqual([3, 3]);
      expect(left.i).toBe(right.i);
      expect(Math.abs(left.j - right.j)).toBe(1);
    }
  });

  it("빈 칸 없이 덮는다: F5를 512×256에 펼치면 6,144칸이 모두 나오고 번호는 범위 안", () => {
    const lookup = buildFlatMapLookup(5, { width: 512, height: 256 });
    const seen = new Set(lookup.cells);
    expect(seen.size).toBe(planetCellCount(5));
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(planetCellCount(5) - 1);
  });

  it("틀린 면 레벨·크기는 RangeError(바로 만들기·기억 모두)", () => {
    expect(() => buildFlatMapLookup(3, { width: 64, height: 32 })).toThrow(RangeError);
    expect(() => buildFlatMapLookup(5, { width: 64, height: 31 })).toThrow(RangeError);
    expect(() =>
      buildFlatMapLookup(5, { width: FLAT_MAP_MAX_WIDTH + 2, height: FLAT_MAP_MAX_WIDTH / 2 + 1 }),
    ).toThrow(RangeError);
    const cache = new FlatMapLookupCache();
    expect(() => cache.get(3, { width: 64, height: 32 })).toThrow(RangeError);
    expect(() => cache.get(5, { width: 64, height: 31 })).toThrow(RangeError);
    expect(cache.size).toBe(0);
  });

  it("기준 표: 격자의 모든 면 레벨을 끌어낼 수 있고, 칸 번호가 Int32에 든다", () => {
    expect(MAX_FACE_LEVEL).toBeLessThanOrEqual(FLAT_MAP_LOOKUP_BASE_LEVEL);
    expect(planetCellCount(FLAT_MAP_LOOKUP_BASE_LEVEL)).toBeLessThanOrEqual(2 ** 31);
  });

  it("기준 표에서 끌어낸 표는 바로 만든 표와 모든 픽셀이 같다(홀수 높이·폭 상한 포함)", () => {
    for (const [width, levels] of [
      [2, [4, 5, 6, 7, 8, 9, 14]],
      [6, [4, 5, 6, 7, 8, 9, 14]],
      [302, [4, 5, 6, 7, 8, 9]],
      [538, [4, 5, 6, 7, 8, 9]],
      [1024, [7]],
    ] as const) {
      const size = { width, height: width / 2 };
      const cache = new FlatMapLookupCache(levels.length);
      for (const faceLevel of levels) {
        const derived = cache.get(faceLevel, size).lookup.cells;
        const direct = buildFlatMapLookup(faceLevel, size).cells;
        let differ = 0;
        for (let k = 0; k < direct.length; k++) if (derived[k] !== direct[k]) differ++;
        expect(differ, `F${faceLevel} ${width}`).toBe(0);
      }
    }
  });

  it("표 기억: 같은 레벨·크기는 그대로, 다른 레벨은 기준 표에서 끌어내고, 레벨 표는 최근 3개 + 기준 표는 크기 하나", () => {
    const cache = new FlatMapLookupCache(3);
    const size = { width: 64, height: 32 };
    const table = 64 * 32 * 4;
    expect(cache.get(5, size).source).toBe("base");
    expect(cache.get(5, size).source).toBe("cached");
    expect(cache.get(6, size).source).toBe("derived");
    cache.get(7, size);
    cache.get(8, size);
    expect(cache.size).toBe(3);
    expect(cache.bytes).toBe(4 * table);
    // 5가 가장 오래되어 밀려났다: 같은 크기의 기준 표에서 다시 끌어낸다
    expect(cache.get(5, size).source).toBe("derived");
    // 크기가 바뀌면 새 크기의 기준 표부터
    const bigger = { width: 128, height: 64 };
    expect(cache.get(5, bigger).source).toBe("base");
    expect(cache.get(7, bigger).source).toBe("derived");
    // 옛 크기 표는 남아 있으면 그대로 쓰고, 없는 레벨은 그 크기의 기준 표부터 다시 만든다
    expect(cache.get(5, size).source).toBe("cached");
    expect(cache.get(6, size).source).toBe("base");
    // 64×32 표 셋(레벨 6·5 + 기준 표) + 128×64 레벨 7 표 하나(64×32의 4배)
    expect(cache.bytes).toBe(3 * table + 4 * table);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });
});

describe("평면 미니맵 칠하기", () => {
  const faceLevel = 4;
  const size = { width: 64, height: 32 };
  const lookup = buildFlatMapLookup(faceLevel, size);
  const colors = [0x1c3d6e, 0x4a8cca, 0x5b9fd6, 0xd9cbb0, 0x3d6a4f];

  it("호수 칸은 바이옴 색 그대로(RGBA 순서, 불투명), 색표에 없는 번호는 회색", () => {
    const fields = makeFields(faceLevel, (c) => ({ biome: c % 7, elevationM: 40, water: WATER_LAKE }));
    const image = makeImage(size);
    paintFlatMap(lookup, fields, createFlatMapPalette(colors), image);
    for (let y = 0; y < size.height; y += 3) {
      for (let x = 0; x < size.width; x += 5) {
        const cell = lookup.cells[y * size.width + x] ?? 0;
        const color = colors[cell % 7] ?? FLAT_MAP_UNKNOWN_COLOR;
        expect(pixel(image, x, y)).toEqual([color >> 16, (color >> 8) & 255, color & 255, 255]);
      }
    }
  });

  it("땅은 해수면 86% → 실제 6,000m(게임 500m) 이상 118%, 바다·호수는 깊이와 상관없이 100%", () => {
    expect(flatMapShade(0, 0)).toBe(0.86);
    // 제곱근 곡선: 실제 1,500m(게임 125m) = 86 + 32 × √(1/4) = 102%
    expect(flatMapShade(125, 0)).toBe(1.02);
    expect(flatMapShade(500, 0)).toBe(1.18);
    expect(flatMapShade(700, 0)).toBe(1.18);
    expect(flatMapShade(0, WATER_OCEAN)).toBe(1);
    expect(flatMapShade(-500, WATER_OCEAN)).toBe(1);
    expect(flatMapShade(-900, WATER_OCEAN | (3 << 4))).toBe(1);
    expect(flatMapShade(-120, WATER_LAKE)).toBe(1);
    expect(flatMapShade(300, WATER_LAKE)).toBe(1);
    // 땅 칸의 저장 고도는 0 이상이지만, 음수가 와도 해수면 값으로 본다
    expect(flatMapShade(-5, 0)).toBe(0.86);
  });

  it("음영 범위: 모든 고도(Int16)·물 비트에서 0.86~1.18, 땅은 높을수록 밝고(줄지 않음) 물은 늘 100%", () => {
    const problems: string[] = [];
    let land = 0;
    for (let e = -32768; e <= 32767; e++) {
      for (const water of [0, WATER_OCEAN, WATER_LAKE, WATER_OCEAN | WATER_LAKE, WATER_OCEAN | (3 << 4)]) {
        const shade = flatMapShade(e, water);
        if (shade < FLAT_MAP_SHADE_RANGE.min || shade > FLAT_MAP_SHADE_RANGE.max)
          problems.push(`${e}/${water}`);
        if (water !== 0 && shade !== 1) problems.push(`water ${e}/${water}`);
      }
      const landShade = flatMapShade(e, 0);
      if (landShade < land) problems.push(`land ${e}`);
      land = landShade;
    }
    expect(problems).toEqual([]);
    expect(FLAT_MAP_SHADE_RANGE).toEqual({ min: 0.86, max: 1.18 });
  });

  it("칠한 값 = 바이옴 색 × 음영(255에서 멈춤): 높은 빙상, 깊은 바다, 높은 숲, 낮은 숲", () => {
    const ice = 0xedf2f6;
    const palette = createFlatMapPalette([0x1c3d6e, ice, 0x3d6a4f]);
    const image = makeImage(size);
    const shadedPixel = (biome: number, elevationM: number, water: number) => {
      paintFlatMap(
        lookup,
        makeFields(faceLevel, () => ({ biome, elevationM, water })),
        palette,
        image,
      );
      return pixel(image, 10, 10);
    };
    // 빙상 × 1.18: 255에서 멈춘다
    expect(shadedPixel(1, 600, 0)).toEqual([255, 255, 255, 255]);
    // 깊은 바다: 바이옴 색 그대로
    expect(shadedPixel(0, -800, WATER_OCEAN)).toEqual([0x1c, 0x3d, 0x6e, 255]);
    // 높은 숲 × 1.18
    expect(shadedPixel(2, 500, 0)).toEqual([
      Math.round(0x3d * 1.18),
      Math.round(0x6a * 1.18),
      Math.round(0x4f * 1.18),
      255,
    ]);
    // 해수면 숲 × 0.86
    expect(shadedPixel(2, 0, 0)).toEqual([
      Math.round(0x3d * 0.86),
      Math.round(0x6a * 0.86),
      Math.round(0x4f * 0.86),
      255,
    ]);
  });

  it("칸마다 칠하는 길(칸 ≤ 픽셀)과 픽셀마다 칠하는 길(칸 > 픽셀)이 기준값(색 × 음영)과 같다", () => {
    const palette = createFlatMapPalette(colors);
    for (const level of [4, 7]) {
      const levelLookup = buildFlatMapLookup(level, size);
      // 칸 수: F4 1,536 < 픽셀 2,048(칸마다), F7 98,304 > 2,048(픽셀마다)
      const fields = makeFields(level, (c) => ({
        biome: c % 6,
        elevationM: ((c * 37) % 900) - 300,
        water: c % 11 === 0 ? WATER_LAKE : ((c * 37) % 900) - 300 < 0 ? WATER_OCEAN : 0,
      }));
      const image = makeImage(size);
      paintFlatMap(levelLookup, fields, palette, image);
      let differ = 0;
      for (let k = 0; k < size.width * size.height; k++) {
        const cell = levelLookup.cells[k] ?? 0;
        const color = colors[fields.biome[cell] ?? 0] ?? FLAT_MAP_UNKNOWN_COLOR;
        const percent = Math.round(flatMapShade(fields.elevationM[cell] ?? 0, fields.water[cell] ?? 0) * 100);
        const expected = [color >> 16, (color >> 8) & 255, color & 255].map((channel) =>
          Math.min(255, Math.round((channel * percent) / 100)),
        );
        const got = Array.from(image.data.subarray(k * 4, k * 4 + 4));
        if (got.join() !== [...expected, 255].join()) differ++;
      }
      expect(differ, `F${level}`).toBe(0);
    }
  });

  it("틀린 색 값(음수·소수·범위 밖)은 회색으로 칠한다", () => {
    const palette = createFlatMapPalette([-1, 0.5, 0x1000000]);
    const image = makeImage(size);
    for (const biome of [0, 1, 2, 3]) {
      paintFlatMap(
        lookup,
        makeFields(faceLevel, () => ({ biome, elevationM: 0, water: WATER_LAKE })),
        palette,
        image,
      );
      expect(pixel(image, 0, 0)).toEqual([0xc8, 0xc8, 0xc8, 255]);
    }
  });

  it("면 레벨·크기·배열 길이가 맞지 않으면 RangeError", () => {
    const palette = createFlatMapPalette(colors);
    const fields = makeFields(faceLevel, () => ({ biome: 0, elevationM: 0, water: 0 }));
    expect(() =>
      paintFlatMap(lookup, { ...fields, meta: { faceLevel: 5 } }, palette, makeImage(size)),
    ).toThrow(RangeError);
    expect(() => paintFlatMap(lookup, fields, palette, makeImage({ width: 32, height: 16 }))).toThrow(
      RangeError,
    );
    expect(() =>
      paintFlatMap(lookup, { ...fields, biome: new Uint8Array(10) }, palette, makeImage(size)),
    ).toThrow(RangeError);
  });
});

describe("평면 미니맵 크기·좌표", () => {
  it("픽셀 비율 상한: 휴대폰(굵은 포인터·짧은 변 600px 이하) 1.5, 태블릿·데스크톱 2", () => {
    expect(flatMapPixelRatioLimit(true, 390)).toBe(1.5);
    expect(flatMapPixelRatioLimit(true, 600)).toBe(1.5);
    expect(flatMapPixelRatioLimit(true, 820)).toBe(2);
    expect(flatMapPixelRatioLimit(false, 390)).toBe(2);
    expect(flatMapBackingSize(358, 3, 1.5)).toEqual({ width: 538, height: 269 });
    expect(flatMapBackingSize(358, 1, 1.5)).toEqual({ width: 358, height: 179 });
    expect(flatMapBackingSize(358, 3, Number.NaN)).toEqual({ width: 716, height: 358 });
  });

  it("그림 크기: CSS 폭 × 픽셀 비율(기본 상한 2), 폭은 짝수·상한 1,024, 높이 = 폭 ÷ 2", () => {
    expect(flatMapBackingSize(358, 1)).toEqual({ width: 358, height: 179 });
    expect(flatMapBackingSize(358, 3)).toEqual({ width: 716, height: 358 });
    expect(flatMapBackingSize(301, 1)).toEqual({ width: 302, height: 151 });
    expect(flatMapBackingSize(480, 2)).toEqual({ width: 960, height: 480 });
    expect(flatMapBackingSize(900, 2)).toEqual({ width: FLAT_MAP_MAX_WIDTH, height: FLAT_MAP_MAX_WIDTH / 2 });
    expect(flatMapBackingSize(0, 2)).toEqual({ width: 2, height: 1 });
    expect(flatMapBackingSize(Number.NaN, Number.NaN)).toEqual({ width: 2, height: 1 });
    expect(flatMapBackingSize(200, 0)).toEqual({ width: 200, height: 100 });
  });

  it("픽셀 중심 → 그 픽셀, 날짜변경선은 돌아 넘어가고 극은 끝 줄", () => {
    const size = { width: 40, height: 20 };
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        expect(flatMapPixelAt(flatMapPixelCenter(x, y, size), size)).toEqual({ x, y });
      }
    }
    expect(flatMapPixelAt({ latDeg: 0, lonDeg: 180 }, size).x).toBe(0);
    expect(flatMapPixelAt({ latDeg: 0, lonDeg: -180 }, size).x).toBe(0);
    expect(flatMapPixelAt({ latDeg: 0, lonDeg: 179.99 }, size).x).toBe(size.width - 1);
    expect(flatMapPixelAt({ latDeg: 0, lonDeg: 540 }, size).x).toBe(0);
    expect(flatMapPixelAt({ latDeg: 90, lonDeg: 0 }, size).y).toBe(0);
    expect(flatMapPixelAt({ latDeg: -90, lonDeg: 0 }, size).y).toBe(size.height - 1);
    expect(flatMapPixelAt({ latDeg: 120, lonDeg: 0 }, size).y).toBe(0);
  });

  it("누른 곳(비율) → 그 픽셀 중심, 끝은 안쪽 픽셀로", () => {
    const size = { width: 40, height: 20 };
    expect(flatMapPointAt(0, 0, size)).toEqual(flatMapPixelCenter(0, 0, size));
    expect(flatMapPointAt(1, 1, size)).toEqual(flatMapPixelCenter(39, 19, size));
    expect(flatMapPointAt(0.5, 0.5, size)).toEqual(flatMapPixelCenter(20, 10, size));
    expect(flatMapPointAt(-0.2, 1.4, size)).toEqual(flatMapPixelCenter(0, 19, size));
    expect(flatMapPointAt(Number.NaN, 0.1, size)).toEqual(flatMapPixelCenter(0, 2, size));
  });

  it("표시 점 자리: 위도·경도 → 비율(왼쪽 위 0)", () => {
    expect(flatMapFraction({ latDeg: 90, lonDeg: -180 })).toEqual({ x: 0, y: 0 });
    expect(flatMapFraction({ latDeg: 0, lonDeg: 0 })).toEqual({ x: 0.5, y: 0.5 });
    expect(flatMapFraction({ latDeg: -90, lonDeg: 90 })).toEqual({ x: 0.75, y: 1 });
    expect(flatMapFraction({ latDeg: -100, lonDeg: 270 })).toEqual({ x: 0.25, y: 1 });
  });
});

describe("평면 미니맵 키보드", () => {
  const size = { width: 256, height: 128 };
  const faceLevel = 5;
  // 한 걸음 = 256 ÷ (4 × 32) = 2점
  const step = 2;

  it("고른 점이 없으면 가운데 픽셀을 고른다(방향과 상관없이)", () => {
    const center = flatMapPixelCenter(128, 64, size);
    expect(moveFlatMapPoint(null, "left", false, faceLevel, size)).toEqual(center);
    expect(moveFlatMapPoint(null, null, false, faceLevel, size)).toEqual(center);
  });

  it("화살표 한 걸음은 적도 칸 하나쯤, Shift는 8걸음. 경도는 돌아 넘어가고 위도는 끝에서 멈춘다", () => {
    const from = flatMapPixelCenter(100, 60, size);
    expect(moveFlatMapPoint(from, "right", false, faceLevel, size)).toEqual(
      flatMapPixelCenter(100 + step, 60, size),
    );
    expect(moveFlatMapPoint(from, "up", true, faceLevel, size)).toEqual(
      flatMapPixelCenter(100, 60 - 8 * step, size),
    );
    expect(moveFlatMapPoint(from, null, false, faceLevel, size)).toEqual(from);
    const edge = flatMapPixelCenter(size.width - 1, 0, size);
    expect(moveFlatMapPoint(edge, "right", false, faceLevel, size)).toEqual(
      flatMapPixelCenter(step - 1, 0, size),
    );
    expect(moveFlatMapPoint(edge, "up", false, faceLevel, size)).toEqual(edge);
    const bottom = flatMapPixelCenter(0, size.height - 1, size);
    expect(moveFlatMapPoint(bottom, "left", false, faceLevel, size)).toEqual(
      flatMapPixelCenter(size.width - step, size.height - 1, size),
    );
    expect(moveFlatMapPoint(bottom, "down", true, faceLevel, size)).toEqual(bottom);
  });

  it("칸이 픽셀보다 작으면(F9를 작은 그림에) 한 걸음은 1점", () => {
    const small = { width: 64, height: 32 };
    const from = flatMapPixelCenter(10, 10, small);
    expect(moveFlatMapPoint(from, "down", false, 9, small)).toEqual(flatMapPixelCenter(10, 11, small));
  });
});
