// 생명 수치 서비스 시험(DB 없음) — 기획 D-512(HP·아머·쉴드는 전투 뒤에도 남고 분 단위로 회복), D-509(회복 물약은 전투 밖에서도),
// docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)". 쓰기 대기열은 가짜(바뀜만 모은다).
import type { Primaries, UnitResult } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { TEST_HOLDING_RULES } from "../holdings/rules.ts";
import { createHoldingService } from "../holdings/service.ts";
import { carriedBy } from "../holdings/state.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { testEncounter } from "../world/testSupport.ts";
import { type VitalsWorld, bodyOfSpec, createVitalsService } from "./service.ts";
import type { VitalsBody, VitalsRecord } from "./state.ts";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const CYBORG = 40;
const HUMAN = 41;
const CREATURE = 1_900_000_001;
const OWNER = 7;

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

/** 사이보그 몸 자료(새 사이보그 1차 10: HP 92·아머 15·쉴드 48·쉴드 재생 분당 10, 가중치 표 TEST_STAT_TABLE과 같은 모양) */
const CYBORG_BODY: VitalsBody = {
  max: { hp: 92, armor: 15, shield: 48 },
  regen: { hp: 0, armor: 0, shield: 10 },
};
const DEFAULT_BODY: VitalsBody = {
  max: { hp: 92, armor: 15, shield: 48 },
  regen: { hp: 0, armor: 0, shield: 10 },
};

function setup(loaded: readonly VitalsRecord[] = [], units = new Set([CYBORG, HUMAN])) {
  const { writer, ops } = fakeWriter();
  const world: VitalsWorld = {
    exists: (unitId) => units.has(unitId),
    bodyOf: (unitId) => (unitId === CYBORG ? CYBORG_BODY : undefined),
    defaultBody: () => DEFAULT_BODY,
  };
  const service = createVitalsService({ loaded, writer, world });
  return { service, ops, units };
}

const vitalsOps = (ops: ReturnType<typeof fakeWriter>["ops"]) =>
  ops.filter((entry) => entry.table === "vitals");

