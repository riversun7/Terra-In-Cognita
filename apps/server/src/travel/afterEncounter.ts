// 조우 뒤 다시 판단 — 기획 D-570(질문 1908 원문 "그러나 ai 다시 판단 채집하러가는데 약탈로 인벤토리가 8-90찼다면 전리품을 정리하러 가거나
// 레이드가는데 전투로 재정비가 필요하면 복귀"), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-570, 좌표 이동 3)"·"바뀜 (encounter-4)".
// 조우로 멈춘 길(service.ts haltOn → HaltedTrip)과 채집 줄(gather suspend)마다 전투 결과가 적용된 뒤(끝 시각 + RECHECK_SLACK_MS) 한 번:
// - 그 유닛이 전투에서 서 있지 않았거나(퇴각·포로·안전한 곳으로 감) 지금 움직일 수 없으면(빨강 부상·포로) 그대로 둔다(채집 줄은 끝).
// - 짐이 운반 상한(설정 칸 gather_carry_grams — 채집 줄과 같은 걷는 화물 상한)의 encounter_full_pm 이상이면 전리품 정리(unload).
// - 남은 HP가 최대의 encounter_regroup_hp_pm 아래이거나 부상(1단계 이상)이면 재정비(regroup).
// - 아니면 하던 일을 다시 한다(resume — 같은 목표·같은 명령 종류, 채집 줄은 그 오브젝트로).
// 바뀜 (encounter-4, 질문 2033·2035 답 — D-570 1904·1908):
// - 돌아갈 곳은 "출발 자리"가 아니다: 전리품 정리 → 가장 가까운 내 창고(encounterHome.ts — 같은 2차맵이면 들어가기로 바로 넣고, 다른 2차맵이면
//   그 창고로 간 뒤 닿으면 들어가기), 재정비 → 가장 가까운 거점(내 나라 도시·내 시작 도시). 둘 다 없을 때만 출발 자리(옛 줄), 그것도 없으면 그대로.
// - 채집 줄은 조우로 끝나지 않는다: 전투 뒤 다시 잇고(그 오브젝트로), 가방이 찼으면 모든 화물을 가장 가까운 넣는 곳에 넣은 뒤 다시 캔다
//   (gather/service.ts resume). 재정비가 필요하면 줄을 끝내고 거점으로.
// 바뀜 (fixes-1116l, 질문 2138 → 보기 나 — D-570 1908 "이기면 원래 길을 다시 가되 AI가 다시 판단" 해석): 창고에서 정리를 마치면(들어가기 결과가
//   넣음·안에 머묾) 원래 목표로 다시 간다(afterUnloadGoal — 채집 줄이 넣은 뒤 다시 캐는 것과 같은 이어 가기, resume과 같은 travel.start). 배치가 되면
//   (일하는 건물) 그대로 둔다. 거점·출발 자리로 간 정리(창고가 없음)는 화물을 넣지 못해 다시 가지 않는다.
// [임시] 다시 판단 자료는 메모리에만 두어 다시 켜면 버린다(유닛은 멈춘 자리에 선다 — 질문 2034).
import type { GatherEnterResult } from "@terra/shared/gather";
import type { EncounterCoefficients } from "@terra/sim";
import { injuryAt, unavailable } from "../world/unitCondition.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { HaltedTrip, TravelCommandResult, TravelService } from "./serviceTypes.ts";

/** 결과 적용 뒤 다시 판단하기까지 여유(ms) */
export const RECHECK_SLACK_MS = 2_000;
/** 다른 2차맵 창고로 간 유닛이 닿았는지 다시 보는 간격(ms)과 횟수 — 도착 예상 시각 뒤부터 */
export const ARRIVAL_RETRY_MS = 30_000;
export const ARRIVAL_RETRIES = 6;

export type AfterChoice = "resume" | "unload" | "regroup" | "stay";

export interface AfterInput {
  /** 전투가 끝났을 때 서 있었나(결과 stays) */
  readonly stays: boolean;
  /** 지금 움직일 수 있나(빨강 부상·포로가 아님) */
  readonly available: boolean;
  readonly hp: number;
  readonly maxHp: number;
  /** 부상 단계 1 이상 */
  readonly injured: boolean;
  readonly cargoGrams: bigint;
  readonly capacityGrams: number;
  /** 정리·재정비로 갈 곳이 있나(창고·거점·출발 자리 가운데 하나) */
  readonly hasOrigin: boolean;
}

