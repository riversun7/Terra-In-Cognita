// 보유 물건 판정 시험 — docs/adr/2026-11-03-item-holdings.md
import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { repairDurable, repairOrgan } from "../society/cyborgUpkeep.ts";
import {
  type ItemBuff,
  agedAt,
  battleWearAmount,
  belowPotionThreshold,
  freshnessPm,
  holdingKindOf,
  pickPotion,
  planArmorRestoreWear,
  planEffects,
  preservePmOf,
  rangePositionPm,
  refillAmmo,
  repairMaterialQty,
  rollHoldingStats,
  settleSpoilage,
  spoilAtMs,
  STORAGE_PLACES,
  stackMaxOf,
  storagePlaceOfLocation,
  wearDurable,
  wearable,
} from "./holding.ts";

const HOUR = 3_600_000;

describe("보유 모양", () => {
  it("장비는 하나하나, 신선도가 있으면 묶음, 사용 효과만 있으면 쌓임, 그 밖은 원장", () => {
    expect(holdingKindOf({ category: "equipment" })).toBe("instance");
    expect(holdingKindOf({ category: "raw", perish: { shelfLifeMs: HOUR, spoilsTo: "rot" } })).toBe("lot");
    expect(
      holdingKindOf({ category: "consumable", perish: { shelfLifeMs: HOUR, spoilsTo: "rot" }, use: {} }),
    ).toBe("lot");
    expect(holdingKindOf({ category: "consumable", use: {} })).toBe("stack");
    expect(holdingKindOf({ category: "raw" })).toBeNull();
  });

  it("장비 스택은 1, 상한이 없으면 기본 상한", () => {
    expect(stackMaxOf({ category: "equipment", stackMax: 50 })).toBe(1);
    expect(stackMaxOf({ category: "consumable", stackMax: 20 })).toBe(20);
    expect(stackMaxOf({ category: "consumable" })).toBe(1_000_000);
  });
});

describe("굴림(옛 rollInstanceProperties)", () => {
  it("범위 안 정수, 자리 ‰, 점수 = 자리 평균(D-5006)", () => {
    const ranges = [
      { stat: "defense_rate", min: 30, max: 60 },
      { stat: "armor_hp", min: 20, max: 40 },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      const rolled = rollHoldingStats(ranges, createRng(seed));
      const [a, b] = rolled.stats;
      expect(a?.value).toBeGreaterThanOrEqual(30);
      expect(a?.value).toBeLessThanOrEqual(60);
      expect(b?.value).toBeGreaterThanOrEqual(20);
      expect(b?.value).toBeLessThanOrEqual(40);
      expect(a?.pm).toBe(rangePositionPm(ranges[0] ?? { stat: "", min: 0, max: 0 }, a?.value ?? 0));
      expect(rolled.scorePm).toBe(Math.floor(((a?.pm ?? 0) + (b?.pm ?? 0)) / 2));
    }
  });

  it("같은 시드 = 같은 값, 범위 끝은 0·1000", () => {
    const ranges = [{ stat: "crit_multiplier", min: 0, max: 100 }];
    expect(rollHoldingStats(ranges, createRng(7))).toEqual(rollHoldingStats(ranges, createRng(7)));
    expect(rangePositionPm({ stat: "x", min: 20, max: 40 }, 20)).toBe(0);
    expect(rangePositionPm({ stat: "x", min: 20, max: 40 }, 40)).toBe(1000);
    expect(rangePositionPm({ stat: "x", min: 20, max: 40 }, 34)).toBe(700);
  });

  it("범위가 없으면 최소·자리 1000, 스탯이 없으면 점수 1000(옛 '범위 없으면 만점')", () => {
    expect(rollHoldingStats([{ stat: "x", min: 5, max: 5 }], createRng(1)).stats[0]).toEqual({
      stat: "x",
      value: 5,
      pm: 1000,
    });
    expect(rollHoldingStats([{ stat: "x", min: 9, max: 3 }], createRng(1)).stats[0]?.value).toBe(9);
    expect(rollHoldingStats([], createRng(1)).scorePm).toBe(1000);
  });
});

