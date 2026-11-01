import { createRng } from "@terra/shared";
import { zeroElements } from "@terra/shared/cyborg";
import { describe, expect, it } from "vitest";
import { skillSlotCount } from "../combat/equipment.ts";
import { TEST_SOCIETY_COEFFICIENTS as c } from "./coefficients.ts";
import { type ReligionItem, rebirthBlockers, rebirthCyborg, skillGradeCap } from "./cyborgRebirth.ts";
import { firstStatRoll, kFromRolls, rerollStats } from "./cyborgStats.ts";

const even = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
const flatK = { str: 1000, dex: 1000, agi: 1000, vit: 1000, int: 1000, wis: 1000 };
/** 생성 때 불 7·바람 3을 나눴고 앞선 종교 환생에서 빛 8을 얻은 사이보그 */
const ownElements = { ...zeroElements(), fire: 7, wind: 3, light: 8 };
const zeros = [0, 0, 0, 0, 0, 0];

/** 만렙·신앙도 70·신앙 포인트 40인 1회 환생 사이보그(태양교, 인공장기 하나를 낀 채) */
const ready = {
  level: 50,
  exp: 1234,
  rebirths: 1,
  religion: "sun_faith",
  faith: 70,
  faithPoints: 40,
  religionSkills: [],
  initial: even,
  kPm: flatK,
  elements: ownElements,
  organs: ["test_heart"],
};
const rich = { currency: 20_000n };

/** 태양교 진로 아이템: 빛 갈래를 열거나 특수 스킬 하나(D-452, 신앙 콘텐츠 데이터 고리) */
const sunRelic: ReligionItem = {
  asset: "item:sun_relic",
  religion: "sun_faith",
  branches: ["light"],
  skills: ["sun_blessing"],
};
/** 같은 종교의 어둠 갈래 아이템(갈래 바꾸기 시험) */
const sunShadow: ReligionItem = { ...sunRelic, asset: "item:sun_shadow", branches: ["dark"], skills: [] };
const holding = (asset: string, amount = 1n) => ({
  ...rich,
  item: (wanted: string) => (wanted === asset ? amount : 0n),
});

describe("사이보그 환생 조건(D-440·D-441·D-451)", () => {
  it("만렙 + 신앙도 문턱(N34) + 화폐(N34), 모자란 것을 모두 알려 준다", () => {
    expect(c.cyborg.rebirthFaith).toBe(50);
    expect(c.cyborg.rebirthCurrency).toBe(10_000);
    expect(rebirthBlockers(ready, rich, c)).toEqual([]);
    expect(rebirthBlockers({ ...ready, faith: 50 }, rich, c)).toEqual([]);
    expect(rebirthBlockers({ ...ready, level: 49, faith: 49 }, { currency: 9_999n }, c)).toEqual([
      "level",
      "faith",
      "currency",
    ]);
  });

  it("신앙 포인트는 조건이 아니다(따로 쓰는 재화, D-451)", () => {
    expect(rebirthBlockers({ ...ready, faithPoints: 0 }, rich, c)).toEqual([]);
  });
});

