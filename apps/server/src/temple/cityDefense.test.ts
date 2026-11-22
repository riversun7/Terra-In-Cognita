// 도시 방어 시험(기획 답 452 다·456 가, docs/adr/2026-11-07-temple-religion.md "바뀜 (기획 답 451~459)") — 비활성 빼기, 수호신을 수비 편에
// 넣기(빈 칸·새 파티·공격 편 주인 것 빼기·이미 든 유닛 빼기), 방어 버프(방어 버프 수호신마다 더함·수비 편에만)
import {
  type BattleInit,
  type CombatUnitSpec,
  OLD_TEMPLE_COEFFICIENTS,
  TEST_COMBAT_COEFFICIENTS,
  UNARMED,
  specFromStats,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { SpecPlace } from "../roster/unitBody.ts";
import { GUARDIAN_DEFENSE_EFFECT, defendCity, guardianBase, withoutInactive } from "./cityDefense.ts";
import type { GuardianRow } from "./rows.ts";

const SIZE = 16;

/** 시험 유닛 사양(1차 스탯 모두 10) */
function unit(place: SpecPlace): CombatUnitSpec {
  return specFromStats(
    {
      ...place,
      stats: {},
      weapon: UNARMED,
      primaries: { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 },
      level: 1,
    },
    TEST_COMBAT_COEFFICIENTS,
  );
}

const place = (id: number, side: number, party: number, x: number, y: number): SpecPlace => ({
  id,
  side,
  party,
  x,
  y,
  moveIntervalMs: 1000,
  buildingMulPm: 2000,
});

/** 공격 편(주인 7) 유닛 하나, 수비 편(주인 3) 유닛 둘, 가운데 넥서스 */
function battle(): BattleInit {
  const cells = SIZE * SIZE;
  return {
    id: 5,
    kind: "siege",
    seed: 1,
    map: {
      size: SIZE,
      passable: new Uint8Array(cells).fill(1),
      cover: new Uint8Array(cells),
      height: new Int32Array(cells),
      buildings: [{ id: 1, cells: [7 * SIZE + 7], durability: 100, nexus: true }],
    },
    sides: [
      { id: 1, faction: 7, defender: false, edge: 3 },
      { id: 2, faction: 3, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 101, side: 2, retreatHpPct: 0 },
      { id: 102, side: 2, retreatHpPct: 0 },
    ],
    units: [unit(place(10, 1, 1, 1, 8)), unit(place(20, 2, 101, 6, 8)), unit(place(21, 2, 102, 6, 9))],
  };
}

const guardian = (unitId: number, ownerId: number, buff: GuardianRow["buff"]): GuardianRow => ({
  unitId,
  ownerId,
  cityId: 4,
  templeId: 99,
  level: 3,
  rebirths: 1,
  stats: [12, 11, 10, 14, 9, 8],
  elements: null,
  faith: 100,
  deifiedAtMs: 0,
  buff,
});

const C = { ...OLD_TEMPLE_COEFFICIENTS, guardianDefensePm: 100 };

/** 유닛에 걸린 수호신 방어 버프(‰, 없으면 0) */
const defense = (spec: CombatUnitSpec): number =>
  spec.startEffects?.find((effect) => effect.id === GUARDIAN_DEFENSE_EFFECT)?.value ?? 0;

describe("도시 방어", () => {
  it("비활성 유닛은 시작 자료에서 빠지고 빈 파티도 빠진다(없으면 같은 객체)", () => {
    const init = battle();
    expect(withoutInactive(init, () => false)).toBe(init);
    const out = withoutInactive(init, (id) => id === 21);
    expect(out.units.map((u) => u.id)).toEqual([10, 20]);
    expect(out.parties.map((p) => p.id)).toEqual([1, 101]);
  });

  it("그 도시 수호신을 수비 편 새 파티로 빈 칸에 세우고, 방어 버프 수만큼 수비 편에만 방어율을 건다", () => {
    const built: { id: number; party: number; side: number; x: number; y: number }[] = [];
    const out = defendCity(battle(), {
      guardians: [guardian(30, 3, "defense"), guardian(31, 5, "production"), guardian(32, 7, "defense")],
      c: C,
      canFight: () => true,
      build: (row, at) => {
        built.push({ id: row.unitId, party: at.party, side: at.side, x: at.x, y: at.y });
        return unit(at);
      },
    });
    // 공격 편 주인(7)의 수호신 32는 싸우지도 버프를 주지도 않는다
    expect(built.map((b) => b.id)).toEqual([30, 31]);
    expect(built.every((b) => b.side === 2 && b.party === 103)).toBe(true);
    // 수비 유닛(6, 8) 곁의 빈 칸(유닛·넥서스 칸이 아님)
    const taken = new Set(battle().units.map((u) => `${u.x},${u.y}`));
    for (const b of built) expect(taken.has(`${b.x},${b.y}`)).toBe(false);
    expect(new Set(built.map((b) => `${b.x},${b.y}`)).size).toBe(2);
    expect(out.parties.at(-1)).toEqual({ id: 103, side: 2, retreatHpPct: 0 });
    // 방어 버프 수호신 하나(30)만 든다 → 100‰
    for (const spec of out.units) expect(defense(spec)).toBe(spec.side === 2 ? 100 : 0);
    expect(out.units.find((u) => u.id === 30)?.startEffects?.[0]).toMatchObject({
      kind: "buff",
      stat: "defense_rate",
      value: 100,
    });
  });

  it("싸울 수 없는 수호신(부상·없는 유닛)·이미 든 유닛은 넣지 않고 버프만 든다. 수비 편이 없으면 그대로", () => {
    const init = battle();
    const out = defendCity(init, {
      guardians: [guardian(20, 3, "defense"), guardian(33, 3, "defense")],
      c: C,
      canFight: (id) => id !== 33,
      build: (_row, at) => unit(at),
    });
    expect(out.units.map((u) => u.id)).toEqual([10, 20, 21]);
    expect(out.units.filter((u) => u.side === 2).every((u) => u.startEffects?.[0]?.value === 200)).toBe(true);
    const noDefender = { ...init, sides: init.sides.map((side) => ({ ...side, defender: false })) };
    expect(
      defendCity(noDefender, {
        guardians: [guardian(30, 3, "defense")],
        c: C,
        canFight: () => true,
        build: (_r, at) => unit(at),
      }),
    ).toBe(noDefender);
  });

  it("수호신 몸 바탕 = 신격화할 때의 스탯·레벨·환생·속성(팩 unit_kinds human — 수호신은 휴먼의 상태, D-589, 성장 없음)", () => {
    expect(guardianBase(guardian(30, 3, "defense"))).toEqual({
      kind: "stats",
      unitKind: "human",
      primaries: { str: 12, dex: 11, agi: 10, vit: 14, int: 9, wis: 8 },
      level: 3,
      rebirths: 1,
      elements: null,
    });
  });
});
