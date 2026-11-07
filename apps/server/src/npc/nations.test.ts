import { START_WORLD_SEED, startCitiesFor } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { MAX_TEST_NATIONS, START_CITY_SLOTS, nationCode, nationName, planStartCities } from "./nations.ts";

const presets = [
  { code: "placeholder_nation_01", name: { ko: "임시 국가 1", en: "Placeholder nation 1" } },
  { code: "placeholder_nation_02", name: { ko: "임시 국가 2", en: "Placeholder nation 2" } },
];
/** 팩처럼 프리셋 16개 */
const sixteen = Array.from({ length: MAX_TEST_NATIONS }, (_, index) => ({
  code: `placeholder_nation_${String(index + 1).padStart(2, "0")}`,
  name: { ko: `임시 국가 ${index + 1}`, en: `Placeholder nation ${index + 1}` },
}));

describe("시험 국가 코드·이름(질문 203 가, D-460)", () => {
  it("1번은 시험 NPC 세력, 2번부터 팩 프리셋 차례, 모자라면 npc_nation_NN", () => {
    expect([1, 2, 3, 4].map((n) => nationCode(n, presets))).toEqual([
      "s3_test_npc",
      "placeholder_nation_01",
      "placeholder_nation_02",
      "npc_nation_04",
    ]);
    expect(nationName("placeholder_nation_02", presets)).toEqual({
      ko: "임시 국가 2",
      en: "Placeholder nation 2",
    });
    expect(nationName("npc_nation_04", presets)).toEqual({ ko: "시험 NPC 국가 4", en: "Test NPC nation 4" });
    expect(nationName("someone_else", presets)).toBeUndefined();
  });

  it("1번 이름 = 2번부터의 코드가 쓰지 않는 16번째 프리셋(16개 프리셋이 16개 국가에 하나씩), 없으면 시험 NPC 국가 1", () => {
    expect(nationName("s3_test_npc", sixteen)).toEqual({ ko: "임시 국가 16", en: "Placeholder nation 16" });
    const codes = Array.from({ length: MAX_TEST_NATIONS }, (_, index) => nationCode(index + 1, sixteen));
    const names = codes.map((code) => nationName(code, sixteen)?.ko);
    expect(new Set(names).size).toBe(MAX_TEST_NATIONS);
    expect(nationName("s3_test_npc", presets)).toEqual({ ko: "시험 NPC 국가 1", en: "Test NPC nation 1" });
  });
});

describe("시작 도시 자리(세계 씨앗, D-6041)", () => {
  it("국가마다 도시 수 = 설정 칸 아래 끝 → 위 끝을 차례로 돈다(거꾸로 넣어도 같다, 1~4 안)", () => {
    expect([1, 2, 3, 4].map((n) => startCitiesFor(n, START_WORLD_SEED))).toEqual([2, 3, 2, 3]);
    const swapped = { ...START_WORLD_SEED, startCitiesMin: 4, startCitiesMax: 2 };
    expect([1, 2, 3, 4].map((n) => startCitiesFor(n, swapped))).toEqual([2, 3, 4, 2]);
    expect(startCitiesFor(1, { ...START_WORLD_SEED, startCitiesMin: 0, startCitiesMax: 9 })).toBe(1);
  });

  it("빈 세계: 자리 차례마다 2차맵을 돌아 국가 하나의 도시가 서로 다른 2차맵에, 2차맵마다 1~2곳", () => {
    const maps = [10, 11, 12, 13, 14, 15];
    const plan = planStartCities(
      [
        { factionId: 1, missing: 2 },
        { factionId: 2, missing: 3 },
        { factionId: 3, missing: 2 },
        { factionId: 4, missing: 3 },
      ],
      maps,
      [],
    );
    expect(plan).toHaveLength(10);
    for (const factionId of [1, 2, 3, 4]) {
      const own = plan.filter((entry) => entry.factionId === factionId).map((entry) => entry.spot.mapKey);
      expect(new Set(own).size).toBe(own.length);
    }
    for (const mapKey of maps) {
      const here = plan.filter((entry) => entry.spot.mapKey === mapKey).length;
      expect(here).toBeGreaterThanOrEqual(1);
      expect(here).toBeLessThanOrEqual(2);
    }
    // 국가 1은 모든 2차맵에 있지 않다
    expect(plan.filter((entry) => entry.factionId === 1)).toEqual([
      { factionId: 1, spot: { mapKey: 10, x: 128, y: 128 } },
      { factionId: 1, spot: { mapKey: 11, x: 128, y: 128 } },
    ]);
  });

  it("옛 세계(첫 장 가운데·고정 자리에 국가마다 하나): 있는 도시는 찬 자리로 치고 모자란 것만 다른 2차맵에 더한다", () => {
    const maps = [10, 11, 12, 13, 14, 15];
    const old = [
      { mapKey: 10, x: 128, y: 128 },
      { mapKey: 10, x: 64, y: 64 },
      { mapKey: 10, x: 192, y: 64 },
      { mapKey: 10, x: 64, y: 192 },
    ];
    const plan = planStartCities(
      [
        { factionId: 1, missing: 1 },
        { factionId: 2, missing: 2 },
        { factionId: 3, missing: 1 },
        { factionId: 4, missing: 2 },
      ],
      maps,
      old,
    );
    expect(plan).toHaveLength(6);
    for (const entry of plan)
      for (const spot of old)
        if (spot.mapKey === entry.spot.mapKey)
          expect(Math.hypot(spot.x - entry.spot.x, spot.y - entry.spot.y)).toBeGreaterThanOrEqual(32);
    expect(plan[0]).toEqual({ factionId: 1, spot: { mapKey: 11, x: 128, y: 128 } });
    // 다 있으면 아무것도 더하지 않는다(멱등)
    expect(planStartCities([{ factionId: 1, missing: 0 }], maps, old)).toEqual([]);
  });

  it("후보가 다 차면 남은 도시는 고르지 않는다(2차맵 한 장 = 자리 수까지)", () => {
    const plan = planStartCities([{ factionId: 1, missing: START_CITY_SLOTS.length + 5 }], [10], []);
    expect(plan).toHaveLength(START_CITY_SLOTS.length);
    const spots = new Set(plan.map((entry) => `${entry.spot.x},${entry.spot.y}`));
    expect(spots.size).toBe(START_CITY_SLOTS.length);
  });
});