describe("사이보그 환생 결과", () => {
  it("레벨 1·경험치 0(가속 없음), 신앙도는 문턱만 보고 0으로(쓰지 않음), 신앙 포인트·종교·인공장기는 그대로, 분포는 성향으로 다시 굴린 값·K 리롤", () => {
    // 생성과 같은 굴림(D-444 164): 성향을 골라 굴리고, 다시 굴리기는 생성과 같은 N9 횟수 안
    const rng = createRng(11);
    const first = firstStatRoll("combat", rng, c);
    const rolled = rerollStats(first, "tech", rng, c);
    if (rolled === null) throw new Error("reroll");
    const result = rebirthCyborg(ready, rich, { spread: rolled, kRolls: [0, 9999, 5000, 0, 0, 0] }, c);
    expect(result).toEqual({
      ok: true,
      state: {
        level: 1,
        exp: 0,
        rebirths: 2,
        religion: "sun_faith",
        faith: 0,
        faithPoints: 40,
        religionSkills: [],
        initial: rolled.spread,
        kPm: { str: 800, dex: 1200, agi: 1000, vit: 800, int: 800, wis: 800 },
        elements: ownElements,
        organs: ["test_heart"],
      },
      spent: { currency: 10_000n, items: [] },
      grants: { skill: null },
    });
    // 같은 시드·같은 성향 차례면 같은 분포(서버가 굴림 상태를 들고 있다가 그대로 넘긴다)
    const replay = createRng(11);
    expect(rerollStats(firstStatRoll("combat", replay, c), "tech", replay, c)).toEqual(rolled);
  });

  it("신앙도가 문턱보다 많아도 남는 몫 없이 0이 된다", () => {
    const full = rebirthCyborg({ ...ready, faith: 100 }, rich, { kRolls: zeros }, c);
    expect(full.ok && full.state.faith).toBe(0);
  });

  it("분포를 안 굴리면 그대로, 굴린 값이 합 60·칸 1~20(N9)·아는 성향·다시 굴리기 횟수 안이 아니면 막는다", () => {
    const keep = rebirthCyborg(ready, rich, { kRolls: zeros }, c);
    expect(keep.ok && keep.state.initial).toEqual(even);
    // 분포를 그대로 둬도 K는 늘 다시 굴린다(사용자 결정 2026-11-01, D-026·D-446): 굴림 0 → N6 하한
    expect(keep.ok && keep.state.kPm).toEqual(kFromRolls(zeros, c));
    expect(keep.ok && keep.state.kPm).not.toEqual(ready.kPm);
    const rolled = firstStatRoll("trade", createRng(3), c);
    const wrongSum = { ...rolled, spread: { str: 20, dex: 20, agi: 10, vit: 10, int: 10, wis: 10 } };
    const outOfRange = { ...rolled, spread: { str: 25, dex: 15, agi: 5, vit: 5, int: 5, wis: 5 } };
    const unknown = { ...rolled, temperament: "bard" };
    const tooMany = { ...rolled, rerollsLeft: c.cyborg.initialRerolls + 1 };
    for (const spread of [wrongSum, outOfRange, unknown, tooMany])
      expect(rebirthCyborg(ready, rich, { spread, kRolls: zeros }, c)).toEqual({
        ok: false,
        blockers: ["distribution"],
      });
    expect(rebirthCyborg({ ...ready, level: 3 }, rich, { kRolls: zeros }, c)).toEqual({
      ok: false,
      blockers: ["level"],
    });
  });

  it("환생 한 번에 스킬 최대 등급 +1(기본 3, 상한 10), 스킬 칸 +1", () => {
    const after = rebirthCyborg(ready, rich, { kRolls: zeros }, c);
    if (!after.ok) throw new Error("rebirth");
    expect([skillGradeCap(ready.rebirths, c), skillGradeCap(after.state.rebirths, c)]).toEqual([4, 5]);
    expect(skillGradeCap(0, c)).toBe(3);
    expect(skillGradeCap(12, c)).toBe(10);
    expect([skillSlotCount(3, ready.rebirths, 10), skillSlotCount(3, after.state.rebirths, 10)]).toEqual([
      4, 5,
    ]);
  });

  it("K 굴림은 여섯 개, 0~9999", () => {
    expect(() => rebirthCyborg(ready, rich, { kRolls: [0, 0, 0] }, c)).toThrow(RangeError);
    expect(() => rebirthCyborg(ready, rich, { kRolls: [0, 0, 0, 0, 0, 10_000] }, c)).toThrow(RangeError);
  });
});

describe("환생 속성값(D-450: 4원소는 두거나 다시 나눈다, N36)", () => {
  it("다시 나누지 않으면 4원소·빛어둠 그대로", () => {
    const keep = rebirthCyborg(ready, rich, { kRolls: zeros }, c);
    expect(keep.ok && keep.state.elements).toEqual(ownElements);
  });

  it("다시 나누면 4원소만 바뀌고(생성과 같은 검사), 앞선 환생의 빛·어둠은 남는다", () => {
    const moved = rebirthCyborg(ready, rich, { kRolls: zeros, elements: { water: 10 } }, c);
    expect(moved.ok && moved.state.elements).toEqual({ ...zeroElements(), water: 10, light: 8 });
  });

  it("다시 나눈 값이 N36(두 칸까지, 합 10, 4원소만)에 맞지 않으면 막는다", () => {
    for (const elements of [{ water: 4, fire: 3, wind: 3 }, { fire: 9 }, { light: 10 }, { fire: 11 }])
      expect(rebirthCyborg(ready, rich, { kRolls: zeros, elements }, c)).toEqual({
        ok: false,
        blockers: ["elements"],
      });
  });
});

