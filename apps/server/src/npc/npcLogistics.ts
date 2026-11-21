// NPC 물류센터 — 기획 대조 2301(질문 docs/questions/2026-11-16-haul-2.md — 일정 확인 "다음 NPC 경제 줄기에서 둘을 함께"), D-555 1505("운반을 대행하는
// 서비스업종도 존재한다(물류센터같이)")·1509("NPC만으로도 그대로 똑같이")·D-554(세력 성향마다 다양한 변수). docs/adr/2026-11-16-logistics-center.md
// "바뀜 (house-10)". 판정(시뮬)에는 쓰지 않는다 — 시뮬 도시에는 물류센터가 없다(SIM_VERSION 그대로).
// - 운반꾼(NPC 시설 일꾼 배치 규칙을 이어 쓴다): 그 도시 휴먼을 유닛 ID 차례로 도시 경제 시설(건물 → 도시 직무)에 먼저 나눈 뒤(@terra/sim
//   cityWorkerUnits — 임금·보이는 일터와 같은 나눔), 남은 일 없는 휴먼(경비대 빼고)을 그 도시 주인 나라의 물류센터(다 지은 것, 건물 ID 차례)에 자리 수
//   (레벨 × 팩 slotsPerLevel)만큼 앞에서부터 세운다. 운반꾼은 물류센터 일꾼과 같다: 채집 세계 운반 길(gather/station.ts carry)이 맡긴 짐을 그 휴먼에게
//   지운다(gather/world.ts가 노동 계약 일꾼이 없는 물류센터에 이 운반꾼을 넣는다). 보이는 일터도 그 물류센터 둘레(humanPlaces.ts — 시설 차례 맨 뒤).
//   운반꾼 임금은 없다(요금은 물류센터 금고 → NPC 자동 정산으로 국고) [임시 질문 2343]. 적정가의 인건비는 NPC 기준 임금 시간당(npcBaseDailyWage ÷ 24).
// - 증축(성향 가중): 그 도시에서 운반꾼을 기다리는 NPC 운반 일 수 × 상업 성향 배율(가장 낮음 500‰ ~ 가장 높음 1500‰, rulingSpend.ts traitScalePm)이
//   설정 칸 logistics_npc_build_waits 이상이고 도시 휴먼이 logistics_npc_build_humans 이상이면 증축 목표에 물류센터 하나(npc/cityBuild.ts — 거래소·부두와
//   같은 서버 목표). 기획의 "확장" 성향 축은 없어 상업 성향만 쓴다(질문 2344). 지으면 haul-2의 NPC 맡기기(logistics/npcOutsource.ts)가 그 물류센터를 고른다.
// 정수만 쓴다.
import {
  type SimCity,
  type SimUnit,
  type SocietyCoefficients,
  cityUnitOrder,
  cityWorkerUnits,
  npcBaseDailyWage,
} from "@terra/sim";
import type { WorkFacility } from "./humanPlaces.ts";
import { traitScalePm } from "./rulingSpend.ts";

/** 보이는 일터 차례(humanPlaces.ts는 시설 ID 차례로 나눈다): 물류센터 일꾼은 도시 경제 시설(건물·도시 직무 1조 + …) 뒤 */
export const LOGISTICS_WORK_BASE = 2_000_000_000_000;
/** 운반꾼 표를 다시 세는 간격(ms) — 짐을 맡길 때마다 도시 휴먼을 다시 훑지 않게 */
const STAFF_TTL_MS = 1_000;

/** 물류센터 하나(건물 ID·운반꾼 자리 수) */
export interface NpcCenterSlots {
  readonly buildingId: number;
  readonly slots: number;
}

/** 물류센터마다 운반꾼(순수 함수): idle = 일 없는 휴먼(차례 그대로), centers = 건물 ID 차례로 자리 수만큼 앞에서부터 */
export function assignCenterStaff(
  idle: readonly number[],
  centers: readonly NpcCenterSlots[],
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  let next = 0;
  for (const center of centers.toSorted((a, b) => a.buildingId - b.buildingId)) {
    const staff: number[] = [];
    for (let i = 0; i < center.slots && next < idle.length; i++) {
      const unitId = idle[next];
      next += 1;
      if (unitId !== undefined) staff.push(unitId);
    }
    out.set(center.buildingId, staff);
  }
  return out;
}

/** 증축 규칙(설정 칸) */
export interface CenterBuildRule {
  readonly traitMin: number;
  readonly traitMax: number;
  readonly npcBuildWaits: number;
  readonly npcBuildHumans: number;
}

/** 물류센터를 증축 목표에 넣나(순수 함수 — 위 머리 주석) */
export function wantsCenter(
  input: { readonly waiting: number; readonly humans: number; readonly commerce: number },
  rule: CenterBuildRule,
): boolean {
  const waits = Math.max(1, Math.trunc(rule.npcBuildWaits));
  if (input.humans < Math.max(0, Math.trunc(rule.npcBuildHumans))) return false;
  return input.waiting * traitScalePm(input.commerce, rule) >= waits * 1000;
}

