// 원자재 오브젝트 자리·채집 셈 시험(순수) — docs/adr/2026-11-07-gather-objects.md 2·3절
import { TERRAIN_SURFACE } from "@terra/protocol";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { GatherKind } from "./kinds.ts";
import { MATERIAL_BIT } from "@terra/shared/catchment";
import { OBJECT_BLOCK_CELLS, PLOT_BLOCK_CELLS, blockRoll, placeGatherObjects } from "./objects.ts";
import {
  gatherDurationMs,
  gatherEfficiencyPm,
  gatherFatiguePm,
  gatherYieldPm,
  regrowMs,
  splitPm,
} from "./rules.ts";

const kind = (over: Partial<GatherKind>): GatherKind => ({
  id: "k",
  name: { ko: "가", en: "A" },
  source: "prop",
  arts: [],
  chancePm: 0,
  art: 0,
  surfaces: [],
  minCells: 0,
  material: null,
  direct: true,
  item: "pine_log",
  lots: 1,
  workMs: 20_000,
  uses: 5,
  regrowMs: 1_800_000,
  facility: null,
  primary: "dex",
  secondary: "str",
  ...over,
});

const KINDS: GatherKind[] = [
  kind({ id: "conifer", arts: [2] }),
  kind({ id: "broadleaf", arts: [1, 2] }),
  kind({ id: "rock", source: "rock", chancePm: 1000, item: "copper_ore" }),
];

const blank = () => ({
  mapKey: 0x1234_5678_9a,
  art: new Uint8Array(256 * 256),
  surface: new Uint8Array(128 * 128).fill(TERRAIN_SURFACE.grass),
});

describe("오브젝트 자리", () => {
  it("묶음마다 많아야 하나: 가장 많은 그림 종류, 자리는 묶음 가운데에 가장 가까운 칸, 번호 = y × 256 + x", () => {
    const layers = blank();
    // 묶음 (1, 0): 침엽수(2) 셋, 활엽수(1) 둘 → 침엽수(같은 그림을 둘이 맡으면 팩 앞 종류)
    for (const x of [8, 9, 15]) layers.art[x] = 2;
    for (const x of [10, 11]) layers.art[256 + x] = 1;
    const objects = placeGatherObjects(layers, KINDS);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.kind).toBe(0);
    // 묶음 가운데(8 ~ 15의 가운데 = 12) 쪽: (9, 0)·(15, 0) 가운데 (9, 0)이 더 가깝다(거리 제곱 2배 좌표 49+225 vs 121+225)
    expect(objects[0]).toMatchObject({ x: 9, y: 0, id: 9 });
    // 같은 입력 = 같은 결과
    expect(placeGatherObjects(layers, KINDS)).toEqual(objects);
  });

  it("바위 지표가 1/4 이상인 묶음에 광맥(천분율 굴림), 소품이 있으면 소품이 먼저", () => {
    const layers = blank();
    // 묶음 (2, 2) = 지형 칸 (8 ~ 11, 8 ~ 11): 바위 넷
    for (const t of [8, 9, 10, 11]) layers.surface[8 * 128 + t] = TERRAIN_SURFACE.rock;
    const rock = placeGatherObjects(layers, KINDS);
    expect(rock).toEqual([{ id: 16 * 256 + 20, kind: 2, x: 20, y: 16 }]);
    // 바위 셋이면 없다
    layers.surface[8 * 128 + 11] = TERRAIN_SURFACE.grass;
    expect(placeGatherObjects(layers, KINDS)).toEqual([]);
    // 천분율 0이면 없다, 굴림은 0 ~ 999
    layers.surface[8 * 128 + 11] = TERRAIN_SURFACE.rock;
    expect(
      placeGatherObjects(layers, [kind({ id: "conifer", arts: [2] }), kind({ source: "rock", chancePm: 0 })]),
    ).toEqual([]);
    for (let block = 0; block < 50; block++) {
      const roll = blockRoll(layers.mapKey, block, 2);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(1000);
    }
    // 그림 층이 없어도(임시 지형) 바위 오브젝트는 선다
    expect(placeGatherObjects({ mapKey: layers.mapKey, surface: layers.surface }, KINDS)).toHaveLength(1);
    expect(OBJECT_BLOCK_CELLS).toBe(8);
  });
});

