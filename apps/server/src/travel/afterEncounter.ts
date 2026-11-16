// 조우 뒤 다시 판단 — 기획 D-570(질문 1908 원문 "그러나 ai 다시 판단 채집하러가는데 약탈로 인벤토리가 8-90찼다면 전리품을 정리하러 가거나
// 레이드가는데 전투로 재정비가 필요하면 복귀"), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-570, 좌표 이동 3)".
// 조우로 멈춘 길(service.ts haltOn → HaltedTrip)마다 전투 결과가 적용된 뒤(끝 시각 + RECHECK_SLACK_MS) 한 번:
// - 그 유닛이 전투에서 서 있지 않았거나(퇴각·포로·안전한 곳으로 감) 지금 움직일 수 없으면(빨강 부상·포로) 그대로 둔다.
// - 짐이 운반 상한(설정 칸 gather_carry_grams — 채집 줄과 같은 걷는 화물 상한)의 encounter_full_pm 이상이면 전리품을 정리하러 출발한 자리로.
// - 남은 HP가 최대의 encounter_regroup_hp_pm 아래이거나 부상(1단계 이상)이면 재정비하러 출발한 자리로.
// - 아니면 하던 길을 다시 간다(같은 목표·같은 명령 종류).
// [임시] 돌아갈 곳 = 그 길을 보낸 자리(정찰이 돌아오는 자리와 같다). 가장 가까운 내 창고·도시는 다음 줄기(질문 2033). 다시 판단 자료는 메모리에만
// 두어 다시 켜면 버린다(유닛은 멈춘 자리에 선다 — 질문 2034). 채집 줄(gather/service.ts)은 멈추면 끝난다(다시 잇지 않는다 — 질문 2035).
import type { EncounterCoefficients } from "@terra/sim";
import { injuryAt, unavailable } from "../world/unitCondition.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { HaltedTrip, TravelService } from "./serviceTypes.ts";

/** 결과 적용 뒤 다시 판단하기까지 여유(ms) */
export const RECHECK_SLACK_MS = 2_000;

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
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
}

/** 조우 전투 하나의 멈춘 길을 끝 시각 뒤에 다시 판단한다. 결과 수(시험) */
export async function reconsiderTrips(
  deps: AfterEncounterDeps,
  battleId: number,
  trips: readonly HaltedTrip[],
): Promise<Record<AfterChoice, number>> {
  const counts: Record<AfterChoice, number> = { resume: 0, unload: 0, regroup: 0, stay: 0 };
  const row = await deps.battle(battleId);
  const outcome = row?.outcome;
  if (!outcome) {
    counts.stay += trips.length;
    return counts;
  }
  const at = deps.now();
  const rules = deps.rules();
  for (const trip of trips) {
    const result = outcome.units.find((unit) => unit.unit === trip.unitId);
    let info: ReturnType<SecondMap["unitInfo"]>;
    for (const map of deps.maps.values()) info ??= map.unitInfo(trip.unitId);
    const choice = afterEncounterChoice(
      {
        stays: result?.outcome === "stays" && trip.userId !== null,
        available: info !== undefined && !unavailable(info.condition, at),
        hp: result?.hp ?? 0,
        maxHp: deps.maxHp(trip.unitId) ?? 1,
        injured: info !== undefined && injuryAt(info.condition, at) > 0,
        cargoGrams: deps.cargoGrams(trip.ownerId, trip.unitId),
        capacityGrams: deps.capacityGrams(),
        hasOrigin: trip.origin !== null,
      },
      rules,
    );
    counts[choice] += 1;
    if (choice === "stay" || trip.userId === null) continue;
    const goal = choice === "resume" ? trip.target : trip.origin;
    if (!goal) continue;
    try {
      const started = await deps.travel.start(trip.userId, {
        unitId: trip.unitId,
        mapKey: goal.mapKey,
        x: goal.x,
        y: goal.y,
        kind: choice === "resume" ? trip.kind : "move",
      });
      deps.log.info(
        {
          unitId: trip.unitId,
          battleId,
          choice,
          ok: started.ok,
          code: started.ok ? undefined : started.code,
        },
        "travel: after encounter",
      );
    } catch (error) {
      deps.log.error({ err: error, unitId: trip.unitId, battleId }, "travel: after encounter failed");
    }
  }
  return counts;
}
