// 반복 대결 — docs/adr/2026-10-31-combat-core.md "개발자 페이지 재사용"
// 개발자 페이지 전투 시뮬레이터(D-414: 설정한 유닛끼리 반복 전투, 특정 스탯이 무조건 이기지 않는지)가 쓸 순수 함수다.
// 같은 판정(runBattle)을 시드만 바꿔 여러 번 돌려 편마다 이긴 수를 낸다. 화면은 개발자 페이지 단계(D1·D2)에서 만든다.
import { runBattle } from "./battle.ts";
import type { BattleInit, CombatUnitSpec } from "./battleTypes.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { mix32 } from "../math/hash.ts";

export interface DuelReport {
  readonly runs: number;
  readonly aWins: number;
  readonly bWins: number;
  readonly timeouts: number;
  /** 평균 걸린 시간(ms) */
  readonly avgMs: number;
}

/** 빈 평지에 두 편을 시야 안 거리(8칸)로 마주 세운다(편 1 = a, 편 2 = b, 각 편 한 파티씩 6명 단위) */
export function duelInit(
  a: readonly CombatUnitSpec[],
  b: readonly CombatUnitSpec[],
  seed: number,
  size = 64,
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
  };
}

/** a와 b를 runs번 싸운다(시드 = seedBase에서 갈라 씀). 수비 승(시간 초과)은 b 승으로 센다 */
export function runDuels(
  a: readonly CombatUnitSpec[],
  b: readonly CombatUnitSpec[],
  runs: number,
  seedBase = 1,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): DuelReport {
  let aWins = 0;
  let bWins = 0;
  let timeouts = 0;
  let totalMs = 0;
  for (let run = 0; run < runs; run++) {
    const { result } = runBattle(
      duelInit(a, b, mix32(seedBase ^ Math.imul(run + 1, 0x9e37_79b1))),
      [],
      undefined,
      c,
    );
    if (result.winner === 1) aWins += 1;
    else bWins += 1;
    if (result.reason === "timeout") timeouts += 1;
    totalMs += result.endTick * c.tickMs;
  }
  return { runs, aWins, bWins, timeouts, avgMs: runs === 0 ? 0 : Math.floor(totalMs / runs) };
}
