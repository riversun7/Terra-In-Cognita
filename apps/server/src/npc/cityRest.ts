// NPC 도시 일꾼의 쉼터·채집소 옮김 거리(순수 함수) — 질문 1047 다·1050 가(기획 정리 D-533 "추천대로", 사용자 원문 2026-11-11 "숙소는 노동자
// 회복 루트, 창고와 원자재채집소와의 관계도 고려"), docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)".
// 도시 경제(npc/economy.ts — 생산 속도 배율·옮김 칸)와 휴먼 집·일터(npc/humanPlaces.ts — 밤에 쉬러 가는 자리)가 같은 계획을 쓴다.
// - 일꾼 차례: 시설 ID 차례로 일꾼 수만큼(humanPlaces.assignHumanPlaces가 휴먼을 나누는 차례와 같다).
// - 쉼터: 침대가 남은 숙소 가운데 돌아감(일터 → 숙소 → 시청 칸 − 일터 → 시청 칸)이 가장 작은 곳(같으면 일터에서 가까운 곳, 그다음 건물 ID) —
//   "회복 루트"(길 위 숙소)와 D-245 "가장 가까운 숙소"를 함께 본다. 침대 = 숙소 레벨 × 설정 칸 lodging_beds_per_level.
//   침대가 모자라면 집(시청 칸), 집도 모자라면 노숙. 도시 자리 수 = 주거 수(집) + 숙소 침대 합(@terra/sim cityHousingCap — 질문 1089 나, 기획 정리
//   D-534 "숙소 침대가 인구 상한을 늘림". 예전 749 다는 max(주거, 침대)). 침대를 받은 일꾼은 숙소, 나머지는 주거 수(집)까지 집이다.
// - 생산 속도 배율 = 그 시설 일꾼의 쉼터 회복·일터 ↔ 쉼터 거리 셈 배율 평균(@terra/sim restDutyPm).
// - 옮김 칸: 채집소 건물 가운데 → 그 도시 주인의 가장 가까운 창고(창고 단계 시설) 가운데, 창고가 없으면 시청 칸.
//   바뀜 (기획 D-569 1784·D-564 1626): 채집소만이 아니라 건물 시설 모두(가공 시설 산출도 창고로 나르는 시간을 센다 — 시간 자동 계산).
// 거리는 체비셰프 칸(가운데끼리, humanPlaces.nearestArea와 같다) [임시]. 정수만 쓴다.
import {
  type RestPlace,
  type SocietyCoefficients,
  TEST_JOB_RULES,
  lodgingBeds,
  restDutyPm,
  restPeriodMs,
} from "@terra/sim";
import type { TripArea } from "../world/bots.ts";

/** 도시 경제 시설 하나(일꾼 수) */
export interface RestFacility {
  readonly id: number;
  /** 건물 ID(도시 직무면 null — 일터 = 시청 칸) */
  readonly buildingId: number | null;
  readonly workers: number;
  /** 산출을 창고로 나르는 칸을 셈하나(건물 시설 — D-569 1784부터 채집소만이 아니라 모두) */
  readonly hauls?: boolean | undefined;
}

/** 숙소 하나 */
export interface RestLodging {
  readonly id: number;
  readonly area: TripArea;
  readonly level: number;
  readonly ownerId: number | null;
  /** 세계 씨앗이 세운 숙소(질문 1131 나): Lv1 침대는 시작 도시 주거에 든 것이라 인구 상한에 더하지 않는다 */
  readonly seeded?: boolean | undefined;
}

export interface CityRestInput {
  readonly facilities: readonly RestFacility[];
  /** 건물 ID → 일터 네모(humanPlaces.workAreaOf) */
  readonly areas: ReadonlyMap<number, TripArea>;
  readonly lodgings: readonly RestLodging[];
  /** 시청 칸(집) */
  readonly home: { readonly x: number; readonly y: number };
  /** 도시 주거 수 */
  readonly housing: number;
  /** 그 도시 주인의 창고 가운데들 */
  readonly stores: readonly { readonly x: number; readonly y: number }[];
  readonly rules: SocietyCoefficients;
}

