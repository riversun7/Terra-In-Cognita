// 생산 시안 자료 — 시설·생산 예약·반복 예약·급여(D-114·D-6016·D-431·D-432). 서버가 생산을 아직 돌리지 않아(R2 ADR "결과")
// 화면 모양을 보려는 것이다(dev·admin 시안 자료에서만). 시설·레시피는 팩 목록에 있는 것만 쓴다.
// - 걸리는 시간은 sim 생산 규칙(batchDurationMs: 작업량 × 1시간 ÷ 일꾼 효율 합, R2 ADR 2절)으로 계산한다. 효율은 [임시] 1000.
// - 레벨·일꾼 수·상태·급여 값은 모두 [임시]다.
import type {
  EconomyCatalogResponse,
  FacilityStatus,
  ProductionFacility,
  RepeatOrder,
  WageLine,
} from "@terra/shared/economy";
import { BASE_EFFICIENCY, batchDurationMs } from "@terra/sim";
import { PREVIEW_CITIES, cityCurrency } from "./previewWorld.ts";

interface FacilityPlan {
  readonly facility: string;
  readonly city: number;
  readonly level: number;
  readonly workers: number;
  readonly status: FacilityStatus;
  /** 지금 돌리는 묶음이 얼마나 됐는지(천분율) */
  readonly progressPm: number;
  /** 예약 묶음 수(0이면 예약 없음) */
  readonly queued: number;
  /** 평균 효율점수(급여 줄) */
  readonly efficiency: number;
  /** 고용주 조정(만분율) */
  readonly adjustBp: number;
}

const PLANS: readonly FacilityPlan[] = [
  {
    facility: "farm",
    city: 0,
    level: 2,
    workers: 18,
    status: "running",
    progressPm: 620,
    queued: 2,
    efficiency: 1080,
    adjustBp: 500,
  },
  {
    facility: "mine",
    city: 1,
    level: 1,
    workers: 10,
    status: "running",
    progressPm: 240,
    queued: 0,
    efficiency: 940,
    adjustBp: 0,
  },
  {
    facility: "smelter",
    city: 0,
    level: 2,
    workers: 12,
    status: "no_input",
    progressPm: 0,
    queued: 4,
    efficiency: 1210,
    adjustBp: -300,
  },
  {
    facility: "workshop",
    city: 0,
    level: 3,
    workers: 25,
    status: "running",
    progressPm: 810,
    queued: 3,
    efficiency: 1000,
    adjustBp: 1000,
  },
  {
    facility: "kitchen",
    city: 1,
    level: 1,
    workers: 0,
    status: "idle",
    progressPm: 0,
    queued: 0,
    efficiency: 0,
    adjustBp: 0,
  },
  {
    facility: "lumber_camp",
    city: 3,
    level: 1,
    workers: 10,
    status: "storage_full",
    progressPm: 0,
    queued: 1,
    efficiency: 990,
    adjustBp: 0,
  },
];

/** [임시] 도시 기준 단가(하루, 기준 통화 최소 단위). 다른 화폐는 도시 화폐 배율로 바꾼다 */
const BASE_WAGE = 2_400n;

export function previewProduction(
  catalog: EconomyCatalogResponse,
  now: number,
): { facilities: ProductionFacility[]; repeats: RepeatOrder[]; wages: WageLine[] } {
  const facilityById = new Map(catalog.facilities.map((facility) => [facility.id, facility]));
  const facilities: ProductionFacility[] = [];
  const wages: WageLine[] = [];
  for (const [index, plan] of PLANS.entries()) {
    const facility = facilityById.get(plan.facility);
    const recipe = catalog.recipes.find((entry) => entry.facility === plan.facility);
    const city = PREVIEW_CITIES[plan.city];
    if (!facility || !recipe || !city) continue;
    const id = `f${index + 1}`;
    const duration = batchDurationMs(recipe.work, plan.workers * BASE_EFFICIENCY);
    const running = plan.status === "running" && duration !== undefined;
    const startedAt = running ? now - Math.round((duration * plan.progressPm) / 1000) : 0;
    facilities.push({
      id,
      facility: plan.facility,
      place: city.name,
      level: plan.level,
      workers: plan.workers,
      slots: plan.level * facility.slotsPerLevel,
      status: plan.status,
      current: running ? { recipe: recipe.id, startedAt, endsAt: startedAt + duration } : null,
      queue: plan.queued > 0 ? [{ recipe: recipe.id, batches: plan.queued }] : [],
    });
    const currency = cityCurrency(catalog, city);
    if (plan.workers > 0 && currency !== null) {
      wages.push({
        job: plan.facility,
        place: city.name,
        workers: plan.workers,
        efficiency: plan.efficiency,
        baseWage: String((BASE_WAGE * BigInt(city.currencyPm)) / 1000n),
        adjustBp: plan.adjustBp,
        currency,
      });
    }
  }
  const idOf = (facility: string): string | undefined => facilities.find((f) => f.facility === facility)?.id;
  const recipeOf = (facility: string): string | undefined =>
    catalog.recipes.find((entry) => entry.facility === facility)?.id;
  const repeats: RepeatOrder[] = [];
  const addRepeat = (facility: string, condition: RepeatOrder["condition"], enabled: boolean): void => {
    const id = idOf(facility);
    const recipe = recipeOf(facility);
    if (id === undefined || recipe === undefined) return;
    repeats.push({ id: `r${repeats.length + 1}`, facility: id, recipe, condition, enabled });
  };
  addRepeat("kitchen", { kind: "below", item: "ration", qty: "200" }, true);
  addRepeat("mine", { kind: "every", hours: 6 }, true);
  addRepeat("smelter", { kind: "below", item: "iron_ingot", qty: "50" }, false);
  return { facilities, repeats, wages };
}