describe("저장과 분 단위 회복(D-512)", () => {
  it("줄이 없으면 가득(사이보그 = 지금 몸 자료, 그 밖 = 화면 기본 몸 자료)", () => {
    const { service } = setup();
    expect(service.read(CYBORG, T0)).toEqual({ ...CYBORG_BODY, values: CYBORG_BODY.max, at: T0 });
    expect(service.read(HUMAN, T0)?.values).toEqual(DEFAULT_BODY.max);
    expect(service.size).toBe(0);
  });

  it("쉴드는 쉴드 재생만큼 분마다 차고, HP·아머는 회복 규칙이 없어 그대로다(지금 몸 자료의 최대·회복으로 셈)", () => {
    const { service } = setup([
      {
        unitId: CYBORG,
        snapshot: {
          values: { hp: 30, armor: 2, shield: 5 },
          // 줄에 둔 몸 자료는 옛 값이다: 사이보그는 지금 몸 자료(쉴드 재생 10)로 센다
          max: { hp: 50, armor: 10, shield: 20 },
          regen: { hp: 0, armor: 0, shield: 1 },
          at: T0,
        },
      },
    ]);
    const later = service.read(CYBORG, T0 + 2 * MIN + 59_999);
    expect(later?.values).toEqual({ hp: 30, armor: 2, shield: 25 });
    expect(later?.at).toBe(T0 + 2 * MIN);
    expect(service.read(CYBORG, T0 + 10 * MIN)?.values.shield).toBe(48);
    expect(service.read(CYBORG, T0 + 10_000 * MIN)?.values.hp).toBe(30);
  });

  it("지금 몸 자료를 모르는 유닛(NPC 휴먼)은 줄에 둔 최대·회복으로 센다", () => {
    const { service } = setup([
      {
        unitId: HUMAN,
        snapshot: {
          values: { hp: 120, armor: 0, shield: 0 },
          max: { hp: 400, armor: 40, shield: 30 },
          regen: { hp: 0, armor: 0, shield: 6 },
          at: T0,
        },
      },
    ]);
    expect(service.read(HUMAN, T0 + 3 * MIN)?.values).toEqual({ hp: 120, armor: 0, shield: 18 });
    expect(service.read(HUMAN, T0 + 3 * MIN)?.max.hp).toBe(400);
  });

  it("HP를 채운다(flat·최대의 ‰), 최대에서 멈추고, 가득이 되면 줄을 지운다", () => {
    const { service, ops } = setup([
      {
        unitId: CYBORG,
        snapshot: { ...CYBORG_BODY, values: { hp: 10, armor: 15, shield: 48 }, at: T0 },
      },
    ]);
    expect(service.heal(CYBORG, { mode: "flat", value: 30 }, T0 + 30_000)).toBe(30);
    expect(service.read(CYBORG, T0 + 30_000)?.values.hp).toBe(40);
    // 덜 찬 분은 남는다(시각은 분 경계 그대로)
    expect(vitalsOps(ops).at(-1)).toMatchObject({
      op: "upsert",
      row: { unit_id: CYBORG, hp: 40, updated_at_ms: T0 },
    });
    // 500‰ of 92 = 46 → 86
    expect(service.heal(CYBORG, { mode: "permille", value: 500 }, T0 + MIN)).toBe(46);
    expect(service.heal(CYBORG, { mode: "flat", value: 1000 }, T0 + MIN)).toBe(6);
    expect(vitalsOps(ops).at(-1)).toEqual({ op: "remove", table: "vitals", row: { unit_id: CYBORG } });
    expect(service.size).toBe(0);
    // 가득이면 차지 않고 쓰지도 않는다
    const before = ops.length;
    expect(service.heal(CYBORG, { mode: "flat", value: 5 }, T0 + MIN)).toBe(0);
    expect(ops.length).toBe(before);
  });

  it("세계에 없는 유닛의 줄과 다 찬 줄을 지운다", () => {
    const { service, ops, units } = setup([
      { unitId: CYBORG, snapshot: { ...CYBORG_BODY, values: { hp: 92, armor: 15, shield: 40 }, at: T0 } },
      { unitId: HUMAN, snapshot: { ...DEFAULT_BODY, values: { hp: 1, armor: 0, shield: 0 }, at: T0 } },
    ]);
    expect(service.sweep(T0)).toBe(0);
    units.delete(HUMAN);
    // 사이보그 쉴드 40 + 분당 10 → 1분 뒤 가득
    expect(service.sweep(T0 + MIN)).toBe(2);
    expect(vitalsOps(ops).map((entry) => entry.op)).toEqual(["remove", "remove"]);
  });
});

/** 사이보그·NPC 휴먼(편 1)과 크리쳐 둘(편 2, 세계에 없음)이 든 전투 자료 */
function battle() {
  const init = testEncounter([CYBORG, HUMAN, CREATURE, CREATURE + 1]);
  return {
    ...init,
    units: init.units.map((spec) =>
      spec.id === HUMAN ? { ...spec, armorHp: 40, shieldHp: 30, shieldRegen: 6 } : spec,
    ),
  };
}

/** 전투 결과 한 줄(끝 값) */
function result(unit: number, side: number, hp: number, armor: number, shield: number): UnitResult {
  return { unit, side, outcome: "stays", injured: hp <= 0, hp, armor, shield };
}

/** 1차 스탯 모두 같은 값 */
function flat(value: number): Primaries {
  return { str: value, dex: value, agi: value, vit: value, int: value, wis: value };
}

