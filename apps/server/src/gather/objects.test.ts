// 원자재 오브젝트 자리·채집 셈 시험(순수) — docs/adr/2026-11-07-gather-objects.md 2·3절
import { TERRAIN_SURFACE } from "@terra/protocol";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { GatherKind } from "./kinds.ts";
import { OBJECT_BLOCK_CELLS, blockRoll, placeGatherObjects } from "./objects.ts";
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
    expect(gatherFatiguePm(rules, false)).toBe(1000);
    expect(gatherFatiguePm(rules, true)).toBe(500);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 0, false)).toBe(1_800_000);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 100_000, false)).toBe(3_600_000);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 50_000, true)).toBe(1_350_000);
    expect(regrowMs({ regrowMs: 1_800_000 }, rules, 999_999, false)).toBe(3_600_000);
  });
});
