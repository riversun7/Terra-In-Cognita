// 군단 명령 3단계(기획 D-571): 분대 1~2개 군단 명령(1973)·퇴각 승계(1967)·전개 방식 설정 칸(1963)·손으로 짠 진형(1965)·웨이브 수비 편성(1970)·
// 명성 작위(1961)
import { describe, expect, it } from "vitest";
import { createBattle } from "./battle.ts";
import type { BattleInit, BattleInput, CombatUnitSpec } from "./battleTypes.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { customOffsets, formationSlots } from "./formation.ts";
import { DEFAULT_TACTIC_COEFFICIENTS, planTactic } from "./tactics.ts";
import { openMap, unit } from "./testBattle.ts";
import { waveDefenderPick } from "../simulator/waveBattle.ts";
import { DEFAULT_RENOWN_COEFFICIENTS, titleOfRenown } from "../society/renown.ts";

const SIZE = 32;
const cellOf = (x: number, y: number): number => y * SIZE + x;

/** 편 1(서쪽) = 파티 parties개(파티마다 3명), 편 2(동쪽 멀리) = 파티 11 */
function battle(parties: number, extra: (spec: CombatUnitSpec) => CombatUnitSpec = (s) => s): BattleInit {
  const units: CombatUnitSpec[] = [];
  for (let p = 0; p < parties; p++)
    for (let i = 0; i < 3; i++)
      units.push(
        unit(1 + p * 10 + i, 1, 1 + p, 6, 4 + p * 8 + i, p === 0 && i === 0 ? { commandCap: 3 } : {}),
      );
  for (let i = 0; i < 3; i++) units.push(unit(101 + i, 2, 11, 29, 14 + i));
  return {
    id: 1,
    kind: "normal",
    seed: 5,
    map: openMap(SIZE),
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [
      ...Array.from({ length: parties }, (_, p) => ({ id: 1 + p, side: 1, retreatHpPct: 0 })),
      { id: 11, side: 2, retreatHpPct: 0 },
    ],
    units: units.map((spec) => extra({ ...spec, sight: 4 })),
    limitMs: 120_000,
  };
}

describe("분대 1~2개 편도 군단 명령을 받는다(D-571 답 1973)", () => {
  for (const parties of [1, 2])
    it(`분대 ${parties}개: 군단 명령이 거절되지 않고 모든 분대에 간다`, () => {
      const b = createBattle(battle(parties));
      b.step([{ tick: 0, kind: "legion", side: 1, order: { kind: "hold" } }]);
      expect(b.state.rejected).toBe(0);
      const own = b.state.parties.filter((p) => p.side === 1);
      expect(own).toHaveLength(parties);
      expect(own.every((p) => p.order?.kind === "hold" && p.order.legion)).toBe(true);
    });
});