/** 일꾼 하나의 쉼터 */
export interface WorkerRest {
  readonly facilityId: number;
  /** 숙소 건물 ID(집·노숙이면 null) */
  readonly lodgingId: number | null;
  readonly place: RestPlace;
  /** 일터 ↔ 쉼터 한쪽 칸 수 */
  readonly commuteCells: number;
}

/** 시설 하나의 셈 */
export interface FacilityRest {
  /** 생산 속도 배율(‰) */
  readonly dutyPm: number;
  /** 채집소 → 창고 칸(채집소가 아니면 0) */
  readonly haulCells: number;
  /** 산출을 내려놓는 곳(가장 가까운 창고 가운데, 없으면 시청 칸). 옮김이 없으면 없다 — 보이는 운반꾼의 갈 곳(D-570 1886) */
  readonly haulTo?: { readonly x: number; readonly y: number } | undefined;
}

export interface CityRestPlan {
  /** 일꾼 차례(시설 ID 차례 × 일꾼 수) */
  readonly workers: readonly WorkerRest[];
  readonly facilities: ReadonlyMap<number, FacilityRest>;
  /** 숙소 건물 ID → 쓰는 일꾼 수 */
  readonly occupancy: ReadonlyMap<number, number>;
  /** 숙소 건물 ID → 침대 수 */
  readonly beds: ReadonlyMap<number, number>;
  /** 숙소 건물 ID → 주인(요금을 받는 쪽) */
  readonly owners: ReadonlyMap<number, number | null>;
  /** 그 도시 숙소 침대 합(쉼터 자리) */
  readonly bedTotal: number;
  /**
   * 인구 상한에 더하는 침대(질문 1089 나 + 1131 나, 기획 D-535) = 침대 합 − 씨앗 숙소의 Lv1 침대. 시작 도시는 씨앗 그대로면 상한 = 주거
   * (npc_seed_housing), 씨앗 뒤에 지은 숙소(NPC 증축·플레이어)와 씨앗 숙소를 올린 레벨만큼 오른다
   */
  readonly capBeds: number;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** 가장 가까운 점(같으면 앞의 것, 없으면 undefined) */
function nearestPoint(
  from: { x: number; y: number },
  points: readonly { x: number; y: number }[],
): { x: number; y: number } | undefined {
  let best: { point: { x: number; y: number }; d: number } | undefined;
  for (const point of points) {
    const d = cheb(from, point);
    if (!best || d < best.d) best = { point, d };
  }
  return best?.point;
}

/** 가장 가까운 점까지 체비셰프 칸(없으면 undefined) */
export function nearestCells(
  from: { x: number; y: number },
  points: readonly { x: number; y: number }[],
): number | undefined {
  let best: number | undefined;
  for (const point of points) {
    const d = cheb(from, point);
    if (best === undefined || d < best) best = d;
  }
  return best;
}

/** 도시 하나의 쉼터·옮김 계획(위 머리 주석) */
export function planCityRest(input: CityRestInput): CityRestPlan {
  const { home, rules } = input;
  const lodgings = input.lodgings.toSorted((a, b) => a.id - b.id);
  const beds = new Map<number, number>();
  let bedTotal = 0;
  let capBeds = 0;
  for (const lodging of lodgings) {
    const n = lodgingBeds(lodging.level, rules);
    beds.set(lodging.id, n);
    bedTotal += n;
    capBeds += Math.max(0, n - (lodging.seeded === true ? lodgingBeds(1, rules) : 0));
  }
  // 집 자리(주거 수). 침대를 받은 일꾼은 집 자리를 쓰지 않는다 — 인구 상한 = 집 + 침대(cityHousingCap)
  const homes = Math.max(0, Math.trunc(input.housing));
  let homed = 0;
  const occupancy = new Map<number, number>();
  const workers: WorkerRest[] = [];
  const duty = new Map<number, { sum: number; n: number }>();
  for (const facility of input.facilities.toSorted((a, b) => a.id - b.id)) {
    const area = facility.buildingId === null ? undefined : input.areas.get(facility.buildingId);
    const work = area ?? home;
    const direct = cheb(work, home);
    for (let taken = 0; taken < facility.workers; taken++) {
      let best: { lodging: RestLodging; detour: number; near: number } | undefined;
      for (const lodging of lodgings) {
        if ((occupancy.get(lodging.id) ?? 0) >= (beds.get(lodging.id) ?? 0)) continue;
        const near = cheb(work, lodging.area);
        const detour = near + cheb(lodging.area, home) - direct;
        if (!best || detour < best.detour || (detour === best.detour && near < best.near))
          best = { lodging, detour, near };
      }
      let rest: WorkerRest;
      if (best) {
        occupancy.set(best.lodging.id, (occupancy.get(best.lodging.id) ?? 0) + 1);
        rest = {
          facilityId: facility.id,
          lodgingId: best.lodging.id,
          place: { kind: "lodging", level: best.lodging.level },
          commuteCells: best.near,
        };
      } else {
        rest = {
          facilityId: facility.id,
          lodgingId: null,
          place: homed < homes ? { kind: "home" } : { kind: "homeless" },
          commuteCells: direct,
        };
        homed += 1;
      }
      workers.push(rest);
      const entry = duty.get(facility.id) ?? { sum: 0, n: 0 };
      entry.sum += restDutyPm(rest.place, rest.commuteCells, rules);
      entry.n += 1;
      duty.set(facility.id, entry);
    }
  }
  const facilities = new Map<number, FacilityRest>();
  for (const facility of input.facilities) {
    const entry = duty.get(facility.id);
    const area = facility.buildingId === null ? undefined : input.areas.get(facility.buildingId);
    const haulTo = facility.hauls === true && area ? (nearestPoint(area, input.stores) ?? home) : undefined;
    const haulCells = haulTo && area ? cheb(area, haulTo) : 0;
    facilities.set(facility.id, {
      dutyPm: entry && entry.n > 0 ? Math.floor(entry.sum / entry.n) : 1000,
      haulCells,
      ...(haulTo && haulCells > 0 ? { haulTo: { x: haulTo.x, y: haulTo.y } } : {}),
    });
  }
  return {
    workers,
    facilities,
    occupancy,
    beds,
    owners: new Map(lodgings.map((l) => [l.id, l.ownerId])),
    bedTotal,
    capBeds,
  };
}

/**
 * 숙박비를 다 못 낸 일꾼(빈틈 2293 — 기획 D-555 1508 "유닛은 사유재산이 있어 당연히 자기가 내고 없으면 피로도 회복이 제대로 되지 않겠지"·1509 "NPC만으로도
 * 그대로 똑같이")의 생산 속도 배율을 다시 센다: 플레이어 일꾼(labor/workerRest.ts — 다 못 내면 노숙 회복 [임시])과 같이 그 일꾼의 회복을 노숙으로 친다.
 * 쉼터 자리·침대·오감 칸·숙박비 바퀴(restPeriodMs)는 그대로 — 플레이어 일꾼도 회복 배율만 떨어진다. unpaid = 일꾼 열쇠 "시설ID:시설 안 차례"(plan.workers의
 * 시설 안 차례). 없거나 비면 plan 그대로
 */
export function withUnpaidRest(
  plan: CityRestPlan,
  unpaid: ReadonlySet<string> | undefined,
  rules: SocietyCoefficients,
): CityRestPlan {
  if (!unpaid || unpaid.size === 0) return plan;
  const next = new Map<number, number>();
  const duty = new Map<number, { sum: number; n: number; hit: boolean }>();
  for (const rest of plan.workers) {
    const index = next.get(rest.facilityId) ?? 0;
    next.set(rest.facilityId, index + 1);
    const hit = unpaid.has(`${rest.facilityId}:${index}`);
    const entry = duty.get(rest.facilityId) ?? { sum: 0, n: 0, hit: false };
    entry.sum += restDutyPm(hit ? { kind: "homeless" } : rest.place, rest.commuteCells, rules);
    entry.n += 1;
    entry.hit ||= hit;
    duty.set(rest.facilityId, entry);
  }
  const facilities = new Map(plan.facilities);
  for (const [facilityId, entry] of duty) {
    const found = facilities.get(facilityId);
    if (!entry.hit || !found || entry.n === 0) continue;
    facilities.set(facilityId, { ...found, dutyPm: Math.floor(entry.sum / entry.n) });
  }
  return { ...plan, facilities };
}

/** 플레이어 일꾼 하나(직무 배치·노동 계약)와 그 일터 건물 */
export interface PlayerWorker {
  readonly unitId: number;
  readonly buildingId: number;
}

/** 플레이어 일꾼 하나의 쉼터(질문 1088 가) */
export interface PlayerRest {
  /** 숙소 건물 ID(집이면 null) */
  readonly lodgingId: number | null;
  readonly place: RestPlace;
  /** 일터 ↔ 쉼터 한쪽 칸 수 */
  readonly commuteCells: number;
}

/**
 * 플레이어 일꾼의 쉼터(질문 1088 가, 기획 정리 D-534 "추천대로" — NPC 일꾼과 같은 숙소 규칙 D-013): 같은 도시 숙소 가운데 NPC 도시 경제 계획(taken)이
 * 쓰고 남은 침대를 유닛 ID 차례로, 일터에서 가장 가까운 곳(같으면 건물 ID)부터 나눈다. 침대가 없으면 집(숙소 없는 집 회복, lodging_home_recovery_pm)
 * [임시] — 플레이어 유닛은 도시 주거 수에 들지 않아 노숙으로 떨어지지 않는다. 일터 자리를 모르면 시청 칸
 */
export function planPlayerRest(input: {
  readonly workers: readonly PlayerWorker[];
  readonly areas: ReadonlyMap<number, TripArea>;
  readonly lodgings: readonly RestLodging[];
  /** 숙소 건물 ID → NPC 일꾼이 쓰는 침대 */
  readonly taken?: ReadonlyMap<number, number> | undefined;
  readonly home: { readonly x: number; readonly y: number };
  readonly rules: SocietyCoefficients;
}): Map<number, PlayerRest> {
  const lodgings = input.lodgings.toSorted((a, b) => a.id - b.id);
  const free = new Map<number, number>();
  for (const lodging of lodgings)
    free.set(lodging.id, lodgingBeds(lodging.level, input.rules) - (input.taken?.get(lodging.id) ?? 0));
  const out = new Map<number, PlayerRest>();
  for (const worker of input.workers.toSorted((a, b) => a.unitId - b.unitId)) {
    if (out.has(worker.unitId)) continue;
    const work = input.areas.get(worker.buildingId) ?? input.home;
    let best: { lodging: RestLodging; near: number } | undefined;
    for (const lodging of lodgings) {
      if ((free.get(lodging.id) ?? 0) <= 0) continue;
      const near = cheb(work, lodging.area);
      if (!best || near < best.near) best = { lodging, near };
    }
    if (best) {
      free.set(best.lodging.id, (free.get(best.lodging.id) ?? 0) - 1);
      out.set(worker.unitId, {
        lodgingId: best.lodging.id,
        place: { kind: "lodging", level: best.lodging.level },
        commuteCells: best.near,
      });
    } else
      out.set(worker.unitId, {
        lodgingId: null,
        place: { kind: "home" },
        commuteCells: cheb(work, input.home),
      });
  }
  return out;
}

/**
 * 쉼터 계획 일꾼의 피로 바퀴(질문 1095 가, 48 §7.1 "한도에 닿으면 스스로 숙소로"): 일 = 피로 상한 × 일 주기, 바퀴 = 일 + 쉼(쉼터 회복) + 오감
 * (@terra/sim restPeriodMs — 생산 셈 restDutyPm과 같은 바퀴). 설정 칸 worker_rest_cycle_mode가 0이면 undefined(지역 낮·밤)
 */
export function restCycleOf(
  rules: SocietyCoefficients,
): ((worker: WorkerRest) => { readonly workMs: number; readonly periodMs: number }) | undefined {
  if (Math.trunc(rules.logistics.restCycleMode) !== 1) return undefined;
  const workMs = Math.max(1, rules.fatigueMax) * TEST_JOB_RULES.cycleMs;
  return (worker) => ({ workMs, periodMs: restPeriodMs(worker.place, worker.commuteCells, rules) });
}
