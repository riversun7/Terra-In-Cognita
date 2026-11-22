// NPC 일꾼의 작업 중 부상 — 기획 D-521("전투나 생산채집등의 작업시 부상 확률에 따라 부상"), D-555 1509("NPC만으로도 똑같이"), 질문 2702 나
// (줄기 fixes-1117i). 플레이어 유닛은 소유 주체 정산(world/settlement.ts injureWork — 직무 상태)과 2차맵 채집(createGatherInjury)에서 굴린다.
// NPC 휴먼은 직무 상태가 없어(도시 경제가 일꾼 수만 센다 — npc/economy.ts) 여기서 같은 판정을 부른다:
// - 작업 주기 경계(설정 칸 N55 작업 주기, 정시)마다 그 도시 시설 일터를 받은 휴먼(npc/humanPlaces.ts — 2차맵 봇 home.work)이 그 시각에 일하는 때
//   (world/bots.ts atWork — 지역 낮 또는 피로 바퀴)이고, 그 도시 2차맵에 실제로 서 있고(2차맵 사이 이동 중 아님 — D-591), 쓸 수 있으면(빨강·포로·돌아가는
//   중이 아님) 플레이어 채집과 같은 함수·시드(createGatherInjury — @terra/sim workInjuryStage, 경계 번호 = 경계 시각 ÷ 작업 주기)로 굴린다.
// - 피로 = 보이는 움직임의 어림 피로(bots.ts shiftFatiguePm, ‰ — 일하는 때 끝에 꼭대기 600‰) ÷ 1000 [임시]: 늦게까지 일할수록 자주 다친다(플레이어
//   직무와 같은 모양 — 피로가 높을수록).
// - 경비대·불복·일터 없는 휴먼(도시 직무 — 건물이 없어 시청 칸에서 일하는 휴먼 포함)은 굴리지 않는다 [임시 — 질문 2741].
// - 다친 휴먼은 league-3의 자율 치료(labor/stewardCare.ts NPC 휴먼 몫)가 병원으로 데려간다.
// - 경계 확인은 메모리에만(마지막으로 본 경계). 켤 때는 지난 경계를 따라 굴리지 않는다(꺼진 동안 다치지 않음 — 플레이어 정산의 오프라인 끝과 비슷하게).
// - 부하: 런타임 틱(5초)마다 불리지만 새 경계가 없으면 바로 돌아간다(경계는 작업 주기마다 한 번). 경계마다 거울 휴먼 수만큼 2차맵 유닛을 읽는다.
import { type BotHome, DEFAULT_WORK_SHIFT, atWork, shiftFatiguePm } from "../world/bots.ts";
import {
  type ConditionMap,
  type GatherInjuryHook,
  type UnitCondition,
  createGatherInjury,
  injuryRules,
  unavailable,
} from "../world/unitCondition.ts";

/** 어림 피로의 가득(‰ — bots.ts shiftFatiguePm과 같은 단위) */
export const NPC_WORK_FATIGUE_MAX = 1000;
/** 한 번에 따라 굴리는 경계 수 상한(오래 멈춘 틱이 한꺼번에 많이 굴리지 않게 — 채집 고리와 같은 하루 몫) */
const MAX_BOUNDARIES = 24;

/** 굴릴 때 읽는 2차맵 몫(SecondMap이 그대로 맞는다) */
export interface WorkInjuryMap extends ConditionMap {
  unitInfo(unitId: number):
    | {
        readonly condition: UnitCondition;
        readonly home?: BotHome | undefined;
        readonly held?: boolean | undefined;
      }
    | undefined;
}

export interface NpcWorkInjury {
  /** nowMs까지 지난 작업 주기 경계를 굴린다. 다친 휴먼 수 */
  roll(nowMs: number): number;
}

export function createNpcWorkInjury(o: {
  /** 거울 세계 휴먼(유닛 ID → 도시·경비대) */
  readonly units: ReadonlyMap<
    number,
    { readonly id: number; readonly city: number; readonly guard?: boolean | undefined }
  >;
  /** 도시 자리(2차맵) */
  readonly places: ReadonlyMap<number, { readonly mapKey: number }>;
  readonly maps: ReadonlyMap<number, WorkInjuryMap>;
  /** 켠 시각(이 시각 뒤의 경계부터 굴린다) */
  readonly startMs: number;
  /** 굴림(시험이 바꾼다). 없으면 플레이어 채집과 같은 판정·시드 */
  readonly hook?: GatherInjuryHook | undefined;
}): NpcWorkInjury {
  const hook = o.hook ?? createGatherInjury();
  let checkedMs = o.startMs;
  return {
    roll(nowMs) {
      const period = injuryRules().workPeriodMs;
      if (period < 1 || nowMs <= checkedMs) return 0;
      const last = Math.floor(nowMs / period);
      const first = Math.max(Math.floor(checkedMs / period) + 1, last - MAX_BOUNDARIES + 1);
      checkedMs = nowMs;
      let hurt = 0;
      for (let index = first; index <= last; index++) {
        const at = index * period;
        for (const unit of o.units.values()) {
          if (unit.guard === true) continue;
          const place = o.places.get(unit.city);
          const map = place ? o.maps.get(place.mapKey) : undefined;
          const info = map?.unitInfo(unit.id);
          const work = info?.home?.work;
          if (!map || !info || !work || info.held === true || unavailable(info.condition, at)) continue;
          const shift = info.home?.shift ?? DEFAULT_WORK_SHIFT;
          if (!atWork(shift, unit.id, at)) continue;
          // 경계 하나만 굴린다((at − 1, at] — 같은 경계 번호·시드라 나눠 불러도 같다)
          const stage = hook(
            map,
            unit.id,
            shiftFatiguePm(shift, unit.id, at),
            NPC_WORK_FATIGUE_MAX,
            at - 1,
            at,
          );
          if (stage > 0) hurt += 1;
        }
      }
      return hurt;
    },
  };
}