describe("닳기(D-496 289, 옛 BattleResult 25%)", () => {
  const rules = { chancePm: 250, amount: 1, lossChancePm: 150, lossAmount: 4 };

  it("확률 1000이면 늘, 0이면 안 닳는다. 지면 더 닳는다", () => {
    const always = { chancePm: 1000, amount: 1, lossChancePm: 1000, lossAmount: 4 };
    expect(battleWearAmount("won", always, createRng(1))).toBe(1);
    expect(battleWearAmount("lost", always, createRng(1))).toBe(5);
    expect(battleWearAmount("lost", { ...always, chancePm: 0, lossChancePm: 0 }, createRng(1))).toBe(0);
  });

  it("퇴각은 닳음이 아예 없다(D-514 352, D-190): 전투마다 닳음도 패배 닳음도 없다", () => {
    const always = { chancePm: 1000, amount: 1, lossChancePm: 1000, lossAmount: 4 };
    expect(battleWearAmount("retreated", always, createRng(1))).toBe(0);
    expect(battleWearAmount("retreated", { ...always, chancePm: 0 }, createRng(1))).toBe(0);
    // 난수 흐름은 셋 다 같다(두 번)
    const [a, b, c] = [createRng(9), createRng(9), createRng(9)];
    battleWearAmount("won", rules, a);
    battleWearAmount("lost", rules, b);
    battleWearAmount("retreated", rules, c);
    expect(new Set([a.nextU32(), b.nextU32(), c.nextU32()]).size).toBe(1);
  });

  it("25% 확률은 많이 굴리면 약 25%(같은 시드 = 같은 흐름, 이김·짐과 상관없이 난수 두 번)", () => {
    const rng = createRng(42);
    let worn = 0;
    for (let i = 0; i < 4000; i++) worn += battleWearAmount("won", rules, rng);
    expect(worn).toBeGreaterThan(900);
    expect(worn).toBeLessThan(1100);
    const a = createRng(3);
    const b = createRng(3);
    battleWearAmount("won", rules, a);
    battleWearAmount("lost", rules, b);
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it("전투 후 아머 회복 + 방어구 내구도 차감: 반올림(1~4 → 0, 5~14 → 1), 활성 방어구 없으면 회복 0", () => {
    // 방어구 없음 또는 모두 내구도 0이면 회복 안 됨
    expect(planArmorRestoreWear(30, [], 10, createRng(1))).toEqual({ restored: 0, spent: 0, losses: [] });
    expect(
      planArmorRestoreWear(
        30,
        [
          { id: 1, durability: 0 },
          { id: 2, durability: 0 },
        ],
        10,
        createRng(1),
      ),
    ).toEqual({ restored: 0, spent: 0, losses: [] });

    // 반올림: 1~4는 내구도 0 감소(아머는 회복), 5~14는 1 감소, 15~24는 2 감소
    expect(planArmorRestoreWear(4, [{ id: 1, durability: 10 }], 10, createRng(1))).toEqual({
      restored: 4,
      spent: 0,
      losses: [],
    });
    expect(planArmorRestoreWear(5, [{ id: 1, durability: 10 }], 10, createRng(1))).toEqual({
      restored: 5,
      spent: 1,
      losses: [{ id: 1, amount: 1 }],
    });
    expect(planArmorRestoreWear(15, [{ id: 1, durability: 10 }], 10, createRng(1))).toEqual({
      restored: 15,
      spent: 2,
      losses: [{ id: 1, amount: 2 }],
    });

    // 여러 방어구에 시드 무작위 분배 + 내구도 부족 시 남은 내구도 × 기준치만큼만 회복
    const multi = planArmorRestoreWear(
      35,
      [
        { id: 10, durability: 2 },
        { id: 20, durability: 1 },
      ],
      10,
      createRng(7),
    );
    expect(multi.restored).toBe(30);
    expect(multi.spent).toBe(3);
    expect(multi.losses).toEqual([
      { id: 10, amount: 2 },
      { id: 20, amount: 1 },
    ]);
  });

  it("0에서 멈추고, 0이면 입지 못한다(내구도 없는 물건은 늘 입는다)", () => {
    const item = { durability: 2, maxDurability: 100 };
    expect(wearDurable(item, 5)).toEqual({ durability: 0, maxDurability: 100 });
    expect(wearDurable(item, 0)).toBe(item);
    expect(wearable({ durability: 0 })).toBe(false);
    expect(wearable({ durability: 1 })).toBe(true);
    expect(wearable({ durability: null })).toBe(true);
  });
});

describe("수리(D-5031·F11·F12)", () => {
  const c = TEST_SOCIETY_COEFFICIENTS;

  it("시설 Lv1 30% → 최대 100이 70, 내구도 = 새 최대. 인공장기 수리와 같은 셈", () => {
    const done = repairDurable({ durability: 40, maxDurability: 100 }, 1, 0, c);
    expect(done).toEqual({
      item: { durability: 70, maxDurability: 70 },
      destroyed: false,
      maxLoss: 30,
      restored: 30,
    });
    const organ = repairOrgan({ durability: 40, maxDurability: 100 }, 1, 0, c);
    expect(organ.organ).toEqual(done.item);
    expect(organ.cost).toBe(30n * BigInt(c.cyborg.organRepairCost));
  });

  it("장인 실력이 감소를 반까지, 하한 5%, 최대 10 이하는 파괴", () => {
    expect(repairDurable({ durability: 0, maxDurability: 100 }, 1, 1000, c).maxLoss).toBe(15);
    expect(repairDurable({ durability: 0, maxDurability: 100 }, 5, 1000, c).maxLoss).toBe(5);
    const broken = repairDurable({ durability: 0, maxDurability: 14 }, 1, 0, c);
    expect(broken.destroyed).toBe(true);
    expect(broken.item.durability).toBe(0);
  });

  it("재료 양(옛 enhancement_routes): max(1, ⌈기본 × 티어 × 잃은 ÷ 최대⌉), 티어 0은 1", () => {
    expect(repairMaterialQty(2, 3, 50, 100)).toBe(3);
    expect(repairMaterialQty(2, 0, 1, 100)).toBe(1);
    expect(repairMaterialQty(1, 5, 100, 100)).toBe(5);
    expect(repairMaterialQty(2, 3, 0, 100)).toBe(0);
  });
});

describe("탄약 보충(D-509)", () => {
  it("남은 탄 = 새 최대, 보충마다 최대가 감소‰만큼(올림) 준다, 파괴 문턱 이하면 파괴, 쓴 탄이 없으면 그대로", () => {
    expect(refillAmmo({ durability: 20, maxDurability: 200 }, 50, 10)).toEqual({
      item: { durability: 190, maxDurability: 190 },
      destroyed: false,
      maxLoss: 10,
      restored: 170,
    });
    expect(refillAmmo({ durability: 0, maxDurability: 11 }, 50, 10)).toEqual({
      item: { durability: 0, maxDurability: 10 },
      destroyed: true,
      maxLoss: 1,
      restored: 0,
    });
    const full = { durability: 30, maxDurability: 30 };
    expect(refillAmmo(full, 50, 10).item).toBe(full);
    // 재료는 수리와 같은 식(보충 전에 셈한다)
    expect(repairMaterialQty(2, 1, 180, 200)).toBe(2);
  });
});

describe("신선도(옛 GDD 4장, D-496 288)", () => {
  it("신선도 = 1 − 숙성 ÷ 유통기한, 보존 배율은 숙성을 늦춘다", () => {
    expect(freshnessPm(0, 72 * HOUR)).toBe(1000);
    expect(freshnessPm(36 * HOUR, 72 * HOUR)).toBe(500);
    expect(freshnessPm(72 * HOUR, 72 * HOUR)).toBe(0);
    const state = { agedMs: 0, atMs: 0 };
    expect(agedAt(state, 10 * HOUR, 1000)).toBe(10 * HOUR);
    expect(agedAt(state, 10 * HOUR, 2000)).toBe(5 * HOUR);
    expect(agedAt(state, 10 * HOUR, 0)).toBe(0);
    expect(spoilAtMs(state, 72 * HOUR, 2000)).toBe(144 * HOUR);
    expect(spoilAtMs(state, 72 * HOUR, 0)).toBeNull();
  });

  it("보관 곳마다 보존 배율(D-512 322): 출발값 = 옛 문서(냉장 ×2·절임 ×3·통조림 ×5·냉동 멈춤), 유닛 ×1, 거래소 멈춤", () => {
    const table = TEST_SOCIETY_COEFFICIENTS.consumables.preservePm;
    expect(STORAGE_PLACES.map((place) => preservePmOf(place, table))).toEqual([
      1000, 1000, 2000, 3000, 5000, 0, 0,
    ]);
    // 유통기한 72시간 생선: 냉장 144시간, 통조림 360시간, 냉동·거래소 안 썩는다
    const state = { agedMs: 0, atMs: 0 };
    expect(spoilAtMs(state, 72 * HOUR, preservePmOf("fridge", table))).toBe(144 * HOUR);
    expect(spoilAtMs(state, 72 * HOUR, preservePmOf("can", table))).toBe(360 * HOUR);
    expect(spoilAtMs(state, 72 * HOUR, preservePmOf("freezer", table))).toBeNull();
    expect(spoilAtMs(state, 72 * HOUR, preservePmOf("exchange", table))).toBeNull();
    // 음수 값은 멈춤으로 친다
    expect(preservePmOf("unit", { ...table, unit: -5 })).toBe(0);
    // 자리 기본값: 음수(−유닛) = 유닛이 듦, 양수 = 창고
    expect(storagePlaceOfLocation(-7)).toBe("unit");
    expect(storagePlaceOfLocation(12)).toBe("storage");
  });

  const defs = new Map([
    ["fish", { enabled: true, perish: { shelfLifeMs: 72 * HOUR, spoilsTo: "rotten_fish" } }],
    ["rotten_fish", { enabled: true, perish: { shelfLifeMs: 24 * HOUR, spoilsTo: "compost" } }],
    ["compost", { enabled: true }],
    ["meat", { enabled: true, perish: { shelfLifeMs: HOUR, spoilsTo: "off" } }],
    ["off", { enabled: false }],
  ]);
  const defOf = (id: string) => defs.get(id);

  it("0이 되면 고른 아이템으로, 바뀐 아이템은 바뀐 때부터 숙성(사슬)", () => {
    const lot = { item: "fish", age: { agedMs: 0, atMs: 0 } };
    expect(settleSpoilage(lot, 10 * HOUR, 1000, defOf)).toEqual({
      kind: "same",
      age: { agedMs: 10 * HOUR, atMs: 10 * HOUR },
    });
    expect(settleSpoilage(lot, 80 * HOUR, 1000, defOf)).toEqual({
      kind: "changed",
      item: "rotten_fish",
      age: { agedMs: 8 * HOUR, atMs: 80 * HOUR },
      atMs: 72 * HOUR,
    });
    const twice = settleSpoilage(lot, 100 * HOUR, 1000, defOf);
    expect(twice).toEqual({
      kind: "changed",
      item: "compost",
      age: { agedMs: 4 * HOUR, atMs: 100 * HOUR },
      atMs: 96 * HOUR,
    });
  });

  it("바뀔 아이템이 꺼졌으면 버린다, 신선도 없는 아이템은 그대로", () => {
    expect(settleSpoilage({ item: "meat", age: { agedMs: 0, atMs: 0 } }, 2 * HOUR, 1000, defOf)).toEqual({
      kind: "disposed",
      atMs: HOUR,
    });
    expect(
      settleSpoilage({ item: "compost", age: { agedMs: 0, atMs: 0 } }, 999 * HOUR, 1000, defOf).kind,
    ).toBe("same");
  });
});

describe("자동 물약(D-510)", () => {
  it("문턱(‰) 아래에서만, 모자란 만큼 이상 채우는 것 가운데 가장 작은 것, 없으면 가장 큰 것", () => {
    expect(belowPotionThreshold(299, 1000, 300)).toBe(true);
    expect(belowPotionThreshold(300, 1000, 300)).toBe(false);
    expect(belowPotionThreshold(0, 0, 300)).toBe(false);
    const potions = [
      { id: 1, heal: 100 },
      { id: 2, heal: 400 },
      { id: 3, heal: 400 },
      { id: 4, heal: 0 },
    ];
    expect(pickPotion(350, potions)?.id).toBe(2);
    expect(pickPotion(50, potions)?.id).toBe(1);
    expect(pickPotion(900, potions)?.id).toBe(2);
    expect(pickPotion(10, [{ id: 4, heal: 0 }])).toBeNull();
  });
});

describe("효과 교체(D-501)", () => {
  const base: ItemBuff = { effect: "str_up", value: 10, untilMs: 1000, group: "meal", item: "stew" };

  it("같은 효과: 높으면 바꾸고, 낮거나 같으면 쓰지 않는다", () => {
    const higher = planEffects(
      [base],
      [{ effect: "str_up", value: 12, untilMs: 2000, group: "meal" }],
      "pie",
      0,
      {
        confirm: false,
        auto: false,
      },
    );
    expect(higher.ok && higher.next).toEqual([
      { effect: "str_up", value: 12, untilMs: 2000, group: "meal", item: "pie" },
    ]);
    const lower = planEffects(
      [base],
      [{ effect: "str_up", value: 10, untilMs: 2000, group: "meal" }],
      "pie",
      0,
      {
        confirm: false,
        auto: false,
      },
    );
    expect(lower).toEqual({ ok: false, code: "not_better", effects: ["str_up"] });
  });

  it("같은 묶음 다른 효과: 확인을 묻고, 확인하면 바꾼다. 자동 사용은 바꾸지 않는다", () => {
    const incoming = [{ effect: "int_up", value: 6, untilMs: 2000, group: "meal" }];
    expect(planEffects([base], incoming, "soup", 0, { confirm: false, auto: false })).toEqual({
      ok: false,
      code: "confirm_replace",
      effects: ["str_up"],
    });
    const confirmed = planEffects([base], incoming, "soup", 0, { confirm: true, auto: false });
    expect(confirmed.ok && confirmed.replaced).toEqual(["str_up"]);
    expect(confirmed.ok && confirmed.next.map((entry) => entry.effect)).toEqual(["int_up"]);
    expect(planEffects([base], incoming, "soup", 0, { confirm: true, auto: true }).ok).toBe(false);
  });

  it("끝난 효과는 없는 것으로 친다, 묶음 없는 효과는 따로 걸린다", () => {
    const later = planEffects(
      [base],
      [{ effect: "int_up", value: 1, untilMs: 5000, group: "meal" }],
      "soup",
      1000,
      {
        confirm: false,
        auto: false,
      },
    );
    expect(later.ok).toBe(true);
    const free = planEffects([base], [{ effect: "guard", value: 3, untilMs: 900, group: null }], "tonic", 0, {
      confirm: false,
      auto: false,
    });
    expect(free.ok && free.next.map((entry) => entry.effect)).toEqual(["guard", "str_up"]);
  });
});
