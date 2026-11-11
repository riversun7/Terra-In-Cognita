// 첫 접속 나라 고르기 카드 시험(2026-11-11) — 자세한 정보(프리셋 + 거울 세계 + 세율)와 추천 규칙(앞의 3곳)
import { describe, expect, it } from "vitest";
import type { NationPreset } from "../npc/nations.ts";
import { nationProfilesOf } from "./nationProfile.ts";
import { recommendedNations } from "./service.ts";

const preset: NationPreset = {
  code: "placeholder_nation_01",
  name: { ko: "메리데일", en: "Meridale" },
  color: "#c0392b",
  leaderName: { ko: "졸란 하웰", en: "Jolan Harwell" },
  intro: { ko: "[임시] 들판의 나라", en: "[Placeholder] A plains nation" },
  tradeTaxBp: 200,
  currency: { code: "placeholder_cur_01", name: { ko: "올더", en: "Alder" }, symbol: "Ⱥ", ticker: "ALD" },
};

describe("나라 자세한 정보", () => {
  it("프리셋·거울 세계·도시 경제 세율을 모은다(인구 = 그 나라 도시에 사는 휴먼, 세율은 경제 값이 먼저)", () => {
    const world = {
      factions: new Map([
        [
          7,
          {
            id: 7,
            code: "placeholder_nation_01",
            fixed: true,
            alive: true,
            regime: "dictatorship" as const,
            tech: 3,
          },
        ],
        [8, { id: 8, code: "rebels", fixed: false, alive: true, regime: "democracy" as const, tech: 1 }],
      ]),
      cities: new Map([
        [100, { owner: 7 }],
        [101, { owner: 7 }],
        [102, { owner: 8 }],
      ]),
      units: new Map([
        [1, { city: 100 }],
        [2, { city: 100 }],
        [3, { city: 101 }],
        [4, { city: 102 }],
        [5, { city: 999 }],
      ]),
    };
    const profileOf = nationProfilesOf(
      { presets: [preset], world: () => world, taxOf: (id) => (id === 7 ? 350 : undefined) },
      new Map([["placeholder_nation_01", "a".repeat(64)]]),
    );
    expect(profileOf("placeholder_nation_01")).toEqual({
      tier: null,
      humans: 3,
      cityCount: 2,
      regime: "dictatorship",
      tech: 3,
      taxBp: 350,
      currency: { name: { ko: "올더", en: "Alder" }, symbol: "Ⱥ", ticker: "ALD" },
      leaderName: { ko: "졸란 하웰", en: "Jolan Harwell" },
      emblem: expect.objectContaining({ color: "#c0392b", uploaded: "a".repeat(64) }),
      intro: { ko: "[임시] 들판의 나라", en: "[Placeholder] A plains nation" },
    });
    // 프리셋이 없는 세력은 거울 세계 칸만
    expect(profileOf("rebels")).toMatchObject({
      humans: 1,
      cityCount: 1,
      regime: "democracy",
      currency: null,
    });
    expect(profileOf("nobody")).toBeUndefined();
  });

  it("NPC 사회 런타임이 없으면 거울 세계 칸은 null, 세율은 팩 값", () => {
    const profile = nationProfilesOf(
      { presets: [preset], world: () => undefined },
      undefined,
    )("placeholder_nation_01");
    expect(profile).toMatchObject({ humans: null, cityCount: null, regime: null, tech: null, taxBp: 200 });
    expect(profile?.emblem?.uploaded).toBeNull();
  });
});

describe("추천 나라", () => {
  it("시작 도시 하나당 사이보그가 적은 차례 → 시작 도시가 많은 차례 → ID 차례로 앞의 3곳", () => {
    const fresh = [
      { id: 1, cyborgs: 0, startCities: 2 },
      { id: 2, cyborgs: 0, startCities: 6 },
      { id: 3, cyborgs: 0, startCities: 4 },
      { id: 4, cyborgs: 0, startCities: 6 },
      { id: 5, cyborgs: 0, startCities: 1 },
    ];
    expect([...recommendedNations(fresh)]).toEqual([2, 4, 3]);
    // 6곳 나라에 사이보그가 몰리면(6명 ÷ 6곳 = 1) 덜 찬 나라가 앞선다
    const busy = fresh.map((entry) => (entry.id === 2 ? { ...entry, cyborgs: 6 } : entry));
    expect([...recommendedNations(busy)]).toEqual([4, 3, 1]);
  });

  it("열린 나라가 3곳 이하면 1곳만(모두 추천이면 뜻이 없다), 없으면 0곳", () => {
    expect([...recommendedNations([{ id: 9, cyborgs: 2, startCities: 1 }])]).toEqual([9]);
    expect(
      recommendedNations([
        { id: 1, cyborgs: 1, startCities: 2 },
        { id: 2, cyborgs: 0, startCities: 2 },
      ]).size,
    ).toBe(1);
    expect(recommendedNations([]).size).toBe(0);
  });
});
