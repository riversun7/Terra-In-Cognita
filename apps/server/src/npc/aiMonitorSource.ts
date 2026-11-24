// 작동 모니터의 읽는 몫(aiMonitor.ts 집계에 넣는 1차 값) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (모니터 개편)".
// 2차맵 몸(지금 하는 일·움직임·부상)과 도시 경제(쉼터 계획·시설·생필품 재고·국고)를 읽기만 한다(계정·사건을 만들지 않는다).
import { arrivalAt } from "@terra/sim";
import type { SimWorld } from "@terra/sim";
import { botActivity } from "../world/bots.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { injuryAt, unavailable } from "../world/unitCondition.ts";
import type { MonitorBody, MonitorCityEcon } from "./aiMonitor.ts";
import type { ServerEconomy } from "./economy.ts";

type BodyMap = Pick<SecondMap, "unitInfo">;

/** 더 낼 수 있는 횟수 표시 상한(그 위는 "넉넉함") */
const ROUNDS_CAP = 9_999;

/**
 * 유닛의 2차맵 몸: 사는 도시 2차맵에 서 있으면 지금 하는 일·움직임, 다른 2차맵에 서 있으면 "다른 곳"(travel), 어디에도 없으면 null.
 * 부상 단계는 몸의 상태(없으면 0)
 */
export function monitorBodyOf(
  maps: ReadonlyMap<number, BodyMap>,
  homeMapKey: number | undefined,
  unitId: number,
  nowMs: number,
): { readonly body: MonitorBody | null; readonly injury: number } {
  const home = homeMapKey === undefined ? undefined : maps.get(homeMapKey);
  let info = home?.unitInfo(unitId);
  let elsewhere = false;
  if (!info) {
    for (const [key, map] of maps) {
      if (key === homeMapKey) continue;
      info = map.unitInfo(unitId);
      if (info) break;
    }
    elsewhere = info !== undefined;
  }
  if (!info) return { body: null, injury: 0 };
  const arriveAt = arrivalAt(info.motion);
  const moving = nowMs < arriveAt;
  const worker = info.home?.work !== undefined || info.home?.cityJob === true;
  const base = { worker, moving, idleMs: moving ? 0 : nowMs - arriveAt };
  const injury = injuryAt(info.condition, nowMs);
  if (unavailable(info.condition, nowMs)) return { body: { ...base, activity: "down" }, injury };
  if (elsewhere || info.held === true || info.aboard !== undefined)
    return { body: { ...base, activity: "travel" }, injury };
  if (!info.home) return { body: { ...base, activity: "rest" }, injury };
  const now = botActivity(info.home, unitId, nowMs);
  const activity: MonitorBody["activity"] =
    now.state === "work" ? (now.job === "haul" ? "haul" : now.job === "post" ? "post" : "forage") : now.state;
  return { body: { ...base, activity }, injury };
}

/** 도시 경제 몫: 쉼터 계획·시설·생필품 재고·국고 */
export function monitorCityEcon(
  econ: Pick<ServerEconomy, "economy" | "restPlan" | "production">,
  world: Pick<SimWorld, "book" | "cities">,
  cityId: number,
): MonitorCityEcon | undefined {
  const city = world.cities.get(cityId);
  if (!city) return undefined;
  const rest = econ.restPlan(cityId);
  let bedsUsed = 0;
  for (const used of rest?.occupancy.values() ?? []) bedsUsed += used;
  const units = econ.economy.cityUnits.get(cityId) ?? 0;
  const currency = econ.economy.currencyOf.get(city.owner) ?? null;
  return {
    rests: rest?.workers.map((worker) => worker.place.kind) ?? [],
    beds: rest?.bedTotal ?? 0,
    bedsUsed,
    capBeds: rest?.capBeds ?? 0,
    facilities: econ.production(cityId).map((run) => ({
      id: run.facility.id,
      buildingId: run.buildingId,
      facility: run.facility.recipe.facility,
      recipe: run.facility.recipe.id,
      level: run.facility.level,
      workers: run.facility.workers,
      running: run.facility.pending !== undefined,
      endsAtMs: run.endsAtMs,
      dutyPm: run.facility.dutyPm ?? 1000,
    })),
    stocks: econ.economy.catalog.necessities.map((spec) => {
      const have = world.book.balanceOf(city.owner, spec.asset, cityId);
      const perRound = spec.perUnit * BigInt(units);
      const rounds = perRound > 0n ? have / perRound : null;
      const capped = rounds === null ? null : rounds > BigInt(ROUNDS_CAP) ? ROUNDS_CAP : Number(rounds);
      return {
        asset: spec.asset,
        have: String(have),
        perRound: String(perRound),
        rounds: capped,
        periodHours: spec.periodHours,
        coverHours: capped === null ? null : capped * spec.periodHours,
      };
    }),
    due: econ.economy.today.dueByCity.get(cityId) ?? 0,
    short: econ.economy.today.shortByCity.get(cityId) ?? 0,
    treasury: currency === null ? null : String(world.book.balanceOf(city.owner, currency)),
    currency,
  };
}
