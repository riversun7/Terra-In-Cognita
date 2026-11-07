// 보유 물건 서비스 시험(DB 없음) — docs/adr/2026-11-03-item-holdings.md 3·4절. 쓰기 대기열은 가짜(바뀜만 모은다).
import type { Primaries } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import { type HoldingRules, TEST_HOLDING_RULES } from "./rules.ts";
import { type HoldingService, createHoldingService } from "./service.ts";
import { carriedBy } from "./state.ts";
import { HOUR_MS, TEST_HOLDING_CONTENT, rulesWithWear } from "./testContent.ts";

const T0 = 1_800_000_000_000;
const OWNER = 7;
const OTHER = 8;
const UNIT = 40;
const BOT = 41;

function fakeWriter() {
  const ops: { op: "upsert" | "remove"; table: WorldTable; row: Row }[] = [];
  const writer: WorldWriter = {
    upsert: (table, row) => ops.push({ op: "upsert", table, row }),
    remove: (table, row) => ops.push({ op: "remove", table, row }),
    append: (table, row) => ops.push({ op: "upsert", table, row }),
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  return { writer, ops };
}

const flat = (value: number): Primaries => ({
  str: value,
  dex: value,
  agi: value,
  vit: value,
  int: value,
  wis: value,
});

function setup(options: { vit?: number; rules?: HoldingRules } = {}) {
  const { writer, ops } = fakeWriter();
  const service = createHoldingService({
    loaded: { holdings: [], effects: [], cooldowns: [], maxId: 100 },
    writer,
    content: () => TEST_HOLDING_CONTENT,
    rules: () => options.rules ?? TEST_HOLDING_RULES,
    world: {
      unitOwner: (unitId) => (unitId === UNIT ? OWNER : unitId === BOT ? OTHER : undefined),
      unitKind: (unitId) => (unitId === UNIT ? "cyborg" : unitId === BOT ? "human" : undefined),
      unitPrimaries: () => flat(options.vit ?? 10),
    },
  });
  return { service, ops };
}

const grant = (service: HoldingService, item: string, quantity = 1, atMs = T0, seed = 1) =>
  service.acquire({
    ownerId: OWNER,
    item,
    quantity,
    location: carriedBy(UNIT),
    source: "dev_grant",
    atMs,
    seed,
  });

const ids = (result: ReturnType<HoldingService["acquire"]>): readonly number[] =>
  result.ok ? result.holdings : [];

describe("얻기(굴림, N49 285)", () => {
  it("장비는 하나하나, 스탯을 굴리고 내구도 = 지금 정의의 최대", () => {
    const { service, ops } = setup();
    const made = ids(grant(service, "hold_vest", 2));
    expect(made).toEqual([101, 102]);
    const [first] = service.list(OWNER, T0).holdings;
    expect(first?.quantity).toBe(1);
    expect(first?.durability).toBe(100);
    expect(first?.maxDurability).toBe(100);
    expect(first?.stats.map((entry) => entry.stat)).toEqual(["defense_rate", "armor_hp"]);
    const defense = first?.stats[0]?.value ?? 0;
    expect(defense).toBeGreaterThanOrEqual(30);
    expect(defense).toBeLessThanOrEqual(60);
    expect(first?.scorePm).toBe(Math.floor(((first?.stats[0]?.pm ?? 0) + (first?.stats[1]?.pm ?? 0)) / 2));
    expect(ops.filter((entry) => entry.table === "holdings")).toHaveLength(2);
    // 같은 시드 = 같은 굴림
    const again = setup();
    grant(again.service, "hold_vest", 2);
    expect(again.service.list(OWNER, T0).holdings.map((h) => h.stats)).toEqual(
      service.list(OWNER, T0).holdings.map((h) => h.stats),
    );
  });

  it("꺼진 아이템·없는 아이템은 새로 나오지 않고, 원장 물자는 보유 표에 두지 않는다", () => {
    const { service } = setup();
    expect(grant(service, "hold_off")).toEqual({ ok: false, code: "unknown_item" });
    expect(grant(service, "no_such_item")).toEqual({ ok: false, code: "unknown_item" });
    expect(grant(service, "hold_rotten_fish")).toEqual({ ok: false, code: "not_holdable" });
  });

  it("쌓이는 소모품은 stackMax까지 한 칸, 넘치면 새 칸. 신선도 묶음은 같은 숙성끼리만", () => {
    const { service } = setup();
    grant(service, "hold_stew", 15);
    grant(service, "hold_stew", 10);
    expect(service.list(OWNER, T0).holdings.map((h) => h.quantity)).toEqual([20, 5]);
    grant(service, "hold_fish", 30, T0);
    grant(service, "hold_fish", 10, T0);
    grant(service, "hold_fish", 5, T0 + HOUR_MS);
    const fish = service.list(OWNER, T0 + HOUR_MS).holdings.filter((h) => h.itemId === "hold_fish");
    expect(fish.map((h) => h.quantity)).toEqual([40, 5]);
  });
});

describe("입기·벗기(N49 286)", () => {
  it("칸 종류가 맞아야 입고, 그 칸의 것은 벗는다", () => {
    const { service } = setup();
    const [a = 0, b = 0] = ids(grant(service, "hold_vest", 2));
    // 사이보그 칸 배치: weapon, offhand, head, body(3), accessory(4·5), organ…
    expect(service.equip(OWNER, a, 0)).toEqual({ ok: false, code: "wrong_slot" });
    expect(service.equip(OWNER, a, 3)).toEqual({ ok: true });
    expect(service.equip(OWNER, b, 3)).toEqual({ ok: true });
    expect(service.equippedOn(UNIT).map((h) => h.id)).toEqual([b]);
    expect(service.unequip(OWNER, b)).toEqual({ ok: true });
    expect(service.equippedOn(UNIT)).toEqual([]);
    expect(service.equip(OTHER, a, 3)).toEqual({ ok: false, code: "unknown_holding" });
  });

  it("내구도 0이면 못 입는다", () => {
    const { service } = setup();
    const [a = 0] = ids(grant(service, "hold_vest"));
    service.equip(OWNER, a, 3);
    const always = rulesWithWear({ chancePm: 1000, amount: 100, lossChancePm: 0, lossAmount: 0 });
    const worn = createHoldingService({
      loaded: {
        holdings: service.list(OWNER, T0).holdings.map((h) => ({ ...h })),
        effects: [],
        cooldowns: [],
        maxId: 0,
      },
      writer: fakeWriter().writer,
      content: () => TEST_HOLDING_CONTENT,
      rules: () => always,
      world: { unitOwner: () => OWNER, unitKind: () => "cyborg", unitPrimaries: () => flat(10) },
    });
    expect(worn.applyBattle(5, [{ unit: UNIT, won: true }])).toEqual({ worn: 1, broken: 1 });
    expect(worn.equippedOn(UNIT)).toEqual([]);
    expect(worn.equip(OWNER, a, 3)).toEqual({ ok: false, code: "broken" });
  });
});

describe("전투 닳기(D-496 289, 옛 25%)", () => {
  it("입은 장비만, 같은 전투 시드면 같은 결과, 많이 싸우면 이긴 전투에서 약 25%가 1씩", () => {
    const { service } = setup();
    const made = ids(grant(service, "hold_vest", 1));
    service.equip(OWNER, made[0] ?? 0, 3);
    grant(service, "hold_vest", 1);
    let worn = 0;
    for (let battle = 1; battle <= 200; battle++)
      worn += service.applyBattle(battle, [{ unit: UNIT, won: true }]).worn;
    expect(worn).toBeGreaterThan(30);
    expect(worn).toBeLessThan(70);
    const [equipped, carried] = service.list(OWNER, T0).holdings;
    expect(equipped?.durability).toBe(100 - worn);
    expect(carried?.durability).toBe(100);
  });

  it("탄약 장비는 전투 닳기에서 빠진다(탄 수는 spendAmmo)", () => {
    const { service } = setup();
    const [quiver = 0] = ids(grant(service, "hold_quiver"));
    expect(service.equip(OWNER, quiver, 1)).toEqual({ ok: true });
    const rules = rulesWithWear({ chancePm: 1000, amount: 1, lossChancePm: 1000, lossAmount: 4 });
    const strict = createHoldingService({
      loaded: {
        holdings: service.list(OWNER, T0).holdings.map((h) => ({ ...h })),
        effects: [],
        cooldowns: [],
        maxId: 0,
      },
      writer: fakeWriter().writer,
      content: () => TEST_HOLDING_CONTENT,
      rules: () => rules,
      world: { unitOwner: () => OWNER, unitKind: () => "cyborg", unitPrimaries: () => flat(10) },
    });
    expect(strict.applyBattle(1, [{ unit: UNIT, won: false }])).toEqual({ worn: 0, broken: 0 });
  });
});

describe("탄약 고리(D-497·D-501 294)", () => {
  it("원거리 타격마다 내구도 1, 0이면 벗고 같은 탄약 종류(같은 아이템 먼저)를 입는다", () => {
    const { service } = setup();
    const [first = 0] = ids(grant(service, "hold_quiver"));
    const [spareB = 0] = ids(grant(service, "hold_quiver_b"));
    const [spareA = 0] = ids(grant(service, "hold_quiver"));
    service.equip(OWNER, first, 1);
    expect(service.spendAmmo(UNIT, 2)).toEqual({ spent: 2, replacedBy: null });
    expect(service.spendAmmo(UNIT, 5)).toEqual({ spent: 1, replacedBy: spareA });
    expect(service.equippedOn(UNIT).map((h) => h.id)).toEqual([spareA]);
    service.spendAmmo(UNIT, 3);
    expect(service.equippedOn(UNIT).map((h) => h.id)).toEqual([spareB]);
    expect(service.spendAmmo(BOT, 1)).toEqual({ spent: 0, replacedBy: null });
  });
});

describe("수리 고리(D-5031·F11·F12)", () => {
  it("최대 내구도가 시설 Lv만큼 줄고 내구도 = 새 최대, 10 이하면 파괴(벗김·다시 수리 못 함)", () => {
    const { service } = setup();
    const [a = 0] = ids(grant(service, "hold_vest"));
    service.equip(OWNER, a, 3);
    expect(service.repair(a, 1, 0)).toEqual({ ok: true, destroyed: false, maxLoss: 0, restored: 0 });
    const always = rulesWithWear({ chancePm: 1000, amount: 60, lossChancePm: 0, lossAmount: 0 });
    const shop = createHoldingService({
      loaded: {
        holdings: service.list(OWNER, T0).holdings.map((h) => ({ ...h })),
        effects: [],
        cooldowns: [],
        maxId: 0,
      },
      writer: fakeWriter().writer,
      content: () => TEST_HOLDING_CONTENT,
      rules: () => always,
      world: { unitOwner: () => OWNER, unitKind: () => "cyborg", unitPrimaries: () => flat(10) },
    });
    shop.applyBattle(1, [{ unit: UNIT, won: true }]);
    expect(shop.repair(a, 1, 0)).toEqual({ ok: true, destroyed: false, maxLoss: 30, restored: 30 });
    const [after] = shop.list(OWNER, T0).holdings;
    expect([after?.durability, after?.maxDurability]).toEqual([70, 70]);
    expect(shop.repair(a, 1, 0)).toEqual({ ok: true, destroyed: false, maxLoss: 0, restored: 0 });
    expect(shop.repair(999, 1, 0)).toEqual({ ok: false, code: "unknown_holding" });
  });
});

describe("쓰기(D-501)", () => {
  it("효과량 = 기준 × 적정 비율 ±오차, 수량 −1, 같은 효과는 높은 것만(낮으면 쓰지 않음)", () => {
    const { service } = setup({ vit: 10 });
    const [stew = 0] = ids(grant(service, "hold_stew", 3));
    const used = service.use(OWNER, stew, { confirm: false, nowMs: T0, seed: 9 });
    expect(used.ok).toBe(true);
    const amount = used.ok ? (used.effects[0]?.amount ?? 0) : 0;
    // 기준 40, VIT 10 ÷ 적정 10 = 1000‰, ±250‰ → 30~50
    expect(amount).toBeGreaterThanOrEqual(30);
    expect(amount).toBeLessThanOrEqual(50);
    const listed = service.list(OWNER, T0);
    expect(listed.holdings[0]?.quantity).toBe(2);
    expect(listed.effects).toEqual([
      {
        unitId: UNIT,
        effect: "hold_meal_str",
        value: amount,
        untilMs: T0 + HOUR_MS,
        group: "meal",
        item: "hold_stew",
      },
    ]);
    // 같은 효과: 더 높게 굴리면 바꾸고(물건 −1), 같거나 낮으면 쓰지 않는다(물건이 줄지 않는다)
    let best = amount;
    let refused = 0;
    // 요리 쿨(5분, D-510)이 끝난 뒤마다 다시 해 본다(거절은 쿨을 시작하지 않는다)
    let at = T0 + 300_000;
    for (let seed = 10; seed < 60; seed++) {
      const before = service.list(OWNER, at).holdings.find((h) => h.id === stew)?.quantity ?? 0;
      if (before === 0) break;
      const result = service.use(OWNER, stew, { confirm: false, nowMs: at, seed });
      const after = service.list(OWNER, at).holdings.find((h) => h.id === stew)?.quantity ?? 0;
      if (result.ok) {
        const next = result.effects[0]?.amount ?? 0;
        expect(next).toBeGreaterThan(best);
        expect(after).toBe(before - 1);
        best = next;
        at += 300_000;
      } else {
        expect(result.code).toBe("not_better");
        expect(after).toBe(before);
        refused += 1;
      }
    }
    expect(refused).toBeGreaterThan(0);
    expect(service.list(OWNER, at).effects[0]?.value).toBe(best);
  });

  it("같은 묶음의 다른 효과는 확인을 묻고, confirm이면 바꾼다", () => {
    const { service } = setup();
    const [stew = 0] = ids(grant(service, "hold_stew"));
    const [soup = 0] = ids(grant(service, "hold_soup", 2));
    service.use(OWNER, stew, { confirm: false, nowMs: T0, seed: 1 });
    expect(service.use(OWNER, soup, { confirm: false, nowMs: T0, seed: 1 })).toEqual({
      ok: false,
      code: "confirm_replace",
      effects: ["hold_meal_str"],
    });
    expect(service.list(OWNER, T0).holdings.find((h) => h.id === soup)?.quantity).toBe(2);
    expect(service.use(OWNER, soup, { confirm: true, nowMs: T0, seed: 1 }).ok).toBe(true);
    expect(service.list(OWNER, T0).effects.map((e) => e.effect)).toEqual(["hold_meal_int"]);
    // 다 쓴 칸은 지운다
    expect(service.list(OWNER, T0).holdings.some((h) => h.id === stew)).toBe(false);
  });

  it("회복(전투 중 효과)은 전투 밖에서 쓰지 않고, 장비·남의 물건은 쓸 수 없다", () => {
    const { service } = setup();
    const [potion = 0] = ids(grant(service, "hold_potion"));
    const [vest = 0] = ids(grant(service, "hold_vest"));
    expect(service.use(OWNER, potion, { confirm: false, nowMs: T0, seed: 1 })).toEqual({
      ok: false,
      code: "battle_only",
    });
    expect(service.use(OWNER, vest, { confirm: false, nowMs: T0, seed: 1 })).toEqual({
      ok: false,
      code: "not_usable",
    });
    expect(service.use(OTHER, potion, { confirm: false, nowMs: T0, seed: 1 })).toEqual({
      ok: false,
      code: "unknown_holding",
    });
  });

  it("끝난 효과는 정리된다", () => {
    const { service, ops } = setup();
    const [stew = 0] = ids(grant(service, "hold_stew"));
    service.use(OWNER, stew, { confirm: false, nowMs: T0, seed: 1 });
    // 효과 하나 + 요리 쿨 하나
    expect(service.sweepEffects(T0 + HOUR_MS)).toBe(2);
    expect(ops.some((entry) => entry.op === "remove" && entry.table === "unitEffects")).toBe(true);
    expect(service.list(OWNER, T0 + HOUR_MS).effects).toEqual([]);
  });
});

describe("물약 쿨(D-509)", () => {
  it("물약(약·버프)은 유닛마다 30초 쿨, 요리(식품)는 따로 5분 쿨(D-510), 쿨 중엔 물건이 줄지 않는다", () => {
    const { service, ops } = setup();
    const [tonic = 0] = ids(grant(service, "hold_tonic", 3));
    expect(service.use(OWNER, tonic, { confirm: false, nowMs: T0, seed: 1 }).ok).toBe(true);
    expect(service.cooldownUntil(UNIT, "potion")).toBe(T0 + 30_000);
    expect(ops.some((entry) => entry.table === "unitCooldowns" && entry.op === "upsert")).toBe(true);
    expect(service.use(OWNER, tonic, { confirm: false, nowMs: T0 + 29_999, seed: 2 })).toEqual({
      ok: false,
      code: "cooldown",
      readyAt: T0 + 30_000,
    });
    expect(service.list(OWNER, T0 + 1).holdings.find((h) => h.id === tonic)?.quantity).toBe(2);
    expect(service.list(OWNER, T0 + 1).cooldowns).toEqual([
      { unitId: UNIT, kind: "potion", untilMs: T0 + 30_000 },
    ]);
    // 쿨이 끝나면 다시(같은 효과는 높을 때만이라 더 긴 지속 시각으로 비교되는 값이 같아도 낭비 막기가 거절할 수 있다)
    expect(service.usableNow(UNIT, T0 + 29_999).map((h) => h.id)).toEqual([]);
    expect(service.usableNow(UNIT, T0 + 30_000).map((h) => h.id)).toEqual([tonic]);
    // 요리는 따로 5분(물약 쿨 중에도 먹는다)
    const [stew = 0] = ids(grant(service, "hold_stew", 2));
    expect(service.use(OWNER, stew, { confirm: false, nowMs: T0 + 1, seed: 1 }).ok).toBe(true);
    expect(service.cooldownUntil(UNIT, "food")).toBe(T0 + 1 + 300_000);
    expect(service.use(OWNER, stew, { confirm: false, nowMs: T0 + 2, seed: 1 })).toMatchObject({
      ok: false,
      code: "cooldown",
    });
    // 끝난 쿨은 정리된다
    expect(service.sweepEffects(T0 + 30_000)).toBeGreaterThanOrEqual(1);
    expect(service.cooldownUntil(UNIT, "potion")).toBe(0);
  });

  it("전투 중에만 쓰는 물약은 쿨을 시작하지 않는다(battle_only가 먼저)", () => {
    const { service } = setup();
    const [potion = 0] = ids(grant(service, "hold_potion"));
    expect(service.use(OWNER, potion, { confirm: false, nowMs: T0, seed: 1 })).toEqual({
      ok: false,
      code: "battle_only",
    });
    expect(service.cooldownUntil(UNIT, "potion")).toBe(0);
  });
});

describe("화면 자료(칸 배치·쓰기 쿨 종류, 사이보그 화면 인벤토리)", () => {
  it("유닛 칸 배치는 팩 unit_kinds 차례, 쿨 종류는 식품 중분류 = food·그 밖 = potion·쓸 수 없으면 null", () => {
    const { service } = setup();
    expect(service.unitLayout(UNIT)?.kind).toBe("cyborg");
    expect(service.unitLayout(UNIT)?.slots.slice(0, 4)).toEqual(["weapon", "offhand", "head", "body"]);
    expect(service.unitLayout(BOT)?.kind).toBe("human");
    expect(service.unitLayout(999)).toBeUndefined();
    expect(service.useCooldownOf("hold_tonic")).toBe("potion");
    expect(service.useCooldownOf("hold_stew")).toBe("food");
    expect(service.useCooldownOf("hold_vest")).toBeNull();
    expect(service.useCooldownOf("no_such_item")).toBeNull();
  });

  it("효과가 끝나도 쿨이 남았으면 목록에 쿨이 보인다", () => {
    // 쿨(3시간)이 효과(1시간)보다 긴 규칙: 효과를 정리한 뒤에도 쿨이 남는다
    const long = 3 * HOUR_MS;
    const rules: HoldingRules = {
      ...TEST_HOLDING_RULES,
      consumables: { ...TEST_HOLDING_RULES.consumables, potionCooldownMs: long },
    };
    const { service } = setup({ rules });
    const [tonic = 0] = ids(grant(service, "hold_tonic", 2));
    expect(service.use(OWNER, tonic, { confirm: false, nowMs: T0, seed: 1 }).ok).toBe(true);
    const later = T0 + HOUR_MS + 1;
    expect(service.sweepEffects(later)).toBeGreaterThanOrEqual(1);
    const listed = service.list(OWNER, later);
    expect(listed.effects).toEqual([]);
    expect(listed.cooldowns).toEqual([{ unitId: UNIT, kind: "potion", untilMs: T0 + long }]);
  });
});

describe("자동 물약 고르기(D-510)", () => {
  it("HP가 문턱 아래면 모자란 HP를 가장 덜 넘치게 채우는 물약, 못 채우면 가장 많이 채우는 것, 쿨 중·문턱 위면 없음", () => {
    const { service } = setup();
    const [small = 0] = ids(grant(service, "hold_potion"));
    const [big = 0] = ids(grant(service, "hold_big_potion"));
    const [mega = 0] = ids(grant(service, "hold_mega_potion"));
    grant(service, "hold_stew");
    // 최대 1000, HP 290(문턱 400‰ 아래), 모자람 710 → 800(메가)이 가장 덜 넘침
    expect(service.pickAutoPotion(UNIT, { current: 290, max: 1000 }, T0)).toEqual({
      holding: mega,
      heal: 800,
    });
    // 모자람 350 → 400(큰 물약)
    expect(service.pickAutoPotion(UNIT, { current: 650, max: 1000 }, T0, 700)).toEqual({
      holding: big,
      heal: 400,
    });
    // 모자람 50 → 100(작은 물약)
    expect(service.pickAutoPotion(UNIT, { current: 950, max: 1000 }, T0, 1000)).toEqual({
      holding: small,
      heal: 100,
    });
    // 문턱 위면 없음
    expect(service.pickAutoPotion(UNIT, { current: 290, max: 1000 }, T0, 200)).toBeNull();
    // 물약 쿨 중이면 없음
    const [tonic = 0] = ids(grant(service, "hold_tonic"));
    service.use(OWNER, tonic, { confirm: false, nowMs: T0, seed: 1 });
    expect(service.pickAutoPotion(UNIT, { current: 100, max: 1000 }, T0 + 1)).toBeNull();
  });
});

describe("탄약 보충 고리(D-509)", () => {
  it("남은 탄 = 새 최대, 최대가 설정 칸 ‰만큼 줄고, 재료 = 기본 × 티어 × 쓴 탄 ÷ 최대", () => {
    const { service } = setup();
    const [quiver = 0] = ids(grant(service, "hold_quiver_b"));
    service.equip(OWNER, quiver, 1);
    service.spendAmmo(UNIT, 40);
    // 최대 50, 남은 10 → 감소 ⌈50 × 50‰⌉ = 3, 새 최대 47, 재료 ⌈2 × 1 × 40 ÷ 50⌉ = 2
    expect(service.refillAmmo(quiver, 2)).toEqual({
      ok: true,
      destroyed: false,
      maxLoss: 3,
      restored: 37,
      materials: 2,
    });
    const [after] = service.list(OWNER, T0).holdings;
    expect([after?.durability, after?.maxDurability]).toEqual([47, 47]);
    const [vest = 0] = ids(grant(service, "hold_vest"));
    expect(service.refillAmmo(vest, 2)).toEqual({ ok: false, code: "not_usable" });
  });
});

describe("썩기(D-496 288·N49)", () => {
  it("신선도는 1 − 숙성 ÷ 유통기한, 0이 되면 고른 아이템으로 바뀐다", () => {
    const { service } = setup();
    const [lot = 0] = ids(grant(service, "hold_fish", 10));
    const record = service.list(OWNER, T0 + 36 * HOUR_MS).holdings[0];
    expect(record && service.freshnessOf(record, T0 + 36 * HOUR_MS)).toEqual({
      freshnessPm: 500,
      spoilsAt: T0 + 72 * HOUR_MS,
    });
    expect(service.spoilDue(T0 + 71 * HOUR_MS)).toBe(0);
    expect(service.spoilDue(T0 + 72 * HOUR_MS)).toBe(1);
    const [rotten] = service.list(OWNER, T0 + 72 * HOUR_MS).holdings;
    expect(rotten).toMatchObject({
      id: lot,
      itemId: "hold_rotten_fish",
      quantity: 10,
      age: null,
      source: "spoil",
    });
  });
});