describe("전투 시작·끝(D-512)", () => {
  it("줄이 있는 세계 유닛만 남은 값으로 시작한다(전투 사양 최대로 자름), 바뀐 것이 없으면 같은 자료", () => {
    const { service } = setup([
      {
        unitId: HUMAN,
        snapshot: {
          values: { hp: 20, armor: 0, shield: 3 },
          max: { hp: 400, armor: 40, shield: 30 },
          regen: { hp: 0, armor: 0, shield: 6 },
          at: T0,
        },
      },
    ]);
    const init = battle();
    const started = service.battleStart(init, T0 + 2 * MIN);
    const human = started.units.find((unit) => unit.id === HUMAN);
    const humanSpec = init.units.find((unit) => unit.id === HUMAN);
    expect(human?.start).toEqual({
      hp: Math.min(20, humanSpec?.maxHp ?? 0),
      armor: 0,
      shield: Math.min(15, humanSpec?.shieldHp ?? 0),
    });
    expect(started.units.find((unit) => unit.id === CYBORG)?.start).toBeUndefined();
    expect(started.units.find((unit) => unit.id === CREATURE)?.start).toBeUndefined();
    const { service: empty } = setup();
    expect(empty.battleStart(init, T0)).toBe(init);
  });

  it("끝 값을 저장한다: 사이보그는 지금 몸 자료, NPC 휴먼은 전투 사양, 크리쳐는 건너뜀, 가득은 지움", () => {
    const { service, ops } = setup([
      { unitId: CYBORG, snapshot: { ...CYBORG_BODY, values: { hp: 50, armor: 15, shield: 48 }, at: T0 } },
    ]);
    const init = battle();
    const humanSpec = init.units.find((unit) => unit.id === HUMAN);
    if (!humanSpec) throw new Error("human spec");
    const atMs = T0 + 5 * MIN;
    const written = service.applyBattle(
      init,
      [result(CYBORG, 1, 999, 999, 999), result(HUMAN, 1, 0, 0, 1), result(CREATURE, 2, 3, 0, 0)],
      atMs,
    );
    expect(written).toBe(2);
    // 사이보그: 끝 값이 몸 자료 최대 이상 → 가득 → 줄을 지운다
    expect(service.read(CYBORG, atMs)?.values).toEqual(CYBORG_BODY.max);
    expect(vitalsOps(ops)[0]).toEqual({ op: "remove", table: "vitals", row: { unit_id: CYBORG } });
    // NPC 휴먼: 전투 사양의 몸 자료로 저장, 끝 시각부터 쉴드 재생
    const body = bodyOfSpec(humanSpec);
    expect(service.read(HUMAN, atMs)).toEqual({ ...body, values: { hp: 0, armor: 0, shield: 1 }, at: atMs });
    expect(vitalsOps(ops)[1]).toMatchObject({
      op: "upsert",
      row: { unit_id: HUMAN, hp: 0, updated_at_ms: atMs },
    });
    expect(service.read(CREATURE, atMs)).toEqual({ ...DEFAULT_BODY, values: DEFAULT_BODY.max, at: atMs });
    expect(service.size).toBe(1);
    // 다음 전투: HP 0이면 쓰러진 채 들어온다(start.hp 0)
    expect(service.battleStart(init, atMs).units.find((unit) => unit.id === HUMAN)?.start?.hp).toBe(0);
  });
});

