// 2차맵 사이 이동 도중 습격 — 기획 답 593 나("도중 습격은 확률")·610 나, docs/adr/2026-11-07-play-flow.md "WP13 이동 3".
// - 굴림(건너뛰기를 시작할 때, raidAt): 건너뛰는 띄우지 않은 2차맵마다 차례로 확률 ‰ = min(상한, 기본 + 그 2차맵 오염 ÷ 나눗수)(설정 칸
//   travel_raid_* [임시]). 난수는 길마다 정해진 씨앗(유닛·보낸 시각·구간, raidSeed)이라 다시 켜서 다시 숨겨도 같은 답이다. 첫 습격 2차맵 키 또는 null.
// - 싸움(나타날 때, fight): 유닛이 다음 띄운 2차맵 변에 선 뒤, 정원사 크리쳐 N마리(웨이브와 같은 몸 — sim waveBattleInit의 크리쳐 사양)와
//   넥서스 없는 보통 전투를 빨리감기로 끝까지 계산한다(@terra/sim runBattle — 세계 전투와 같은 판정). 유닛 몸은 세계 전투와 같은 셈(battleBodies
//   build — 입은 장비·버프, 없으면 시뮬 [임시] 휴먼 사양). 내 유닛이 쓰러졌으면 부상(DOWNED_INJURY)을 걸고 진 것으로 한다.
//   세계 전투 표(world_battles)·탈취·포로·안전 도시 귀환은 쓰지 않는다 — 그 자리(다음 띄운 2차맵 변)에서 부상으로 멈춘다(610 나).
// [임시] 생명 수치(남은 HP·아머·쉴드)·물약·탄은 바꾸지 않는다, 습격 기록은 서버 기록 한 줄뿐이다(확인 대기 질문 700).
import {
  type BattleInit,
  type CombatCatalog,
  type CombatCoefficients,
  type GardenerCoefficients,
  type SimUnit,
  TEST_COMBAT_COEFFICIENTS,
  TEST_GARDENER_COEFFICIENTS,
  mix32,
  runBattle,
  waveBattleInit,
} from "@terra/sim";
import { createRng } from "@terra/shared";
import type { BattleBodies } from "../world/battleBodies.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { DOWNED_INJURY, injure } from "../world/unitCondition.ts";

/** 습격 전투 칸 수(전투맵 가장 작은 크기 32 — 크리쳐는 서쪽 변, 유닛은 가운데 앞) */
export const RAID_MAP_SIZE = 32;
/** 습격 크리쳐 전투 유닛 ID의 시작(세계 유닛 ID·웨이브 크리쳐와 겹치지 않게) */
const RAID_CREATURE_ID_BASE = 1_950_000_000;
/** [임시] 습격 크리쳐 1차 스탯의 기술 단계(크리쳐 에디터 값이 생기면 바꾼다) */
const RAID_CREATURE_TECH = 1;

export interface RaidOutcome {
  /** 내 유닛이 쓰러졌다(부상을 걸었다). 시간이 다 되어도 서 있으면 false */
  readonly lost: boolean;
  readonly creatures: number;
  readonly ticks: number;
}

export interface TravelRaids {
  /** 건너뛰는 2차맵 키들(차례대로)에서 습격이 났는지 굴린다. 난 2차맵 키(첫 번째) 또는 null */
  raidAt(skipped: readonly number[], seed: number): number | null;
  /** 나타난 유닛(그 2차맵에 서 있다)이 습격과 싸운다. 졌으면 부상을 건다. 싸울 수 없으면(유닛 없음·크리쳐 0) null */
  fight(map: SecondMap, unitId: number, seed: number, nowMs: number): RaidOutcome | null;
}

/** 길·구간마다 정해진 씨앗(유닛·보낸 시각·사라진 구간) */
export function raidSeed(unitId: number, startedAtMs: number, fromLeg: number): number {
  return mix32(
    Math.imul(unitId, 0x9e37_79b1) ^ (startedAtMs % 0x7fff_ffff) ^ Math.imul(fromLeg + 1, 0x85eb_ca6b),
  );
}

/** 한 2차맵을 지날 때의 습격 확률(‰) */
export function raidChancePm(pollution: number, c: GardenerCoefficients): number {
  const added = Math.floor(Math.max(0, pollution) / Math.max(1, c.travelRaidPollutionDivisor));
  return Math.max(0, Math.min(c.travelRaidMaxPm, c.travelRaidBasePm + added));
}

/** 건너뛰는 2차맵들을 차례로 굴린다(순수). 난 2차맵 키 또는 null */
export function rollRaid(
  skipped: readonly number[],
  pollutionOf: (mapKey: number) => number,
  seed: number,
  c: GardenerCoefficients,
): number | null {
  if (c.travelRaidCreatures <= 0) return null;
  const rng = createRng(seed);
  for (const mapKey of skipped) if (rng.nextInt(1000) < raidChancePm(pollutionOf(mapKey), c)) return mapKey;
  return null;
}