describe("진로별 종교 아이템(D-452: 빛·어둠 갈래 또는 종교 특수 스킬, 하나를 쓴다)", () => {
  it("빛·어둠 갈래: 고른 칸에 N37만큼 더하고 칸마다 10에서 자른다, 아이템 하나를 쓴다", () => {
    expect(c.cyborg.lightDarkPoints).toBe(5);
    const fresh = { ...ready, elements: { ...zeroElements(), fire: 7, wind: 3 } };
    const lit = rebirthCyborg(
      fresh,
      holding(sunRelic.asset),
      { kRolls: zeros, religionItem: { item: sunRelic, use: "branch", branch: "light" } },
      c,
    );
    expect(lit).toMatchObject({
      ok: true,
      state: { elements: { ...zeroElements(), fire: 7, wind: 3, light: 5 } },
      spent: { currency: 10_000n, items: [{ asset: "item:sun_relic", amount: 1n }] },
      grants: { skill: null },
    });
    // 이미 빛 8이면 13이 아니라 10
    const capped = rebirthCyborg(
      ready,
      holding(sunRelic.asset),
      { kRolls: zeros, religionItem: { item: sunRelic, use: "branch", branch: "light" } },
      c,
    );
    expect(capped.ok && capped.state.elements.light).toBe(10);
  });

  it("갈래를 바꾸면 앞 갈래 값은 0이 된다(D-455 184 나: 갈래는 하나), 같은 갈래는 쌓인다", () => {
    // 빛 8인 사이보그가 어둠 갈래로 → 빛 0, 어둠 5
    const switched = rebirthCyborg(
      ready,
      holding(sunShadow.asset),
      { kRolls: zeros, religionItem: { item: sunShadow, use: "branch", branch: "dark" } },
      c,
    );
    expect(switched.ok && switched.state.elements).toEqual({ ...zeroElements(), fire: 7, wind: 3, dark: 5 });
    // 4원소를 다시 나눠도 빛·어둠은 남는다(같은 환생에서 갈래도 고르면 함께)
    const both = rebirthCyborg(
      ready,
      holding(sunRelic.asset),
      {
        kRolls: zeros,
        elements: { earth: 10 },
        religionItem: { item: sunRelic, use: "branch", branch: "light" },
      },
      c,
    );
    expect(both.ok && both.state.elements).toEqual({ ...zeroElements(), earth: 10, light: 10 });
  });

  it("종교 특수 스킬: 환생 뒤 받을 스킬을 돌려준다(실제 부여는 부르는 쪽, 스킬석처럼), 속성값은 그대로", () => {
    const skilled = rebirthCyborg(
      ready,
      holding(sunRelic.asset),
      { kRolls: zeros, religionItem: { item: sunRelic, use: "skill", skill: "sun_blessing" } },
      c,
    );
    expect(skilled).toMatchObject({
      ok: true,
      state: { elements: ownElements, religionSkills: ["sun_blessing"] },
      spent: { items: [{ asset: "item:sun_relic", amount: 1n }] },
      grants: { skill: "sun_blessing" },
    });
    // 고유 스킬로 남아 다음 환생에도 있다(D-455 187), 같은 스킬을 또 받지는 못한다
    if (!skilled.ok) throw new Error("rebirth");
    const again = { ...skilled.state, level: 50, faith: 60 };
    expect(rebirthCyborg(again, rich, { kRolls: zeros }, c)).toMatchObject({
      ok: true,
      state: { religionSkills: ["sun_blessing"] },
    });
    expect(
      rebirthCyborg(
        again,
        holding(sunRelic.asset),
        { kRolls: zeros, religionItem: { item: sunRelic, use: "skill", skill: "sun_blessing" } },
        c,
      ),
    ).toEqual({ ok: false, blockers: ["religion_item"] });
  });

  it("아이템이 없거나, 다른 종교 것이거나, 그 갈래·스킬을 열지 않거나, 종교가 없으면 막는다", () => {
    const branch = { item: sunRelic, use: "branch", branch: "light" } as const;
    const cases = [
      { state: ready, wallet: rich, use: branch },
      { state: { ...ready, religion: "moon_faith" }, wallet: holding(sunRelic.asset), use: branch },
      { state: { ...ready, religion: null }, wallet: holding(sunRelic.asset), use: branch },
      {
        state: ready,
        wallet: holding(sunRelic.asset),
        use: { item: sunRelic, use: "branch", branch: "dark" } as const,
      },
      {
        state: ready,
        wallet: holding(sunRelic.asset),
        use: { item: sunRelic, use: "skill", skill: "moon_curse" } as const,
      },
    ];
    for (const { state, wallet, use } of cases)
      expect(rebirthCyborg(state, wallet, { kRolls: zeros, religionItem: use }, c)).toEqual({
        ok: false,
        blockers: ["religion_item"],
      });
  });

  it("아이템을 쓰지 않는 기본 환생에는 필요 없다", () => {
    expect(rebirthCyborg({ ...ready, religion: null }, rich, { kRolls: zeros }, c)).toMatchObject({
      ok: true,
    });
  });
});
