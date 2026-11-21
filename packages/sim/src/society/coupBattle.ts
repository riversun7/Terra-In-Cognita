// 군사 쿠데타 전투(서버만 — 줄기 governance-3, 사용자 답 D-583 질문 2433 나 가: 혁명군 대 정부군, 반란 전투 틀 D-256을 그대로 쓴다). 시뮬은 쿠데타가 없어 부르지 않는다.
// 반란과 같은 도시 안 공성(simulator/combatRun.ts rebellion — 열린 맵 + 가운데 시청 넥서스, 혁명군 = 편 1, 정부군 = 편 2): 혁명군이 시청을 무너뜨리거나 정부군을
// 모두 쓰러뜨리면 이긴다. 유닛 부상은 그 세계 유닛에 남는다(combatRun fight와 같은 함수). 기록기는 버린다(서버 1분 지표에 따로 남기지 않는다).
import { type CombatCatalog, TEST_COMBAT_CATALOG } from "../combat/catalog.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "../combat/coefficients.ts";
import { attachCombat } from "../simulator/combatRun.ts";
import { createMetricsRecorder } from "../simulator/metrics.ts";
import type { SimFaction, SimUnit, SimWorld } from "../simulator/world.ts";

/** 쿠데타 전투맵 한 변(49 C3 공성 128)·넥서스 내구도 [임시 — 시뮬 반란과 같은 출발값] */
const COUP_MAP_SIZE = 128;
const COUP_NEXUS_DURABILITY = 2000;

export interface CoupBattleInput {
  readonly world: SimWorld;
  /** 정부(그 나라 세력 — 기술 단계·편 정보) */
  readonly government: SimFaction;
  readonly rebels: readonly SimUnit[];
  readonly loyal: readonly SimUnit[];
  readonly nowMs: number;
  /** 편마다 나서는 유닛 수 상한(설정 칸 gov_coup_battle_units) */
  readonly unitsPerSide: number;
  readonly catalog?: CombatCatalog | undefined;
  readonly combat?: CombatCoefficients | undefined;
}

/** 혁명군이 이기면 true. 혁명군 유닛이 없으면 지고, 정부군 유닛이 없으면 이긴다 */
export function runCoupBattle(input: CoupBattleInput): boolean {
  if (input.rebels.length === 0) return false;
  if (input.loyal.length === 0) return true;
  const recorder = createMetricsRecorder({ startMs: input.nowMs, sink: () => undefined });
  const run = attachCombat(
    input.world,
    {
      siegeUnits: Math.max(1, Math.trunc(input.unitsPerSide)),
      encounterUnits: 0,
      encounterPerMille: 0,
      mapSize: COUP_MAP_SIZE,
      siegeMapSize: COUP_MAP_SIZE,
      nexusDurability: COUP_NEXUS_DURABILITY,
    },
    recorder,
    input.catalog ?? TEST_COMBAT_CATALOG,
    input.combat ?? TEST_COMBAT_COEFFICIENTS,
  );
  return run.rebellion(input.government, input.rebels, input.loyal, input.nowMs);
}
