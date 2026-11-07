// 전투 중 물건 쓰기(287)·전투 밖 주기 회복(D-514 346) 시험(DB 없음) — 보유 물건 서비스 battleKit·applyBattleUse·use.
// docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, D-514·287)". 쓰기 대기열은 가짜다.
import type { Primaries } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { hotPerMinute } from "./battleKit.ts";
import { TEST_HOLDING_RULES } from "./rules.ts";
import { type HoldingService, type HoldingVitals, createHoldingService } from "./service.ts";
import { carriedBy } from "./state.ts";
import { TEST_HOLDING_CONTENT } from "./testContent.ts";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const OWNER = 7;
const UNIT = 40;

function fakeWriter(): WorldWriter {
  const noop = (_table: WorldTable, _row: Row): void => undefined;
  return {
    upsert: noop,
    remove: noop,
    append: noop,
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
}

const flat = (value: number): Primaries => ({
  str: value,
  dex: value,
  agi: value,
  vit: value,
  int: value,
  wis: value,
});

function setup(vitals?: HoldingVitals) {
  return createHoldingService({
    loaded: { holdings: [], effects: [], cooldowns: [], maxId: 100 },
    writer: fakeWriter(),
    content: () => TEST_HOLDING_CONTENT,
    rules: () => TEST_HOLDING_RULES,
    world: {
      unitOwner: (unitId) => (unitId === UNIT ? OWNER : undefined),
      unitKind: (unitId) => (unitId === UNIT ? "cyborg" : undefined),
      unitPrimaries: () => flat(10),
      vitals,
    },
  });
}

const grant = (service: HoldingService, item: string, quantity = 1): number => {
  const result = service.acquire({
    ownerId: OWNER,
    item,
    quantity,
    location: carriedBy(UNIT),
    source: "dev_grant",
    atMs: T0,
    seed: 1,
  });
  return result.ok ? (result.holdings[0] ?? 0) : 0;
};

describe("전투에 가지고 들어가는 것(287)", () => {
  it("든 물약 = 판정 사양(양 = 굴림 가운데 값, 주기 줄은 over), 문턱·쿨은 설정 칸", () => {
    const service = setup();
    const potion = grant(service, "hold_potion", 3);
    const salve = grant(service, "hold_regen_salve", 2);
    grant(service, "hold_stew", 1);
    const kit = service.battleKit(UNIT, 500, T0);
    expect(kit.ammo).toBeUndefined();
    expect(kit.potions).toEqual({
      items: [
        { id: potion, count: 3, instant: 100 },
        {
          id: salve,
          count: 2,
          instant: 0,
          over: [{ effect: "hold_regen", amount: 5, tickMs: 1000, durationMs: 10_000 }],
        },
      ],
      thresholdPm: TEST_HOLDING_RULES.consumables.potionHpThresholdPm,
      cooldownMs: TEST_HOLDING_RULES.consumables.potionCooldownMs,
      readyMs: 0,
    });
    // 문턱을 넘기면 그 값
    expect(service.battleKit(UNIT, 500, T0, 700).potions?.thresholdPm).toBe(700);
  });

  it("탄약을 쓰는 무기를 들면 입은 그 종류 탄약의 내구도, 없으면 0. 탄을 쓰지 않는 무기는 칸 없음", () => {
    const service = setup();
    const bow = grant(service, "hold_bow");
    service.equip(OWNER, bow, 0);
    expect(service.battleKit(UNIT, 100, T0).ammo).toBe(0);
    const quiver = grant(service, "hold_quiver_b");
    service.equip(OWNER, quiver, 1);
    expect(service.battleKit(UNIT, 100, T0).ammo).toBe(50);
    service.unequip(OWNER, bow);
    expect(service.battleKit(UNIT, 100, T0).ammo).toBeUndefined();
  });

  it("전투 끝: 마신 물약을 빼고 물약 쿨을 그 끝까지, 쏜 탄을 내구도에서 뺀다", () => {
    const service = setup();
    const potion = grant(service, "hold_potion", 3);
    const bow = grant(service, "hold_bow");
    const quiver = grant(service, "hold_quiver_b");
    service.equip(OWNER, bow, 0);
    service.equip(OWNER, quiver, 1);
    expect(
      service.applyBattleUse(UNIT, {
        shots: 12,
        potions: [{ id: potion, used: 2 }],
        potionReadyAtMs: T0 + 45_000,
      }),
    ).toBe(2);
    const listed = service.list(OWNER, T0);
    expect(listed.holdings.find((h) => h.id === potion)?.quantity).toBe(1);
    expect(listed.holdings.find((h) => h.id === quiver)?.durability).toBe(38);
    expect(service.cooldownUntil(UNIT, "potion")).toBe(T0 + 45_000);
    // 다음 전투는 남은 쿨만큼 늦게 마신다
    expect(service.battleKit(UNIT, 100, T0 + 15_000).potions?.readyMs).toBe(30_000);
    // 다 마시면 칸을 지운다(남은 수보다 많이 적혀도 남은 만큼만)
    expect(service.applyBattleUse(UNIT, { potions: [{ id: potion, used: 5 }] })).toBe(1);
    expect(service.list(OWNER, T0).holdings.some((h) => h.id === potion)).toBe(false);
  });
});

describe("전투 밖 주기 회복(D-514 346)", () => {
  it("분당 양 = ⌈(⌊지속 ÷ 주기⌋ × 양) ÷ 분 수⌉, 분 수 = max(1, ⌈지속 ÷ 1분⌉)", () => {
    expect(hotPerMinute(5, 1000, 10_000)).toEqual({ perMinute: 50, minutes: 1 });
    expect(hotPerMinute(10, 1000, 150_000)).toEqual({ perMinute: 500, minutes: 3 });
    expect(hotPerMinute(0, 1000, 10_000)).toEqual({ perMinute: 0, minutes: 0 });
  });

  it("쓰면 걸린 효과(값 = 분당 양, 끝 = 생명 수치 분 경계 + 분 수), HP가 가득이면 쓰지 않는다", () => {
    let hp = { current: 10, max: 100 };
    const touched: number[] = [];
    const vitals: HoldingVitals = {
      hp: () => hp,
      heal: () => 0,
      touch: (_unit, nowMs) => {
        touched.push(nowMs);
        return nowMs - 20_000;
      },
    };
    const service = setup(vitals);
    const salve = grant(service, "hold_regen_salve", 2);
    const used = service.use(OWNER, salve, { confirm: false, nowMs: T0, seed: 1 });
    if (!used.ok) throw new Error("use");
    // 굴린 틱 양(±오차) × 10틱 = 1분에 줄 양
    const perMinute = used.effects?.[0]?.amount ?? 0;
    expect(perMinute % 10).toBe(0);
    expect(perMinute).toBeGreaterThan(0);
    expect(service.effectsOn(UNIT, T0)).toEqual([
      expect.objectContaining({ effect: "hold_regen", value: perMinute, untilMs: T0 - 20_000 + MIN }),
    ]);
    expect(touched).toEqual([T0]);
    // HP 가득이면 낭비 막기
    hp = { current: 100, max: 100 };
    expect(service.use(OWNER, salve, { confirm: false, nowMs: T0 + 10 * MIN, seed: 1 })).toEqual({
      ok: false,
      code: "not_better",
    });
  });

  it("생명 수치가 없는 세계에서는 그대로 전투 중에만", () => {
    const service = setup();
    const salve = grant(service, "hold_regen_salve");
    expect(service.use(OWNER, salve, { confirm: false, nowMs: T0, seed: 1 })).toEqual({
      ok: false,
      code: "battle_only",
    });
  });
});
