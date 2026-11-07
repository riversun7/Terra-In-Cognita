// 생명 수치 회복 시험(DB 없음) — 기획 D-514: HP·아머도 분 단위로 차고, 쓰러진 유닛도 차되 부상 단계만큼 느리며, 전투 밖 주기 회복 물건은
// 분마다 더하고, 병원 치료는 HP를 가득 채운다. docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-07, D-514·287)"
import { describe, expect, it } from "vitest";
import { testEncounter, testFighter } from "../world/testSupport.ts";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { NO_MODIFIERS, type VitalsModifiers, regenPhases } from "./phases.ts";
import { type VitalsWorld, bodyOfSpec, createVitalsService } from "./service.ts";
import type { VitalsBody } from "./state.ts";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const UNIT = 40;

const noop = (_table: WorldTable, _row: Row): void => undefined;

function fakeWriter(): WorldWriter {
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

/** 새 사이보그 몸(HP 92·HP 회복 분당 132 — 옛 식 초당 2.2, 아머 15 × 100‰ = 1, 쉴드 재생 10) */
const BODY: VitalsBody = { max: { hp: 92, armor: 15, shield: 48 }, regen: { hp: 132, armor: 1, shield: 10 } };
/** 큰 몸(HP 회복이 최대보다 작아 몇 분 걸린다) */
const BIG: VitalsBody = {
  max: { hp: 1000, armor: 100, shield: 0 },
  regen: { hp: 100, armor: 10, shield: 0 },
};

function setup(body: VitalsBody, mods: () => VitalsModifiers = () => NO_MODIFIERS) {
  const world: VitalsWorld = {
    exists: (unitId) => unitId === UNIT,
    bodyOf: () => body,
    defaultBody: () => body,
    modifiersOf: () => mods(),
  };
  const service = createVitalsService({ loaded: [], writer: fakeWriter(), world });
  return service;
}

/** 전투가 끝나 HP·아머가 0으로 남은 유닛 */
function downed(service: ReturnType<typeof setup>): void {
  service.applyBattle(
    { ...testEncounter(), units: [] },
    [{ unit: UNIT, side: 1, outcome: "returned", injured: true, hp: 0, armor: 0, shield: 0 }],
    T0,
  );
}

describe("HP·아머 회복(D-514)", () => {
  it("전투 사양의 몸 자료: HP 회복·아머 회복이 들어간다", () => {
    expect(
      bodyOfSpec({ ...testFighter(1, 1, 1, 0, 0), hpRegen: 50, armorRegen: 7, shieldRegen: 3 }).regen,
    ).toEqual({
      hp: 50,
      armor: 7,
      shield: 3,
    });
  });

  it("쓰러진(HP 0) 유닛도 분마다 HP·아머가 찬다", () => {
    const service = setup(BIG);
    downed(service);
    expect(service.read(UNIT, T0 + 3 * MIN)?.values).toEqual({ hp: 300, armor: 30, shield: 0 });
    expect(service.read(UNIT, T0 + 20 * MIN)?.values).toEqual({ hp: 1000, armor: 100, shield: 0 });
    // 새 사이보그 몸은 1분이면 HP가 가득(분당 132 > 92)
    const small = setup(BODY);
    downed(small);
    expect(small.read(UNIT, T0 + MIN)?.values.hp).toBe(92);
  });

  it("부상 중에는 나을 때까지 HP 회복이 느리다(단계 ‰), 나은 뒤에는 보통", () => {
    const injury = { stage: 2, untilMs: T0 + 4 * MIN, regenPm: 250 };
    const service = setup(BIG, () => ({ injury, hot: [] }));
    downed(service);
    // 4분 동안 25 × 4 = 100, 그 뒤 2분은 100 × 2
    expect(service.read(UNIT, T0 + 4 * MIN)?.values.hp).toBe(100);
    expect(service.read(UNIT, T0 + 6 * MIN)?.values.hp).toBe(300);
    // 아머·쉴드는 느려지지 않는다
    expect(service.read(UNIT, T0 + 4 * MIN)?.values.armor).toBe(40);
    // 읽기는 회복 구간을 싣는다(기기가 같은 함수로 셈한다)
    expect(service.read(UNIT, T0 + MIN)?.phases).toEqual([
      { until: T0 + 4 * MIN, regen: { hp: 25, armor: 10, shield: 0 } },
    ]);
  });

  it("회복 구간: 부상 끝·물건 끝마다 경계, 물건은 끝날 때까지 더한다", () => {
    const phases = regenPhases(
      { hp: 100, armor: 0, shield: 0 },
      { injury: { stage: 1, untilMs: 5 * MIN, regenPm: 500 }, hot: [{ untilMs: 3 * MIN, hpPerMinute: 40 }] },
      0,
    );
    expect(phases).toEqual([
      { until: 3 * MIN, regen: { hp: 90, armor: 0, shield: 0 } },
      { until: 5 * MIN, regen: { hp: 50, armor: 0, shield: 0 } },
    ]);
    expect(regenPhases({ hp: 100, armor: 0, shield: 0 }, NO_MODIFIERS, 0)).toEqual([]);
    // 지난 경계는 뺀다
    expect(
      regenPhases({ hp: 100, armor: 0, shield: 0 }, { hot: [{ untilMs: MIN, hpPerMinute: 5 }] }, MIN),
    ).toEqual([]);
  });

  it("전투 밖 주기 회복(346): 걸린 동안 분마다 더한다", () => {
    let hot: VitalsModifiers["hot"] = [];
    const service = setup(BIG, () => ({ hot }));
    downed(service);
    // 2분 뒤 물건을 쓴다: 그 분 경계로 옮기고 3분 동안 분당 50 더함
    const from = service.touch(UNIT, T0 + 2 * MIN + 30_000);
    expect(from).toBe(T0 + 2 * MIN);
    hot = [{ untilMs: from + 3 * MIN, hpPerMinute: 50 }];
    expect(service.read(UNIT, T0 + 5 * MIN)?.values.hp).toBe(200 + 3 * 150);
    expect(service.read(UNIT, T0 + 6 * MIN)?.values.hp).toBe(200 + 3 * 150 + 100);
  });

  it("병원 치료는 HP를 가득 채운다(옛 병원 코드), 가득이면 0", () => {
    const service = setup(BIG);
    downed(service);
    expect(service.treat(UNIT, T0 + MIN)).toBe(900);
    expect(service.read(UNIT, T0 + MIN)?.values.hp).toBe(1000);
    expect(service.treat(UNIT, T0 + 2 * MIN)).toBe(0);
  });
});