describe("밭·목초지·물터(plot) 자리 — docs/adr/2026-11-11-city-catchment.md", () => {
  const field = kind({
    id: "field",
    source: "plot",
    surfaces: [TERRAIN_SURFACE.grass, TERRAIN_SURFACE.dirt],
    minCells: 32,
    material: "crop",
    facility: "farm",
    direct: false,
  });
  const water = kind({
    id: "water",
    source: "plot",
    surfaces: [TERRAIN_SURFACE.water],
    minCells: 16,
    facility: "fishing_spot",
    direct: false,
  });

  it("16×16 묶음마다 하나, 자리 = 묶음 가운데에 가까운 그 지표 칸의 홀수 배치 칸, 소품 오브젝트와 겹치지 않음", () => {
    const layers = blank();
    const objects = placeGatherObjects(layers, [field]);
    expect(objects).toHaveLength(PLOT_BLOCK_CELLS * PLOT_BLOCK_CELLS);
    // 묶음 (0, 0): 가운데(16, 16 — 두 배 좌표)에 가장 가까운 지형 칸 (3, 3) → 배치 칸 (7, 7)
    expect(objects[0]).toMatchObject({ x: 7, y: 7, id: 7 * 256 + 7, kind: 0 });
    // 소품 오브젝트가 그 칸에 있으면 다음 가까운 칸
    layers.art[7 * 256 + 7] = 2;
    const mixed = placeGatherObjects(layers, [kind({ id: "conifer", arts: [2] }), field]);
    const ids = mixed.map((object) => object.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mixed[0]).toMatchObject({ id: 7 * 256 + 7, kind: 0 });
    expect(mixed.find((object) => object.kind === 1 && object.x < 16 && object.y < 16)?.id).not.toBe(
      7 * 256 + 7,
    );
  });

  it("지표가 문턱보다 적으면 없고, 원자재 비트가 없으면(기후) 없다. 원자재를 모르면(임시 지형) 지표만 본다", () => {
    const layers = blank();
    expect(placeGatherObjects(layers, [water])).toHaveLength(0);
    // 묶음 (0, 0) 지형 칸 8×8 가운데 위 두 줄(16칸)만 물
    for (let ty = 0; ty < 2; ty++)
      for (let tx = 0; tx < 8; tx++) layers.surface[ty * 128 + tx] = TERRAIN_SURFACE.water;
    expect(placeGatherObjects(layers, [water]).map((object) => object.kind)).toEqual([0]);
    expect(placeGatherObjects({ ...blank(), materials: 0 }, [field])).toHaveLength(0);
    expect(placeGatherObjects({ ...blank(), materials: MATERIAL_BIT.crop }, [field])).toHaveLength(256);
  });

  it("맞는 종류가 여럿이면 (2차맵, 묶음) 굴림으로 하나 — 같은 입력이면 같은 결과", () => {
    const pasture = { ...field, id: "pasture", facility: "ranch", material: "livestock" as const };
    const a = placeGatherObjects(blank(), [field, pasture]);
    const b = placeGatherObjects(blank(), [field, pasture]);
    expect(a).toEqual(b);
    const kinds = new Set(a.map((object) => object.kind));
    expect(kinds).toEqual(new Set([0, 1]));
  });
});