/** 생명 수치 고리를 단 보유 물건 서비스(사이보그 HP를 hp로 둔 채) */
function holdingsWith(hp: number) {
  const vitals = setup([
    { unitId: CYBORG, snapshot: { ...CYBORG_BODY, values: { hp, armor: 15, shield: 48 }, at: T0 } },
  ]);
  const holdingWriter = fakeWriter();
  const holdings = createHoldingService({
    loaded: { holdings: [], effects: [], cooldowns: [], maxId: 100 },
    writer: holdingWriter.writer,
    content: () => TEST_HOLDING_CONTENT,
    rules: () => TEST_HOLDING_RULES,
    world: {
      unitOwner: (unitId) => (unitId === CYBORG ? OWNER : undefined),
      unitKind: (unitId) => (unitId === CYBORG ? "cyborg" : undefined),
      unitPrimaries: () => flat(10),
      vitals: {
        hp: (unitId, nowMs) => {
          const read = vitals.service.read(unitId, nowMs);
          return read ? { current: read.values.hp, max: read.max.hp } : undefined;
        },
        heal: (unitId, amount, nowMs) => vitals.service.heal(unitId, amount, nowMs),
      },
    },
  });
  const grant = (item: string, quantity = 1): number => {
    const made = holdings.acquire({
      ownerId: OWNER,
      item,
      quantity,
      location: carriedBy(CYBORG),
      source: "dev_grant",
      atMs: T0,
      seed: 1,
    });
    return made.ok ? (made.holdings[0] ?? 0) : 0;
  };
  return { vitals, holdings, grant, holdingWriter };
}

describe("전투 밖 회복 물약(D-512·D-509)", () => {
  it("전투 밖에서도 HP를 채우고 물건을 하나 쓰며, 물약 쿨(30초, 스태미나 없음)을 건다", () => {
    const { vitals, holdings, grant } = holdingsWith(10);
    const potion = grant("hold_potion", 2);
    const used = holdings.use(OWNER, potion, { confirm: false, nowMs: T0, seed: 3 });
    expect(used.ok).toBe(true);
    const healed = used.ok ? (used.effects[0]?.amount ?? 0) : 0;
    expect(healed).toBeGreaterThan(0);
    expect(vitals.service.read(CYBORG, T0)?.values.hp).toBe(Math.min(92, 10 + healed));
    expect(holdings.list(OWNER, T0).holdings.find((h) => h.id === potion)?.quantity).toBe(1);
    expect(holdings.cooldownUntil(CYBORG, "potion")).toBe(
      T0 + TEST_HOLDING_RULES.consumables.potionCooldownMs,
    );
    // 쿨 중이면 물건도 HP도 그대로
    expect(holdings.use(OWNER, potion, { confirm: false, nowMs: T0 + 1_000, seed: 4 })).toEqual({
      ok: false,
      code: "cooldown",
      readyAt: T0 + TEST_HOLDING_RULES.consumables.potionCooldownMs,
    });
  });

  it("HP가 가득이면 회복만 있는 물약은 쓰지 않는다(낭비 막기), 큰 물약은 최대에서 멈춘다", () => {
    const full = holdingsWith(92);
    const potion = full.grant("hold_potion");
    expect(full.holdings.use(OWNER, potion, { confirm: false, nowMs: T0, seed: 1 })).toEqual({
      ok: false,
      code: "not_better",
    });
    expect(full.holdings.list(OWNER, T0).holdings.find((h) => h.id === potion)?.quantity).toBe(1);
    const low = holdingsWith(80);
    const mega = low.grant("hold_mega_potion");
    expect(low.holdings.use(OWNER, mega, { confirm: false, nowMs: T0, seed: 1 }).ok).toBe(true);
    expect(low.vitals.service.read(CYBORG, T0)?.values.hp).toBe(92);
    // 가득이 되어 줄을 지웠다
    expect(low.vitals.service.size).toBe(0);
  });

  it("버프 물약을 쓴 뒤 회복 물약은 HP가 가득이어도 물약 쿨이 먼저다(인벤토리 화면 시험의 차례)", () => {
    const full = holdingsWith(92);
    const tonic = full.grant("hold_tonic");
    const potion = full.grant("hold_potion");
    expect(full.holdings.use(OWNER, tonic, { confirm: false, nowMs: T0, seed: 1 }).ok).toBe(true);
    expect(full.holdings.use(OWNER, potion, { confirm: false, nowMs: T0 + 2_000, seed: 2 })).toEqual({
      ok: false,
      code: "cooldown",
      readyAt: T0 + TEST_HOLDING_RULES.consumables.potionCooldownMs,
    });
  });
});