describe("퇴각 승계(D-571 답 1967 — 쓰러짐과 같은 순서·같은 규칙)", () => {
  it("지휘관 파티가 퇴각하면 작위 → 랭킹 순으로 잇고, 새 정원 밖 파티는 군단 명령을 내려놓는다", () => {
    const init = battle(3, (s) => {
      if (s.id === 1) return { ...s, commandCap: 3, commandRank: { title: 4, combatTier: null } };
      if (s.id === 11) return { ...s, commandCap: 2, commandRank: { title: 1, combatTier: null } };
      // 랭킹 등급은 높지만 작위가 낮다 → 작위가 먼저(D-558 1545)
      if (s.id === 21) return { ...s, commandCap: 3, commandRank: { title: 0, combatTier: 0 } };
      return s;
    });
    // 지휘관 파티를 가장자리 가까이 둔다(빨리 빠지게)
    const units = init.units.map((s) => (s.party === 1 ? { ...s, x: 1 } : s));
    const b = createBattle({ ...init, units });
    expect(b.state.sides[0]?.commander).toBe(1);
    const inputs: BattleInput[] = [
      { tick: 0, kind: "legion", side: 1, order: { kind: "hold" } },
      { tick: 0, kind: "order", party: 1, order: { kind: "retreat" } },
    ];
    b.runToEnd(inputs, 200);
    expect(b.state.parties.find((p) => p.id === 1)?.retreated).toBe(true);
    const side = b.state.sides[0];
    expect(side?.commander).toBe(11);
    // 정원 2: 자기 파티(2) + 파티 3 — 파티 1은 빠졌다
    expect(side?.uncommanded).toEqual([]);
    expect(b.state.parties.find((p) => p.id === 3)?.order?.kind).toBe("hold");
  });

  it("퇴각으로 이은 지휘관의 정원이 작으면 정원 밖 파티의 군단 명령을 거둔다", () => {
    const init = battle(3, (s) => {
      if (s.id === 1) return { ...s, commandCap: 3, commandRank: { title: 4, combatTier: null } };
      if (s.id === 11) return { ...s, commandCap: 1, commandRank: { title: 1, combatTier: null } };
      return s;
    });
    const units = init.units.map((s) => (s.party === 1 ? { ...s, x: 1 } : s));
    const b = createBattle({ ...init, units });
    b.runToEnd(
      [
        { tick: 0, kind: "legion", side: 1, order: { kind: "hold" } },
        { tick: 0, kind: "order", party: 1, order: { kind: "retreat" } },
      ],
      200,
    );
    const side = b.state.sides[0];
    expect(side?.commander).toBe(11);
    expect(side?.uncommanded).toEqual([3]);
    expect(b.state.parties.find((p) => p.id === 2)?.order?.kind).toBe("hold");
    expect(b.state.parties.find((p) => p.id === 3)?.order).toBeUndefined();
  });
});

describe("전개 방식 수 = 설정 칸(D-571 답 1963)", () => {
  const me = createBattle(battle(1)).state.units[0];
  const enemyAt = (x: number, y: number) => {
    const base = createBattle(battle(1)).state.units.at(-1);
    if (!base) throw new Error("enemy");
    return { ...base, x, y };
  };
  it("계수표 출발값은 D-558 때 상수와 같고, k가 없으면 출발값", () => {
    expect(TEST_COMBAT_COEFFICIENTS.tactics).toEqual(DEFAULT_TACTIC_COEFFICIENTS);
    expect(DEFAULT_TACTIC_COEFFICIENTS).toEqual({
      defendRadius: 4,
      backlineRange: 3,
      delayGap: 2,
      harassMinRange: 2,
      flankTurnPm: 500,
      laneDivisor: 3,
    });
  });

  it("수비 집중 닻 둘레를 줄이면 그 밖의 적은 쫓지 않는다", () => {
    if (!me) throw new Error("unit");
    const view = {
      size: SIZE,
      edge: 3 as const,
      enemies: [enemyAt(me.x + 4, me.y)],
      commanders: new Set<number>(),
      anchor: me.y * SIZE + me.x,
      retreatBand: 2,
    };
    expect(planTactic(me, "defend", view).chase).toBe(true);
    expect(
      planTactic(me, "defend", { ...view, k: { ...DEFAULT_TACTIC_COEFFICIENTS, defendRadius: 2 } }).chase,
    ).toBe(false);
  });

  it("견제 사거리 칸을 낮추면 근접 유닛도 견제한다(물러남)", () => {
    if (!me) throw new Error("unit");
    const view = {
      size: SIZE,
      edge: 3 as const,
      enemies: [enemyAt(me.x, me.y)],
      commanders: new Set<number>(),
      anchor: undefined,
      retreatBand: 2,
    };
    const melee = { ...me, range: 1 };
    expect(planTactic(melee, "harass", view).back).toBe(false);
    expect(
      planTactic(melee, "harass", { ...view, k: { ...DEFAULT_TACTIC_COEFFICIENTS, harassMinRange: 1 } }).back,
    ).toBe(true);
  });
});

