import { describe, expect, it } from "vitest";
import { presetTactics } from "./aiTactics.ts";
import { createRng } from "./rng.ts";
import {
  DEFAULT_AI_BLEND_RULES,
  DEFAULT_LOYALTY_OVERRIDE_RULES,
  DEFAULT_ROLE_TRAIT_RANGES,
  DEFAULT_UNIT_TRAITS,
  UNIT_TRAIT_AXES,
  type UnitTraits,
  blendCityTraits,
  blendFactionTraits,
  blendHouseTraits,
  blendOrgTraits,
  blendTacticsByLoyalty,
  driftUnitTraits,
  isUnitTraits,
  loyaltyOverridePm,
  rollUnitTraits,
  tacticsFromUnitTraits,
  toLegacyTraits,
  unitTraitsFromArray,
  unitTraitsToArray,
  upgradeLegacyTraits,
} from "./unitTraits.ts";

const makeTraits = (overrides: Partial<UnitTraits> = {}): UnitTraits => ({
  ...DEFAULT_UNIT_TRAITS,
  ...overrides,
});

describe("7축 통합 성향(unitTraits)", () => {
  it("배열 직렬화·역직렬화와 모양 검사가 일치한다", () => {
    const sample = makeTraits({
      belligerence: 820,
      greed: 340,
      boldness: 910,
      communalism: 150,
      autonomy: 770,
      openness: 600,
      discipline: 420,
    });
    expect(isUnitTraits(sample)).toBe(true);
    const arr = unitTraitsToArray(sample);
    expect(arr).toHaveLength(UNIT_TRAIT_AXES.length);
    expect(unitTraitsFromArray(arr)).toEqual(sample);
    expect(unitTraitsFromArray([500, 500, 500, 500])).toBeUndefined();
    expect(unitTraitsFromArray([500, 500, 500, 500, 500, 500, 1001])).toBeUndefined();
    expect(unitTraitsFromArray([500, 500, 500, 500, 500, 500, -1])).toBeUndefined();
    expect(isUnitTraits({ ...sample, boldness: 1001 })).toBe(false);
  });

  it("옛 4축 세력 성향 + leaderPm을 7축으로 변환하고 4축으로 투영한다", () => {
    const legacy = { aggression: 800, commerce: 600, faith: 300, station: 750 };
    const upgraded = upgradeLegacyTraits(legacy, 400);
    expect(upgraded.belligerence).toBe(800);
    expect(upgraded.greed).toBe(600);
    expect(upgraded.communalism).toBe(300);
    expect(upgraded.openness).toBe(750);
    expect(upgraded.boldness).toBe(700);
    expect(upgraded.autonomy).toBe(720);
    expect(upgraded.discipline).toBe(260);
    expect(toLegacyTraits(upgraded)).toEqual(legacy);
  });

  it("시드 굴림과 바탕 편차 굴림이 결정적이고 직군 구간을 지킨다", () => {
    const a = rollUnitTraits(createRng(42), DEFAULT_ROLE_TRAIT_RANGES.guard);
    const b = rollUnitTraits(createRng(42), DEFAULT_ROLE_TRAIT_RANGES.guard);
    expect(a).toEqual(b);
    for (const axis of UNIT_TRAIT_AXES) {
      const range = DEFAULT_ROLE_TRAIT_RANGES.guard[axis];
      expect(a[axis]).toBeGreaterThanOrEqual(range.min);
      expect(a[axis]).toBeLessThanOrEqual(range.max);
    }

    const anchor = makeTraits({ belligerence: 900, greed: 100, boldness: 500 });
    const drifted = driftUnitTraits(anchor, 120, createRng(99), DEFAULT_ROLE_TRAIT_RANGES.citizen);
    // citizen belligerence max = 750 → center 750, [630, 750]
    expect(drifted.belligerence).toBeGreaterThanOrEqual(630);
    expect(drifted.belligerence).toBeLessThanOrEqual(750);
    // citizen greed min = 200 → center 200, [200, 320]
    expect(drifted.greed).toBeGreaterThanOrEqual(200);
    expect(drifted.greed).toBeLessThanOrEqual(320);
  });

  it("축별 차등 체제 합성: 독재는 대장 주도(결단 축 특히 강함), 민주는 가문장 반영, 대장 100% 프리셋 지원", () => {
    const leader = makeTraits({ belligerence: 1000, greed: 1000 });
    const house1 = makeTraits({ belligerence: 0, greed: 0 });
    const base = makeTraits({ belligerence: 500, greed: 500 });

    const dict = blendFactionTraits({
      regime: "dictatorship",
      leader,
      houses: [{ traits: house1, weight: 1 }],
      base,
    });
    // 결단 축(75:5:20) = 750 + 0 + 100 = 850, 문화 축(55:20:25) = 550 + 0 + 125 = 675
    expect(dict.belligerence).toBe(850);
    expect(dict.greed).toBe(675);

    const demo = blendFactionTraits({
      regime: "democracy",
      leader,
      houses: [{ traits: house1, weight: 1 }],
      base,
    });
    // 결단 축(40:40:20) = 400 + 0 + 100 = 500, 문화 축(20:55:25) = 200 + 0 + 125 = 325
    expect(demo.belligerence).toBe(500);
    expect(demo.greed).toBe(325);

    // 자본주의: 지분 가중치(900 vs 100)가 반영된다
    const cap = blendFactionTraits({
      regime: "capitalism",
      leader: makeTraits({ greed: 500 }),
      houses: [
        { traits: makeTraits({ greed: 1000 }), weight: 900 },
        { traits: makeTraits({ greed: 0 }), weight: 100 },
      ],
      base: makeTraits({ greed: 500 }),
    });
    // 구성원 평균 = 900 → 문화(20:55:25) = 100 + 495 + 125 = 720
    expect(cap.greed).toBe(720);

    // 대장 100% 종속 프리셋(안 A 호환)
    const leaderOnly = blendOrgTraits({
      leader,
      members: house1,
      base,
      blend: {
        decision: { leaderPm: 1000, membersPm: 0, basePm: 0 },
        culture: { leaderPm: 1000, membersPm: 0, basePm: 0 },
      },
    });
    expect(leaderOnly).toEqual(leader);
  });

  it("조직 평균 충성도가 낮아지면 대장 장악력이 줄고 구성원 비중이 커진다", () => {
    const leader = makeTraits({ belligerence: 1000 });
    const members = makeTraits({ belligerence: 0 });
    const base = makeTraits({ belligerence: 500 });
    const loyal = blendOrgTraits({
      leader,
      members,
      base,
      blend: DEFAULT_AI_BLEND_RULES.dictatorship,
      avgLoyalty: 80,
    });
    const unrest = blendOrgTraits({
      leader,
      members,
      base,
      blend: DEFAULT_AI_BLEND_RULES.dictatorship,
      avgLoyalty: 0,
    });
    expect(loyal.belligerence).toBe(850);
    // 충성도 0 → 대장 비중 750 × 0.3 = 225, 구성원 50 + 525 = 575, 바탕 200 → 225 + 0 + 100 = 325
    expect(unrest.belligerence).toBe(325);
  });

  it("가문·도시 합성과 가문 덮어쓰기(override)가 동작한다", () => {
    const override = makeTraits({ openness: 999 });
    expect(
      blendHouseTraits({ leader: DEFAULT_UNIT_TRAITS, members: [DEFAULT_UNIT_TRAITS], override }),
    ).toEqual(override);

    const city = blendCityTraits({
      mayor: makeTraits({ boldness: 1000, communalism: 1000 }),
      citizens: [makeTraits({ boldness: 0, communalism: 0 })],
      nation: makeTraits({ boldness: 500, communalism: 500 }),
    });
    // 도시 결단(65:0:35) = 650 + 175 = 825, 문화(50:20:30) = 500 + 0 + 150 = 650
    expect(city.boldness).toBe(825);
    expect(city.communalism).toBe(650);
  });

  it("충성도(=만족도) 연동 개성 개입률이 유닛 종류와 성향(자치·규율·공동체)에 따라 계산된다", () => {
    const neutral = DEFAULT_UNIT_TRAITS;
    // 사이보그 본체·안드로이드·미집계(null) = 0‰
    expect(loyaltyOverridePm({ kind: "cyborg_main", loyaltyMilli: 0, traits: neutral })).toBe(0);
    expect(loyaltyOverridePm({ kind: "android", loyaltyMilli: 0, traits: neutral })).toBe(0);
    expect(loyaltyOverridePm({ kind: "human", loyaltyMilli: null, traits: neutral })).toBe(0);
    // 크리쳐 = 고정 야생 본능
    expect(loyaltyOverridePm({ kind: "creature", loyaltyMilli: null, traits: neutral })).toBe(
      DEFAULT_LOYALTY_OVERRIDE_RULES.creatureInstinctPm,
    );
    // 휴먼 충성도 구간(중립 성향)
    expect(loyaltyOverridePm({ kind: "human", loyaltyMilli: 100_000, traits: neutral })).toBe(0);
    expect(loyaltyOverridePm({ kind: "human", loyaltyMilli: 80_000, traits: neutral })).toBe(50);
    expect(loyaltyOverridePm({ kind: "human", loyaltyMilli: 50_000, traits: neutral })).toBe(250);
    expect(loyaltyOverridePm({ kind: "human", loyaltyMilli: 20_000, traits: neutral })).toBe(600);
    expect(loyaltyOverridePm({ kind: "human", loyaltyMilli: 0, traits: neutral })).toBe(800);

    // 자치 높고 규율 낮은 휴먼은 개입↑, 규율·공동체 높은 휴먼은 개입↓
    const rebel = makeTraits({ autonomy: 1000, discipline: 0, communalism: 0 });
    const dutiful = makeTraits({ autonomy: 0, discipline: 1000, communalism: 1000 });
    const ovRebel = loyaltyOverridePm({ kind: "human", loyaltyMilli: 50_000, traits: rebel });
    const ovDutiful = loyaltyOverridePm({ kind: "human", loyaltyMilli: 50_000, traits: dutiful });
    expect(ovRebel).toBeGreaterThan(250);
    expect(ovDutiful).toBeLessThan(250);
  });

  it("7축 성향 → AI 작전 7슬라이더 변환 및 충성도 합성이 정확히 동작한다", () => {
    const berserker = makeTraits({ belligerence: 1000, boldness: 1000, autonomy: 900, discipline: 100 });
    const coward = makeTraits({ belligerence: 100, boldness: 0, communalism: 900, discipline: 900 });
    const tBerserk = tacticsFromUnitTraits(berserker);
    const tCoward = tacticsFromUnitTraits(coward);
    expect(tBerserk.engage).toBe(10);
    expect(tBerserk.retreatPct).toBe(0);
    expect(tBerserk.target).toBe("weakest");
    expect(tCoward.engage).toBeLessThanOrEqual(1);
    expect(tCoward.retreatPct).toBe(80);
    expect(tCoward.target).toBe("threat");

    const playerHold = presetTactics("hold");
    expect(blendTacticsByLoyalty(playerHold, tBerserk, 0)).toEqual(playerHold);
    expect(blendTacticsByLoyalty(playerHold, tBerserk, 1000)).toEqual(tBerserk);
    const half = blendTacticsByLoyalty(playerHold, tBerserk, 500);
    expect(half.engage).toBeGreaterThan(playerHold.engage);
    expect(half.engage).toBeLessThan(tBerserk.engage);
  });
});