/** 세계 유닛 하나를 시뮬 사양 함수가 읽는 모양으로(사양 함수가 읽는 칸은 ID뿐이다) */
function simUnitOf(id: number, ownerId: number): SimUnit {
  return {
    id,
    city: 0,
    owner: ownerId,
    job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
    pos: { x: 0, y: 0 },
    tripStep: 0,
    eventId: undefined,
    satisfactionMilli: 0,
    bornAtMs: 0,
    lifespanMs: 0,
    recruit: null,
    rebirths: 0,
  };
}

/**
 * 습격 전투의 시작 자료: 웨이브 시작 자료(waveBattleInit — 크리쳐 몸·자리)를 넥서스 없는 보통 전투로 바꾸고, 내 유닛 사양은 세계 몸(있으면)으로.
 * 크리쳐는 모두 물리형(근접 — 들판 싸움)
 */
export function raidBattleInit(input: {
  readonly seed: number;
  readonly unitId: number;
  readonly ownerId: number;
  readonly creatures: number;
  readonly catalog: CombatCatalog;
  readonly combat: CombatCoefficients;
  /** 내 유닛의 세계 몸(battleBodies build). 없으면 시뮬 [임시] 휴먼 사양 그대로 */
  readonly body?:
    | ((place: BattleInit["units"][number]) => BattleInit["units"][number] | undefined)
    | undefined;
}): BattleInit {
  const wave = waveBattleInit(
    {
      battleId: 0,
      seed: input.seed,
      defenderFaction: input.ownerId,
      defenders: [simUnitOf(input.unitId, input.ownerId)],
      defenderTech: RAID_CREATURE_TECH,
      strength: input.creatures,
      physical: input.creatures,
      creatureTech: RAID_CREATURE_TECH,
      firstCreatureId: RAID_CREATURE_ID_BASE,
      mapSize: RAID_MAP_SIZE,
      nexusDurability: 1,
      maxDefenders: 1,
      limitMs: input.combat.limitMs.normal,
    },
    input.catalog,
    input.combat,
  );
  return {
    ...wave,
    kind: "normal",
    map: { ...wave.map, buildings: [] },
    units: wave.units.map((spec) => (spec.id === input.unitId ? (input.body?.(spec) ?? spec) : spec)),
  };
}

export function createTravelRaids(deps: {
  /** 설정 칸 실효 값의 정원사 계수(부를 때마다). 없으면 시험 계수표 */
  readonly rules?: (() => GardenerCoefficients) | undefined;
  /** 그 2차맵(1차맵 칸)의 정원사 오염(NPC 런타임 메모리). 없으면 0 */
  readonly pollutionOf?: ((mapKey: number) => number) | undefined;
  readonly catalog: () => CombatCatalog;
  readonly combat?: (() => CombatCoefficients) | undefined;
  readonly bodies?: Pick<BattleBodies, "build"> | undefined;
}): TravelRaids {
  const rules = (): GardenerCoefficients => deps.rules?.() ?? TEST_GARDENER_COEFFICIENTS;
  return {
    raidAt(skipped, seed) {
      return rollRaid(skipped, (key) => deps.pollutionOf?.(key) ?? 0, seed, rules());
    },
    fight(map, unitId, seed, nowMs) {
      const info = map.unitInfo(unitId);
      const creatures = rules().travelRaidCreatures;
      if (!info || creatures <= 0) return null;
      const combat = deps.combat?.() ?? TEST_COMBAT_COEFFICIENTS;
      const init = raidBattleInit({
        seed,
        unitId,
        ownerId: info.ownerId,
        creatures,
        catalog: deps.catalog(),
        combat,
        body: (spec) =>
          deps.bodies?.build(
            unitId,
            {
              id: spec.id,
              side: spec.side,
              party: spec.party,
              x: spec.x,
              y: spec.y,
              moveIntervalMs: spec.moveIntervalMs,
              buildingMulPm: spec.buildingMulPm,
            },
            nowMs,
          ),
      });
      const { result, state } = runBattle(init, [], undefined, combat);
      // 진 것 = 내 유닛이 쓰러짐(전투 결과 적용과 같은 부상 기준 — hp ≤ 0). 시간이 다 되어 서 있으면 지나간다
      const mine = state.units.find((unit) => unit.id === unitId);
      const lost = mine === undefined || mine.hp <= 0;
      if (lost) map.setCondition(unitId, injure(info.condition, DOWNED_INJURY, nowMs));
      return { lost, creatures, ticks: result.endTick };
    },
  };
}
