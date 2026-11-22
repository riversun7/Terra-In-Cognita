// 관리인이 맡은 유닛의 부상 자율 판단(league-2, 사용자 결정 D-590 2507 가) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (league-2, D-590)".
// 사용자 원문: "유닛이 알아서 병원가서 치료하고 오든지 경미한부상은 계속 일하든지 자율판단". 관리인이 맡은 일(남의 시설 임금형 계약 — offlineSteward.ts
// stewardExemption)도 다른 일처럼 작업 중 부상(D-521)을 굴린다(정산 고리 그대로 — 새 부상 규칙 없음). 다친 유닛은 스스로 판단한다:
// - 판단(stewardTreats): D-586 유닛 2차 지수의 위험 감수(@terra/sim/npcAi deriveUnitDrives risk — 과감 6 : 호전 2 : 자치 2)와 부상 무게(단계 × 1000 ÷ 3 — 경상 333·
//   중상 666·중태 1000)를 견준다. 무게 > 위험 감수면 병원에 가고, 아니면 계속 일한다(자연 치유). 성향이 없는 유닛은 가운데(500 — 경상은 일, 중상부터 병원)
//   [임시 — 꼴은 질문 2645].
// - 병원: 그 유닛이 선 칸의 도시에서 일하는 병원(병원 서비스의 견적 — overview 옵션) 가운데 가장 빠른, 주인 지갑으로 낼 수 있는 곳에서 치료한다(hospital
//   treat — 유저가 누르는 것과 같은 명령·요금). 치료는 배율만 바꾸고 계약은 그대로라 유닛은 그 자리에서 일을 이어 간다("치료하고 오든지"). 그 도시에 병원이
//   없거나 돈이 모자라면 계속 일한다. 다른 도시 병원으로 걸어가지는 않는다 [임시 — 2645].
// - 부하: 관리인 살피기(offlineSteward.ts sweep)마다 한 번, 치료 STEWARD_CARE_PER_SWEEP번까지. 병원 서비스는 월드 밖(hospital/attach.ts)에서 만들어지므로
//   2차맵 모음(world.maps — 관리인과 같은 객체)에 붙여 둔다(attachStewardCare).
import { type UnitTraits, unitTraitsFromArray } from "@terra/shared/unitTraits";
import { deriveUnitDrives } from "@terra/sim/npcAi";
import { type UnitCondition, injuryNowOf } from "../world/unitCondition.ts";

/** [임시] 한 번 살필 때 치료하는 수 상한 */
export const STEWARD_CARE_PER_SWEEP = 20;

/** 부상 무게(0~1000): 단계 × 1000 ÷ 3(내림, 중태 = 1000) */
export const injuryWeightPm = (stage: number): number =>
  Math.min(1000, Math.floor((Math.max(0, Math.trunc(stage)) * 1000) / 3));

/** 위험 감수(0~1000): 성향 → D-586 2차 지수 risk. 성향이 없으면 가운데 500 */
export function stewardRisk(traits: UnitTraits | undefined): number {
  if (!traits) return 500;
  return deriveUnitDrives({ traits, satisfactionMilli: null, fedPm: null }).risk;
}

/** 병원에 가나: 다쳤고 부상 무게가 위험 감수보다 크다 */
export function stewardTreats(stage: number, risk: number): boolean {
  return stage > 0 && injuryWeightPm(stage) > risk;
}

/** 병원 서비스에서 쓰는 몫(hospital/service.ts HospitalService) */
export interface StewardHospital {
  overview(
    viewer: { readonly id: string; readonly devGrant: boolean },
    nowMs: number,
  ): Promise<{
    readonly units: readonly {
      readonly unit: number;
      readonly options: readonly {
        readonly buildingId: number;
        readonly cost: string;
        readonly affordable: boolean;
      }[];
    }[];
  }>;
  treat(
    userId: string,
    input: { readonly buildingId: number; readonly unit: number; readonly cost: string },
  ): Promise<{ readonly ok: boolean }>;
}

interface CareMap {
  forEachUnit(
    visit: (unit: {
      readonly id: number;
      readonly kind: number;
      readonly ownerId: number;
      readonly traits?: readonly number[] | undefined;
    }) => void,
  ): void;
  unitInfo(unitId: number): { readonly condition: UnitCondition } | undefined;
}

/** 관리인 살피기 한 번의 입력 */
export interface StewardCareInput {
  /** 관리인이 맡은 비접속 유저(소유 주체 → 사용자) */
  readonly owners: ReadonlyMap<number, string>;
  /** 관리인이 맡는 일을 하는 유닛인가(stewardExemption) */
  readonly stewarded: (unitId: number) => boolean;
  /** 관리인이 다루는 유닛 종류(고용 휴먼·사이보그 유닛) */
  readonly kinds: ReadonlySet<number>;
  readonly nowMs: number;
}

export type StewardCare = (input: StewardCareInput) => Promise<number>;

const careByMaps = new WeakMap<object, StewardCare>();

/** 2차맵 모음에 관리인 부상 판단을 붙인다(hospital/attach.ts) */
export function attachStewardCare(maps: object, care: StewardCare): void {
  careByMaps.set(maps, care);
}

/** 2차맵 모음에 붙은 관리인 부상 판단(없으면 undefined — 병원 서비스가 없는 시험·서버) */
export function stewardCareOf(maps: object): StewardCare | undefined {
  return careByMaps.get(maps);
}

/** 관리인 부상 판단을 만든다: 병원에 갈 유닛을 고르고 그 도시 병원에서 치료한다. 치료한 수 */
export function createStewardCare(o: {
  readonly maps: ReadonlyMap<number, CareMap>;
  readonly hospital: () => StewardHospital | undefined;
}): StewardCare {
  return async (input) => {
    const hospital = o.hospital();
    if (!hospital) return 0;
    // 사용자 → 병원에 갈 유닛(유닛 ID 차례)
    const goers = new Map<string, number[]>();
    for (const map of o.maps.values())
      map.forEachUnit((unit) => {
        const userId = input.owners.get(unit.ownerId);
        if (userId === undefined || !input.kinds.has(unit.kind) || !input.stewarded(unit.id)) return;
        const info = map.unitInfo(unit.id);
        if (!info || info.condition.heldBy !== null) return;
        const stage = injuryNowOf(info.condition, input.nowMs).stage;
        if (!stewardTreats(stage, stewardRisk(unitTraitsFromArray(unit.traits)))) return;
        const list = goers.get(userId) ?? [];
        list.push(unit.id);
        goers.set(userId, list);
      });
    let treated = 0;
    for (const [userId, units] of [...goers].toSorted((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const wanted = new Set(units);
      const view = await hospital.overview({ id: userId, devGrant: false }, input.nowMs);
      for (const unit of view.units.toSorted((a, b) => a.unit - b.unit)) {
        if (treated >= STEWARD_CARE_PER_SWEEP) return treated;
        if (!wanted.has(unit.unit)) continue;
        // 견적은 빠른 차례 — 낼 수 있는 첫 곳
        const option = unit.options.find((entry) => entry.affordable);
        if (!option) continue;
        const result = await hospital.treat(userId, {
          buildingId: option.buildingId,
          unit: unit.unit,
          cost: option.cost,
        });
        if (result.ok) treated += 1;
      }
    }
    return treated;
  };
}