/** 다시 판단(순수) */
export function afterEncounterChoice(
  input: AfterInput,
  rules: Pick<EncounterCoefficients, "fullPm" | "regroupHpPm">,
): AfterChoice {
  if (!input.stays || !input.available) return "stay";
  const full =
    input.capacityGrams > 0 &&
    input.cargoGrams * 1000n >= BigInt(Math.max(0, rules.fullPm)) * BigInt(input.capacityGrams);
  if (full) return input.hasOrigin ? "unload" : "stay";
  const hurt = input.injured || input.hp * 1000 < rules.regroupHpPm * input.maxHp;
  if (hurt) return input.hasOrigin ? "regroup" : "stay";
  return "resume";
}

/** 2차맵 칸 */
export interface Spot {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** 조우 전투에서 멈춘 채집 줄(gather suspend) */
export interface HaltedGather {
  readonly unitId: number;
  readonly ownerId: number;
  readonly userId: string;
}

export interface AfterEncounterDeps {
  readonly maps: ReadonlyMap<number, Pick<SecondMap, "unitInfo">>;
  readonly travel: Pick<TravelService, "start">;
  readonly battle: (battleId: number) => Promise<
    | {
        readonly status: string;
        readonly outcome: {
          readonly units: readonly { readonly unit: number; readonly outcome: string; readonly hp: number }[];
        } | null;
      }
    | undefined
  >;
  /** 시작 자료의 최대 HP(유닛 ID → maxHp) */
  readonly maxHp: (unitId: number) => number | undefined;
  readonly cargoGrams: (ownerId: number, unitId: number) => bigint;
  readonly capacityGrams: () => number;
  readonly rules: () => Pick<EncounterCoefficients, "fullPm" | "regroupHpPm">;
  /** 그 유닛의 지금 자리(띄운 2차맵·좌표 유닛). 없으면 undefined */
  readonly where?: ((unitId: number) => Spot | undefined) | undefined;
  /** 가장 가까운 내 창고(encounterHome.ts). 없으면 undefined */
  readonly warehouse?:
    | ((ownerId: number, from: Spot) => (Spot & { readonly buildingId: number }) | undefined)
    | undefined;
  /** 가장 가까운 거점(내 나라 도시·시작 도시). 없으면 undefined */
  readonly base?: ((ownerId: number, from: Spot) => Spot | undefined) | undefined;
  /** 채집 서비스 몫(없으면 채집 줄은 다시 잇지 않는다) */
  readonly gather?:
    | {
        resume(unitId: number, unload: boolean): Promise<"object" | "deposit" | "ended">;
        drop(unitId: number): void;
        enter(
          userId: string,
          input: { unitId: number; buildingId: number },
          then?: (result: GatherEnterResult) => void,
        ): Promise<{ readonly ok: boolean }>;
      }
    | undefined;
  /** 나중에 부르기(다른 2차맵 창고 도착 확인). 없으면 확인하지 않는다 */
  readonly later?: ((run: () => void, delayMs: number) => void) | undefined;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
}

export interface AfterCounts {
  resume: number;
  unload: number;
  regroup: number;
  stay: number;
}

/** 그 유닛이 띄운 2차맵 위에 있으면 그 2차맵 키 */
function loadedMapOf(deps: AfterEncounterDeps, unitId: number): number | undefined {
  for (const [mapKey, map] of deps.maps) if (map.unitInfo(unitId)) return mapKey;
  return undefined;
}

/**
 * 창고에서 정리를 마친 뒤 갈 곳(질문 2138 고침 — 보기 나: 원래 목표로 다시, D-570 1908 해석). 사용자 정정이 오면 이 함수만 바꾼다(null = 창고에 머묾)
 */
export function afterUnloadGoal(
  trip: Pick<HaltedTrip, "target" | "kind">,
): { readonly target: Spot; readonly kind: HaltedTrip["kind"] } | null {
  return { target: trip.target, kind: trip.kind };
}

/** 들어간 뒤 할 일(정리를 마친 뒤 원래 목표로) — 들어가기 결과를 받는다 */
type AfterEnter = (result: GatherEnterResult) => void;

/** 다른 2차맵 창고로 보낸 유닛이 닿으면 들어가기(화물 넣기). 아직이면 ARRIVAL_RETRY_MS 뒤 다시 */
function enterWhenArrived(
  deps: AfterEncounterDeps,
  userId: string,
  unitId: number,
  goal: Spot & { readonly buildingId: number },
  delayMs: number,
  left: number,
  then: AfterEnter | undefined,
): void {
  const { later, gather } = deps;
  if (!later || !gather || left <= 0) return;
  later(() => {
    if (loadedMapOf(deps, unitId) !== goal.mapKey) {
      enterWhenArrived(deps, userId, unitId, goal, ARRIVAL_RETRY_MS, left - 1, then);
      return;
    }
    gather
      .enter(userId, { unitId, buildingId: goal.buildingId }, then)
      .catch((error: unknown) => deps.log.error({ err: error, unitId }, "travel: unload enter failed"));
  }, delayMs);
}

/** 정리를 마친 뒤 원래 목표로 다시 보내는 할 일(배치됨 — 일하는 건물 — 이면 그대로). 갈 곳이 없으면 undefined */
function resumeAfterUnload(
  deps: AfterEncounterDeps,
  trip: HaltedTrip,
  battleId: number,
): AfterEnter | undefined {
  const next = afterUnloadGoal(trip);
  const userId = trip.userId;
  if (!next || userId === null) return undefined;
  return (result) => {
    if (result === "assigned") return;
    deps.travel
      .start(userId, {
        unitId: trip.unitId,
        mapKey: next.target.mapKey,
        x: next.target.x,
        y: next.target.y,
        kind: next.kind,
      })
      .then((sent) =>
        deps.log.info(
          { unitId: trip.unitId, battleId, ok: sent.ok, code: sent.ok ? undefined : sent.code },
          "travel: resumed after unload",
        ),
      )
      .catch((error: unknown) =>
        deps.log.error({ err: error, unitId: trip.unitId, battleId }, "travel: resume after unload failed"),
      );
  };
}

/** 정리·재정비 갈 곳: 창고(정리만) → 거점 → 출발 자리 */
function goalOf(
  deps: AfterEncounterDeps,
  choice: "unload" | "regroup",
  ownerId: number,
  from: Spot | undefined,
  origin: Spot | null,
): (Spot & { readonly buildingId?: number }) | null {
  if (from) {
    const store = choice === "unload" ? deps.warehouse?.(ownerId, from) : undefined;
    if (store) return store;
    const home = deps.base?.(ownerId, from);
    if (home) return home;
  }
  return origin;
}

/** 정리·재정비 이동을 보낸다(같은 2차맵 창고면 들어가기로 바로 넣는다). then = 창고에 들어간 뒤 할 일 */
async function sendHome(
  deps: AfterEncounterDeps,
  userId: string,
  unitId: number,
  goal: Spot & { readonly buildingId?: number },
  then?: AfterEnter,
): Promise<{ readonly ok: boolean; readonly code?: string | undefined }> {
  const buildingId = goal.buildingId;
  if (buildingId !== undefined && deps.gather && loadedMapOf(deps, unitId) === goal.mapKey) {
    const entered = await deps.gather.enter(userId, { unitId, buildingId }, then);
    if (entered.ok) return { ok: true };
  }
  const started: TravelCommandResult = await deps.travel.start(userId, {
    unitId,
    mapKey: goal.mapKey,
    x: goal.x,
    y: goal.y,
    kind: "move",
  });
  if (started.ok && buildingId !== undefined)
    enterWhenArrived(
      deps,
      userId,
      unitId,
      { ...goal, buildingId },
      Math.max(0, (started.arriveAt ?? deps.now()) - deps.now()) + RECHECK_SLACK_MS,
      ARRIVAL_RETRIES,
      then,
    );
  return started.ok ? { ok: true } : { ok: false, code: started.code };
}

/** 조우 전투 하나의 멈춘 길·채집 줄을 끝 시각 뒤에 다시 판단한다. 결과 수(시험) */
export async function reconsiderTrips(
  deps: AfterEncounterDeps,
  battleId: number,
  trips: readonly HaltedTrip[],
  gathers: readonly HaltedGather[] = [],
): Promise<AfterCounts> {
  const counts: AfterCounts = { resume: 0, unload: 0, regroup: 0, stay: 0 };
  const row = await deps.battle(battleId);
  const outcome = row?.outcome;
  if (!outcome) {
    counts.stay += trips.length + gathers.length;
    for (const halted of gathers) deps.gather?.drop(halted.unitId);
    return counts;
  }
  const at = deps.now();
  const rules = deps.rules();
  const judge = (unitId: number, ownerId: number, player: boolean, hasGoal: boolean): AfterChoice => {
    const result = outcome.units.find((unit) => unit.unit === unitId);
    let info: ReturnType<SecondMap["unitInfo"]>;
    for (const map of deps.maps.values()) info ??= map.unitInfo(unitId);
    return afterEncounterChoice(
      {
        stays: result?.outcome === "stays" && player,
        available: info !== undefined && !unavailable(info.condition, at),
        hp: result?.hp ?? 0,
        maxHp: deps.maxHp(unitId) ?? 1,
        injured: info !== undefined && injuryAt(info.condition, at) > 0,
        cargoGrams: deps.cargoGrams(ownerId, unitId),
        capacityGrams: deps.capacityGrams(),
        hasOrigin: hasGoal,
      },
      rules,
    );
  };

  for (const trip of trips) {
    const from = deps.where?.(trip.unitId);
    const hasGoal = trip.origin !== null || from !== undefined;
    const choice = judge(trip.unitId, trip.ownerId, trip.userId !== null, hasGoal);
    const goal =
      choice === "resume"
        ? trip.target
        : choice === "stay"
          ? null
          : goalOf(deps, choice, trip.ownerId, from, trip.origin);
    if (choice !== "stay" && !goal) {
      counts.stay += 1;
      continue;
    }
    counts[choice] += 1;
    if (!goal || trip.userId === null) continue;
    try {
      const sent =
        choice === "resume"
          ? await deps.travel.start(trip.userId, {
              unitId: trip.unitId,
              mapKey: goal.mapKey,
              x: goal.x,
              y: goal.y,
              kind: trip.kind,
            })
          : await sendHome(
              deps,
              trip.userId,
              trip.unitId,
              goal,
              choice === "unload" ? resumeAfterUnload(deps, trip, battleId) : undefined,
            );
      deps.log.info(
        { unitId: trip.unitId, battleId, choice, ok: sent.ok, code: sent.ok ? undefined : sent.code },
        "travel: after encounter",
      );
    } catch (error) {
      deps.log.error({ err: error, unitId: trip.unitId, battleId }, "travel: after encounter failed");
    }
  }

  for (const halted of gathers) {
    const gather = deps.gather;
    if (!gather) break;
    // 채집 줄은 넣는 곳을 스스로 찾는다(정리 = 줄 안에서). 재정비만 거점이 필요하다
    const from = deps.where?.(halted.unitId);
    const choice = judge(halted.unitId, halted.ownerId, true, true);
    try {
      if (choice === "stay") {
        gather.drop(halted.unitId);
        counts.stay += 1;
      } else if (choice === "regroup") {
        gather.drop(halted.unitId);
        const goal = from ? deps.base?.(halted.ownerId, from) : undefined;
        if (goal) {
          const sent = await sendHome(deps, halted.userId, halted.unitId, goal);
          deps.log.info({ unitId: halted.unitId, battleId, choice, ok: sent.ok }, "gather: after encounter");
          counts.regroup += 1;
        } else counts.stay += 1;
      } else {
        const resumed = await gather.resume(halted.unitId, choice === "unload");
        counts[resumed === "ended" ? "stay" : choice] += 1;
        deps.log.info({ unitId: halted.unitId, battleId, choice, resumed }, "gather: after encounter");
      }
    } catch (error) {
      deps.log.error({ err: error, unitId: halted.unitId, battleId }, "gather: after encounter failed");
    }
  }
  return counts;
}
