// 지형별 오브젝트(site)·움직이는 어군(school) 자리 시험(기획 D-536) — 바이옴·지표·물가·바닷가 조건, 앞 종류 번호 그대로, 어군 길은 물 위
import { TERRAIN_SURFACE } from "@terra/protocol";
import { schoolCell } from "@terra/shared/fishSchool";
import { describe, expect, it } from "vitest";
import type { GatherKind } from "./kinds.ts";
import { placeGatherObjects } from "./objects.ts";
import { SCHOOL_ID_BASE, SCHOOL_ID_STRIDE } from "./terrainObjects.ts";

const kind = (over: Partial<GatherKind>): GatherKind => ({
  id: "k",
  name: { ko: "가", en: "A" },
  source: "site",
  arts: [],
  chancePm: 0,
  art: 30,
  surfaces: [],
  minCells: 0,
  material: null,
  direct: true,
  item: "stone",
  lots: 1,
  workMs: 20_000,
  uses: 5,
  regrowMs: 1_800_000,
  facility: null,
  primary: "str",
  secondary: "vit",
  ...over,
});

/** 왼쪽 절반 땅(모래)·오른쪽 절반 물 */
const halfSea = () => {
  const surface = new Uint8Array(128 * 128).fill(TERRAIN_SURFACE.sand);
  for (let y = 0; y < 128; y++) for (let x = 64; x < 128; x++) surface[y * 128 + x] = TERRAIN_SURFACE.water;
  return { mapKey: 0x55_aa33_77, art: new Uint8Array(256 * 256), surface };
};

describe("지형별 오브젝트(site)", () => {
  it("그 바이옴 천분율로 묶음마다 서고, 바이옴이 다르거나 모르면 없다", () => {
    const kinds = [
      kind({ id: "rock", surfaces: [TERRAIN_SURFACE.sand], biomes: new Map([["desert", 1000]]) }),
    ];
    const layers = halfSea();
    const desert = placeGatherObjects({ ...layers, biomeId: "desert" }, kinds);
    // 땅 묶음(왼쪽 절반 16×8 = 128)마다 하나
    expect(desert).toHaveLength(128);
    expect(desert.every((object) => object.x < 128 && object.x % 2 === 1 && object.y % 2 === 1)).toBe(true);
    expect(placeGatherObjects({ ...layers, biomeId: "taiga" }, kinds)).toHaveLength(0);
    expect(placeGatherObjects(layers, kinds)).toHaveLength(0);
  });

  it("물가(shore)·바닷가(coast) 조건과 소품 칸 피하기", () => {
    const layers = halfSea();
    const shore = [
      kind({
        id: "tide",
        surfaces: [TERRAIN_SURFACE.sand],
        shore: 1,
        coast: true,
        biomes: new Map([["desert", 1000]]),
      }),
    ];
    // 바닷가 물 비트가 없으면 없다
    expect(placeGatherObjects({ ...layers, biomeId: "desert", waterBits: 2 }, shore)).toHaveLength(0);
    const objects = placeGatherObjects({ ...layers, biomeId: "desert", waterBits: 1 }, shore);
    // 물에서 지형 칸 1 안 = 지형 칸 x 63 → 배치 칸 x 127
    expect(objects.length).toBe(16);
    expect(objects.every((object) => object.x === 127)).toBe(true);
    // 그 칸에 소품이 있으면 건너뛴다
    for (let y = 0; y < 256; y++) layers.art[y * 256 + 127] = 5;
    expect(placeGatherObjects({ ...layers, biomeId: "desert", waterBits: 1 }, shore)).toHaveLength(0);
  });

  it("앞 종류(바위 묶음) 번호·자리는 그대로이고 그 칸은 비켜 간다", () => {
    const layers = halfSea();
    layers.surface.fill(TERRAIN_SURFACE.rock, 0, 128 * 4);
    const rock = kind({ id: "vein", source: "rock", chancePm: 1000, item: "copper_ore" });
    const site = kind({ id: "s", surfaces: [TERRAIN_SURFACE.rock], biomes: new Map([["alpine", 1000]]) });
    const before = placeGatherObjects({ ...layers, biomeId: "alpine" }, [rock]);
    const after = placeGatherObjects({ ...layers, biomeId: "alpine" }, [rock, site]);
    expect(after.slice(0, before.length)).toEqual(before);
    const ids = new Set(after.map((object) => object.id));
    expect(ids.size).toBe(after.length);
    expect(after.length).toBeGreaterThan(before.length);
  });
});

describe("움직이는 어군(school)", () => {
  const school = kind({
    id: "fish",
    source: "school",
    biomes: new Map([["ocean_shelf", 3]]),
    speed: 40,
    range: 20,
    reach: 6,
    item: "mackerel",
  });

  it("바이옴 어군 수만큼, 번호는 배치 칸 번호 밖, 길과 지금 자리는 모두 물 위", () => {
    const layers = halfSea();
    const objects = placeGatherObjects({ ...layers, biomeId: "ocean_shelf" }, [school]);
    expect(objects).toHaveLength(3);
    expect(objects.map((object) => object.id)).toEqual([0, 1, 2].map((k) => SCHOOL_ID_BASE + k));
    expect(SCHOOL_ID_STRIDE).toBeGreaterThanOrEqual(32);
    const water = (x: number, y: number) =>
      layers.surface[(y >> 1) * 128 + (x >> 1)] === TERRAIN_SURFACE.water;
    for (const object of objects) {
      const route = object.route;
      expect(route).toBeDefined();
      if (!route) continue;
      expect(route.points.slice(0, 2)).toEqual([object.x, object.y]);
      for (let t = 0; t < route.periodMs; t += Math.max(1, Math.floor(route.periodMs / 50))) {
        const cell = schoolCell(route, t);
        expect(water(cell.x, cell.y)).toBe(true);
      }
    }
    // 결정적: 다시 놓아도 같다
    expect(placeGatherObjects({ ...layers, biomeId: "ocean_shelf" }, [school])).toEqual(objects);
  });

  it("물이 없거나 바이옴이 다르면 없다", () => {
    const layers = halfSea();
    layers.surface.fill(TERRAIN_SURFACE.sand);
    expect(placeGatherObjects({ ...layers, biomeId: "ocean_shelf" }, [school])).toHaveLength(0);
    expect(placeGatherObjects({ ...halfSea(), biomeId: "desert" }, [school])).toHaveLength(0);
  });
});