describe("노두(outcrop) 자리 — 기획 D-534 질문 1083 나", () => {
  const stone = kind({
    id: "stone_outcrop",
    source: "outcrop",
    surfaces: [TERRAIN_SURFACE.grass, TERRAIN_SURFACE.dirt],
    chancePm: 400,
    art: 20,
    item: "stone",
    facility: "mine",
  });
  const copper = { ...stone, id: "copper_outcrop", chancePm: 200, art: 21, item: "copper_ore" };
  const field = kind({
    id: "field",
    source: "plot",
    surfaces: [TERRAIN_SURFACE.grass],
    minCells: 32,
    facility: "farm",
    direct: false,
  });

  it("광석 몫이 없으면(임시 지형·물) 없고, 몫이 클수록 많다(같은 굴림 — 낮은 땅 ⊂ 산지)", () => {
    expect(placeGatherObjects(blank(), [stone, copper])).toEqual([]);
    expect(placeGatherObjects({ ...blank(), oreSharePm: 0 }, [stone, copper])).toEqual([]);
    const low = placeGatherObjects({ ...blank(), oreSharePm: 200 }, [stone, copper]);
    const high = placeGatherObjects({ ...blank(), oreSharePm: 1000 }, [stone, copper]);
    expect(low.length).toBeGreaterThan(0);
    expect(high.length).toBeGreaterThan(low.length * 2);
    // 16×16 묶음마다 많아야 하나
    expect(high.length).toBeLessThanOrEqual(PLOT_BLOCK_CELLS * PLOT_BLOCK_CELLS);
    const highIds = new Set(high.map((object) => object.id));
    for (const object of low) expect(highIds.has(object.id)).toBe(true);
    expect(new Set(high.map((object) => object.kind))).toEqual(new Set([0, 1]));
    // 같은 입력 = 같은 결과
    expect(placeGatherObjects({ ...blank(), oreSharePm: 200 }, [stone, copper])).toEqual(low);
  });

  it("앞 종류(소품·밭) 번호·자리는 그대로, 노두는 그 뒤·빈 칸·지표 칸·소품 없는 칸에만", () => {
    const layers = { ...blank(), oreSharePm: 1000 };
    layers.art[9] = 2;
    const before = placeGatherObjects(layers, [kind({ id: "conifer", arts: [2] }), field]);
    const after = placeGatherObjects(layers, [kind({ id: "conifer", arts: [2] }), field, stone]);
    expect(after.slice(0, before.length)).toEqual(before);
    const outcrops = after.slice(before.length);
    expect(outcrops.length).toBeGreaterThan(0);
    const ids = after.map((object) => object.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const object of outcrops) {
      expect(object.kind).toBe(2);
      expect(layers.art[object.id]).toBe(0);
      expect(object.x % 2).toBe(1);
      expect(object.y % 2).toBe(1);
    }
    // 지표가 맞지 않으면(모두 물) 없다
    const wet = {
      ...blank(),
      oreSharePm: 1000,
      surface: new Uint8Array(128 * 128).fill(TERRAIN_SURFACE.water),
    };
    expect(placeGatherObjects(wet, [stone])).toEqual([]);
  });

  it("목재 몫 노두(관목 땔감 — 기본 재료 바닥 보장)는 광석 몫이 아니라 목재 몫을 곱한다", () => {
    const brush = {
      ...stone,
      id: "brushwood",
      share: "wood" as const,
      art: 3,
      item: "pine_log",
      facility: "lumber_camp",
    };
    // 광석 몫만 있으면 관목은 없고, 목재 몫만 있으면 관목만
    expect(placeGatherObjects({ ...blank(), oreSharePm: 1000 }, [brush])).toEqual([]);
    const woody = placeGatherObjects({ ...blank(), woodSharePm: 300 }, [stone, brush]);
    expect(woody.length).toBeGreaterThan(0);
    expect(woody.every((object) => object.kind === 1)).toBe(true);
    // 앞 종류(돌 노두)는 목재 몫 종류를 더해도 그대로
    const both = placeGatherObjects({ ...blank(), oreSharePm: 500, woodSharePm: 300 }, [stone, brush]);
    const stones = placeGatherObjects({ ...blank(), oreSharePm: 500 }, [stone]);
    expect(both.filter((object) => object.kind === 0)).toEqual(stones);
  });
});

describe("채집 셈", () => {
  const rules = TEST_SOCIETY_COEFFICIENTS.gatherObjects;

  it("걸리는 시간 = ⌈일 ÷ 진행 속도⌉(진행 속도 = max(1, ⌊주 스탯 ÷ 20⌋))", () => {
    expect(gatherDurationMs({ workMs: 20_000 }, 10, 20)).toBe(20_000);
    expect(gatherDurationMs({ workMs: 20_000 }, 60, 20)).toBe(6667);
  });

  it("효율: 직접 500‰, 시설 Lv1 1000‰ · Lv3 1400‰. 수확 ‰ 묶음과 나머지", () => {
    expect(gatherEfficiencyPm(rules, null)).toBe(500);
    expect(gatherEfficiencyPm(rules, 1)).toBe(1000);
    expect(gatherEfficiencyPm(rules, 3)).toBe(1400);
    // 보조 10 × 100‰ = +1 → 수확량 2, 묶음 1 → 2묶음 × 효율
    const rule = { yieldBase: 1, yieldPerStatPm: 100, yieldCap: 10 };
    expect(gatherYieldPm({ lots: 1 }, 10, rule, 80, 500)).toBe(1000);
    expect(gatherYieldPm({ lots: 1 }, 0, undefined, 80, 500)).toBe(500);
    expect(splitPm(500, 0)).toEqual({ whole: 0, carryPm: 500 });
    expect(splitPm(500, 500)).toEqual({ whole: 1, carryPm: 0 });
  });

  it("피로: 시설 반경 안이면 배율, 다시 자람: 오염 비례 + 시설 반경 안 배율", () => {
    expect(gatherFatiguePm(rules, null)).toBe(1000);
    expect(gatherFatiguePm(rules, 1)).toBe(500);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 0, null)).toBe(1_800_000);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 100_000, null)).toBe(3_600_000);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 50_000, 1)).toBe(1_350_000);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 999_999, null)).toBe(3_600_000);
  });
});