/** 시설 정의 몫(팩 — facilities/catalog.ts FacilityDef) */
interface CenterDef {
  readonly logistics?: true | undefined;
  readonly slotsPerLevel: number;
}

export interface NpcLogisticsDeps {
  readonly world: {
    readonly cities: ReadonlyMap<number, Pick<SimCity, "owner">>;
    readonly units: ReadonlyMap<number, Pick<SimUnit, "id" | "city" | "guard" | "owner">>;
  };
  readonly economy: { readonly facilities: Parameters<typeof cityWorkerUnits>[1]["facilities"] };
  /** 그 도시에 선 시설(다 지은 것, 일하는 상태 — npc/economy.ts NpcEconomyInput.facilitiesIn) */
  facilitiesIn(cityId: number): readonly {
    readonly buildingId: number;
    readonly facility: string;
    readonly level: number;
    readonly ownerId: number | null;
  }[];
  /** 시설 정의(없으면 물류센터 없음) */
  defOf(facilityId: string): CenterDef | undefined;
  /** 건물이 선 도시(모르면 undefined) */
  cityOf(buildingId: number): number | null | undefined;
  now(): number;
}

export interface NpcLogistics {
  /** 그 NPC 물류센터의 운반꾼(유닛 ID 차례). NPC 물류센터가 아니면 빈 목록 */
  staffAt(buildingId: number): readonly number[];
  /** 보이는 일터(humanPlaces.ts 시설 줄 — 도시 경제 시설 뒤에 붙인다) */
  workFacilities(cityId: number): WorkFacility[];
}

export function createNpcLogistics(deps: NpcLogisticsDeps): NpcLogistics {
  /** 도시 → 센 시각·물류센터마다 운반꾼 */
  const cache = new Map<number, { atMs: number; staff: Map<number, number[]> }>();
  const staffOf = (cityId: number): Map<number, number[]> => {
    const nowMs = deps.now();
    const hit = cache.get(cityId);
    if (hit && nowMs - hit.atMs < STAFF_TTL_MS && nowMs >= hit.atMs) return hit.staff;
    const city = deps.world.cities.get(cityId);
    const centers: NpcCenterSlots[] = [];
    for (const entry of city ? deps.facilitiesIn(cityId) : []) {
      if (entry.ownerId !== city?.owner || entry.level < 1) continue;
      const def = deps.defOf(entry.facility);
      if (def?.logistics !== true) continue;
      centers.push({ buildingId: entry.buildingId, slots: Math.max(0, entry.level * def.slotsPerLevel) });
    }
    let staff = new Map<number, number[]>();
    if (centers.length > 0) {
      const units = cityUnitOrder(deps.world, cityId);
      const workers = new Set(cityWorkerUnits(deps.world, deps.economy, cityId, units).map((w) => w.unitId));
      const idle = units
        .filter((unit) => unit.guard !== true && !workers.has(unit.id))
        .map((unit) => unit.id);
      staff = assignCenterStaff(idle, centers);
    }
    cache.set(cityId, { atMs: nowMs, staff });
    // 사라진 도시의 표는 오래 들지 않는다(도시 수만큼만)
    if (cache.size > deps.world.cities.size + 8)
      for (const id of cache.keys()) if (!deps.world.cities.has(id)) cache.delete(id);
    return staff;
  };
  return {
    staffAt(buildingId) {
      const cityId = deps.cityOf(buildingId);
      if (cityId === null || cityId === undefined) return [];
      return staffOf(cityId).get(buildingId) ?? [];
    },
    workFacilities(cityId) {
      return [...staffOf(cityId)]
        .filter(([, staff]) => staff.length > 0)
        .map(([buildingId, staff]) => ({
          id: LOGISTICS_WORK_BASE + buildingId,
          buildingId,
          workers: staff.length,
        }));
    },
  };
}

/** 운반 길(gather/station.ts)이 받는 일꾼 줄: 노동 계약 일꾼이 없으면 NPC 운반꾼(주인 = 그 휴먼 주인) */
export function withNpcStaff<T extends { readonly unitId: number }>(
  workers: readonly T[],
  staff: readonly number[] | undefined,
  ownerOf: (unitId: number) => number | undefined,
): readonly (T | { readonly unitId: number; readonly workerOwnerId: number; readonly via: "npc" })[] {
  if (workers.length > 0 || !staff || staff.length === 0) return workers;
  return staff.flatMap((unitId) => {
    const owner = ownerOf(unitId);
    return owner === undefined ? [] : [{ unitId, workerOwnerId: owner, via: "npc" as const }];
  });
}

/** NPC 물류센터 적정가의 인건비(운반꾼 수 × NPC 기준 임금 ÷ 24 — 시간당 합, haulService.ts fair가 일꾼 수로 나눈다) */
export function npcCenterHourly(staff: number, rules: SocietyCoefficients): bigint {
  if (staff <= 0) return 0n;
  return (BigInt(Math.trunc(staff)) * npcBaseDailyWage(rules)) / 24n;
}
