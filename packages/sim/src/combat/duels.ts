// 반복 대결 — docs/adr/2026-10-31-combat-core.md "개발자 페이지 재사용"
// 개발자 페이지 전투 시뮬레이터(D-414: 설정한 유닛끼리 반복 전투, 특정 스탯이 무조건 이기지 않는지)가 쓸 순수 함수다.
// 같은 판정(runBattle)을 시드만 바꿔 여러 번 돌려 편마다 이긴 수를 낸다. 화면은 개발자 페이지 단계(D1·D2)에서 만든다.
// 밸런스 화면(D-458: 가중치 표를 고치고 1차 스탯 하나를 +10 했을 때 승률을 본다)은 runStatDuels 하나로 1차 스탯·표·무기에서 바로 돌린다.
import { runBattle } from "./battle.ts";
import type { BattleInit, BattleState, CombatUnitSpec } from "./battleTypes.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { type Primaries, type StatRow, computeSecondary } from "./stats.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";
import { mix32 } from "../math/hash.ts";

export interface DuelReport {
  readonly runs: number;
  readonly aWins: number;
  readonly bWins: number;
  readonly timeouts: number;
  /** 평균 걸린 시간(ms) */
  readonly avgMs: number;
  /** 시간 초과 가운데 남은 (HP + 아머 + 쉴드) ÷ 최대(‰)가 더 큰 편(밸런스 화면의 판정, 같으면 어느 쪽도 아님) */
  readonly aTimeoutLeads: number;
  readonly bTimeoutLeads: number;
}

/** 대결 선택(밸런스 화면): 지도 한 변(기본 64), 제한 시간(ms, 기본 계수표 일반 전투) */
export interface DuelOptions {
  readonly mapSize?: number | undefined;
  readonly limitMs?: number | undefined;
}

/** 편의 남은 몫(‰): Σ(HP + 아머 + 쉴드) ÷ Σ(최대). 유닛이 없으면 0 */
function remainingPm(state: BattleState, side: number): number {
  let left = 0;
  let max = 0;
  for (const unit of state.units) {
    if (unit.side !== side) continue;
    left += Math.max(0, unit.hp) + Math.max(0, unit.armor) + Math.max(0, unit.shield);
    max += unit.maxHp + unit.armorHp + unit.shieldHp;
  }
  return max <= 0 ? 0 : Math.floor((left * 1000) / max);
}

/** 빈 평지에 두 편을 시야 안 거리(8칸)로 마주 세운다(편 1 = a, 편 2 = b, 각 편 한 파티씩 6명 단위) */
export function duelInit(
  a: readonly CombatUnitSpec[],
  b: readonly CombatUnitSpec[],
  seed: number,
  size = 64,
  limitMs?: number,
): BattleInit {
  const cells = size * size;
  const center = size / 2;
  const place = (
    list: readonly CombatUnitSpec[],
    side: number,
    x: number,
    partyBase: number,
  ): CombatUnitSpec[] =>
    list.map((spec, index) => ({
      ...spec,
      id: side * 100_000 + index + 1,
      side,
      party: partyBase + Math.floor(index / 6),
      x: x + (side === 1 ? -1 : 1) * Math.floor(index / 20),
      y: center + ((index % 20) - 10),
    }));
  const units = [...place(a, 1, center - 4, 1), ...place(b, 2, center + 4, 1001)];
  const parties = [...new Set(units.map((unit) => unit.party))].map((id) => ({
    id,
    side: id < 1000 ? 1 : 2,
    retreatHpPct: 0,
  }));
  return {
    id: seed,
    kind: "normal",
    seed,
    map: {
      size,
      passable: new Uint8Array(cells).fill(1),
      cover: new Uint8Array(cells),
      height: new Int32Array(cells),
      buildings: [],
    },
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties,
    units,
    ...(limitMs === undefined ? {} : { limitMs }),
  };
}

/**
 * a와 b를 runs번 싸운다(시드 = seedBase에서 갈라 씀). 수비 승(시간 초과)은 b 승으로 센다. 시간 초과마다 남은 몫이 큰 편을
 * aTimeoutLeads·bTimeoutLeads에 따로 센다(밸런스 화면 판정)
 */
export function runDuels(
  a: readonly CombatUnitSpec[],
  b: readonly CombatUnitSpec[],
  runs: number,
  seedBase = 1,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
  options: DuelOptions = {},
): DuelReport {
  let aWins = 0;
  let bWins = 0;
  let timeouts = 0;
  let aTimeoutLeads = 0;
  let bTimeoutLeads = 0;
  let totalMs = 0;
  for (let run = 0; run < runs; run++) {
    const { result, state } = runBattle(
      duelInit(a, b, mix32(seedBase ^ Math.imul(run + 1, 0x9e37_79b1)), options.mapSize, options.limitMs),
      [],
      undefined,
      c,
    );
    if (result.winner === 1) aWins += 1;
    else bWins += 1;
    if (result.reason === "timeout") {
      timeouts += 1;
      const lead = remainingPm(state, 1) - remainingPm(state, 2);
      if (lead > 0) aTimeoutLeads += 1;
      else if (lead < 0) bTimeoutLeads += 1;
    }
    totalMs += result.endTick * c.tickMs;
  }
  return {
    runs,
    aWins,
    bWins,
    timeouts,
    avgMs: runs === 0 ? 0 : Math.floor(totalMs / runs),
    aTimeoutLeads,
    bTimeoutLeads,
  };
}

/** 밸런스 화면의 대결 유닛 한 종류: 1차 스탯(장비 포함) + 무기, 같은 유닛 몇 명(기본 3) */
export interface StatFighter {
  readonly primaries: Primaries;
  readonly weapon: WeaponSpec;
  readonly count?: number | undefined;
  /** 속성값 12칸(0~10)·속성별 저항 ‰. 없으면 0 */
  readonly elements?: readonly number[] | undefined;
  readonly resistPm?: readonly number[] | undefined;
}

/** 1차 스탯 + 가중치 표 → 2차 스탯(computeSecondary) → 전투 사양(specFromStats). 자리·편은 duelInit이 다시 정한다 */
export function statFighterSpecs(
  fighter: StatFighter,
  table: readonly StatRow[],
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): CombatUnitSpec[] {
  const spec = specFromStats(
    {
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: computeSecondary(fighter.primaries, table),
      weapon: fighter.weapon,
      moveIntervalMs: 1000,
      primaries: fighter.primaries,
      elements: fighter.elements,
      resistPm: fighter.resistPm,
    },
    c,
  );
  return Array.from({ length: Math.max(1, fighter.count ?? 3) }, () => spec);
}

/**
 * 1차 스탯 대결(밸런스 화면, D-458·D-414): a·b를 가중치 표로 전투 사양으로 바꿔 runs번 싸운다(시드 = seed에서 갈라 씀).
 * 순수 함수다: 같은 입력이면 같은 보고. 표만 바꿔 다시 부르면 그 표의 승률이 나온다
 */
export function runStatDuels(
  a: StatFighter,
  b: StatFighter,
  options: DuelOptions & {
    readonly table: readonly StatRow[];
    readonly runs: number;
    readonly seed?: number | undefined;
    readonly coefficients?: CombatCoefficients | undefined;
  },
): DuelReport {
  const c = options.coefficients ?? TEST_COMBAT_COEFFICIENTS;
  return runDuels(
    statFighterSpecs(a, options.table, c),
    statFighterSpecs(b, options.table, c),
    options.runs,
    options.seed ?? 1,
    c,
    { mapSize: options.mapSize, limitMs: options.limitMs },
  );
}