describe("손으로 짠 진형(D-571 답 1965 — 기본 대형 + 진형 저장 D-172·D-179)", () => {
  it("custom: 유닛 사양의 formationSlot대로 서고, 자리가 없는 유닛은 진형판 뒤에 선다", () => {
    const init = battle(1, (s) => {
      if (s.id === 1) return { ...s, formationSlot: { f: 0, l: 3 } };
      if (s.id === 2) return { ...s, formationSlot: { f: -2, l: -1 } };
      return s;
    });
    const members = createBattle(init).state.units.filter((u) => u.side === 1);
    expect(customOffsets(members)).toEqual([
      { f: 0, l: 3 },
      { f: -2, l: -1 },
      { f: -6, l: 0 },
    ]);
    // 서쪽 편(edge 3): 앞 = +x, 옆 l = −y. 앞줄 기준(anchor front)
    const slots = formationSlots(members, "custom", 3, { x: 15, y: 15 }, SIZE, () => true, "front");
    expect(slots).toEqual([
      { unit: 1, cell: cellOf(15, 12) },
      { unit: 2, cell: cellOf(13, 16) },
      { unit: 3, cell: cellOf(9, 15) },
    ]);
  });

  it("군단 custom은 파티 진형판을 옆으로 10칸씩 벌린다", () => {
    const init = battle(2, (s) => ({ ...s, formationSlot: { f: 0, l: 0 } }));
    const members = createBattle(init).state.units.filter((u) => u.side === 1);
    const offsets = customOffsets(members);
    expect(offsets.slice(0, 3).every((o) => o.l === 0)).toBe(true);
    expect(offsets.slice(3).every((o) => o.l === -10)).toBe(true);
  });

  it("대형 고르기 custom → 파티가 저장한 진형 자리로 다시 선다", () => {
    const init = battle(1, (s) => (s.side === 1 ? { ...s, formationSlot: { f: 0, l: s.id - 2 } } : s));
    const b = createBattle(init);
    b.runToEnd([{ tick: 0, kind: "order", party: 1, order: { kind: "formation", shape: "custom" } }], 40);
    const party = b.state.parties.find((p) => p.id === 1);
    expect(party?.shape).toBe("custom");
    expect(party?.order?.kind).toBe("rally");
    const own = b.state.units.filter((u) => u.side === 1);
    // 한 줄(앞 f = 0)로 선다: 같은 x
    expect(new Set(own.map((u) => u.x)).size).toBe(1);
  });
});

const ids = (list: readonly { id: number }[]) => list.map((u) => u.id);
/** 파티 A = 1~3, 파티 B = 4~7, 혼자 = 8~10 */
const partyAB = (id: number) => (id <= 3 ? 1 : id <= 7 ? 2 : undefined);
/** 파티 1~3·4~6·7~9(셋 다 군단 7), 혼자 = 10 */
const partyThree = (id: number) => (id <= 3 ? 1 : id <= 6 ? 2 : id <= 9 ? 3 : undefined);
const legionOfThree = (key: number) => (key <= 3 ? 7 : undefined);
const oneParty = () => 1;

describe("웨이브 수비 편성을 자르지 않는다(D-571 답 1970)", () => {
  const units = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
  it("묶음이 없으면 옛 꼴(앞에서부터 상한만큼)", () => {
    expect(ids(waveDefenderPick(units, 4))).toEqual([1, 2, 3, 4]);
  });

  it("넘치는 파티는 통째로 빠지고, 뒤 편성이 남은 자리에 들어간다", () => {
    expect(ids(waveDefenderPick(units, 5, partyAB))).toEqual([1, 2, 3, 8, 9]);
    expect(ids(waveDefenderPick(units, 7, partyAB))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("넘치는 군단은 파티 하나씩 들어가는 만큼(파티는 자르지 않는다)", () => {
    expect(ids(waveDefenderPick(units, 7, partyThree, legionOfThree))).toEqual([1, 2, 3, 4, 5, 6, 10]);
  });

  it("상한이 가장 작은 파티보다 작으면 앞에서부터 상한만큼(수비가 없지 않게)", () => {
    expect(ids(waveDefenderPick(units, 2, oneParty))).toEqual([1, 2]);
  });
});

describe("나라 명성 → 작위(D-326·49 S18, D-571 답 1961)", () => {
  it("문턱 100·500·1000·3000·5000, 넘은 가장 높은 단계", () => {
    const c = DEFAULT_RENOWN_COEFFICIENTS;
    expect([0, 99, 100, 499, 500, 1000, 2999, 3000, 5000, 99_999].map((r) => titleOfRenown(r, c))).toEqual([
      0, 0, 1, 1, 2, 3, 3, 4, 5, 5,
    ]);
  });
});
