import { START_WORLD_SEED, startCitiesFor } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  MAX_TEST_NATIONS,
  START_CITY_SLOTS,
  nationCode,
  type NationLink,
  nationName,
  nationPresetOf,
  nextCityName,
  planStartCities,
  presetOfCode,
} from "./nations.ts";

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
  it("국가마다 도시 수 = 프리셋 성격 칸을 설정 칸 아래~위 끝 안으로(504 다), 칸이 없으면 모든 국가 아래 끝(504 나)", () => {
    expect([undefined, 4, 3, 2, 9].map((count) => startCitiesFor(START_WORLD_SEED, count))).toEqual([
      2, 4, 3, 2, 8,
    ]);
    // 위 끝 3이면 큰 나라(4)도 3, 아래 끝보다 작은 칸은 아래 끝
    const capped = { ...START_WORLD_SEED, startCitiesMin: 2, startCitiesMax: 3 };
    expect([undefined, 4, 1].map((count) => startCitiesFor(capped, count))).toEqual([2, 3, 2]);
    // 거꾸로 넣어도 같고, 1~8 밖은 자른다. 시험이 아래·위 끝을 1로 두면 모든 국가 하나
    const swapped = { ...START_WORLD_SEED, startCitiesMin: 4, startCitiesMax: 2 };
    expect([undefined, 3].map((count) => startCitiesFor(swapped, count))).toEqual([2, 3]);
    expect(startCitiesFor({ ...START_WORLD_SEED, startCitiesMin: 0, startCitiesMax: 9 }, 9)).toBe(8);
    expect(startCitiesFor({ ...START_WORLD_SEED, startCitiesMin: 1, startCitiesMax: 1 }, 4)).toBe(1);
  });

  it("세력 코드 → 프리셋(1번 = 16번째), 도시 이름은 쓰지 않은 첫 이름(510 다), 다 쓰면 번호를 붙여 다시 돈다(552 다)", () => {
    expect(presetOfCode("s3_test_npc", sixteen)?.code).toBe("placeholder_nation_16");
    expect(presetOfCode("placeholder_nation_02", sixteen)?.code).toBe("placeholder_nation_02");
    expect(presetOfCode("npc_nation_04", sixteen)).toBeUndefined();
    expect(nextCityName(["A", "B", "C"], new Set(["A", "C"]))).toBe("B");
    expect(nextCityName(["A"], new Set(["A"]))).toBe("A 2");
    expect(nextCityName(["A", "B"], new Set(["A", "B", "A 2"]))).toBe("B 2");
    expect(nextCityName(["A", "B"], new Set(["A", "B", "A 2", "B 2"]))).toBe("A 3");
    expect(nextCityName(undefined, new Set())).toBeUndefined();
    expect(nextCityName([], new Set())).toBeUndefined();
  });

  it("세력이 따르는 나라(601 나): 자기 프리셋 → 반란 부모 → 종주 → 태어날 때 부모, 고리가 돌면 멈춘다", () => {
    const links = new Map<number, NationLink>([
      // 고정 나라(프리셋 2번)
      [1, { code: "placeholder_nation_02", rebelOf: null, overlord: null }],
      // 반란의 반란: 반란 부모(1)가 종주(5)보다 먼저
      [2, { code: "rebel_2", rebelOf: 1, overlord: 5 }],
      [3, { code: "rebel_3", rebelOf: 2, overlord: null }],
      // 봉신 가문: 종주(1)
      [4, { code: "house_4", rebelOf: null, overlord: 1 }],
      [5, { code: "placeholder_nation_01", rebelOf: null, overlord: null }],
      // 독립 가문: 태어날 때 부모(4)만 안다 → 4의 종주 1
      [6, { code: "house_6", rebelOf: null, overlord: null, bornOf: 4 }],
      // 부모 없는 세력·서로를 가리키는 고리
      [7, { code: "free_7", rebelOf: null, overlord: null }],
      [8, { code: "rebel_8", rebelOf: 9, overlord: null }],
      [9, { code: "rebel_9", rebelOf: 8, overlord: null }],
    ]);
    const nation = (id: number) => nationPresetOf(id, (key) => links.get(key), sixteen)?.code;
    expect(nation(1)).toBe("placeholder_nation_02");
    expect(nation(3)).toBe("placeholder_nation_02");
    expect(nation(4)).toBe("placeholder_nation_02");
    expect(nation(6)).toBe("placeholder_nation_02");
    expect(nation(7)).toBeUndefined();
    expect(nation(8)).toBeUndefined();
    // 모르는 부모는 건너뛰고 다음 고리
    expect(
      nationPresetOf(
        10,
        (key) => (key === 10 ? { code: "x_10", rebelOf: 99, overlord: 5 } : links.get(key)),
        sixteen,
      )?.code,
    ).toBe("placeholder_nation_01");
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
