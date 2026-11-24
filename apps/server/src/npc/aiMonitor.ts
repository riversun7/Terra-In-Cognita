// NPC AI 작동 모니터(/dev/npc-ai [모니터] 탭) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (모니터 탭)".
// 읽기만 한다. 거울 세계 휴먼(만족도·식사 몫·임금·일꾼 차례·지시 불복)과 가문 일 지시의 마지막 계획(laborOrders.ts), 가문 금고 잔고,
// 마지막 하루 끝(가문세·돌봄 배당)·마지막 일 지시 점검을 한 장으로 모은다. 부를 때마다 휴먼을 한 번 훑는다(개발 화면 조회 — 판정을 바꾸지 않는다).
import type { CityLaborPlan, HouseFlag, HouseStatus } from "@terra/sim/npcAi";

/** 도시 한 줄 */
export interface AiMonitorCity {
  readonly id: number;
  readonly name: string | null;
  readonly owner: number;
  /** 경비대가 아닌 휴먼·경비대 */
  readonly humans: number;
  readonly guards: number;
  /** 그날 지시 불복(일꾼에서 빠짐)·도시가 부른 가문 없는 휴먼 */
  readonly strikes: number;
  readonly drafted: number;
  /** 그날 임금 틀 안인데 못 받은 휴먼·못 먹은(몫 500‰ 아래) 휴먼 */
  readonly unpaid: number;
  readonly unfed: number;
  /** 평균 만족도(점)·평균 식사 몫(‰, 모르는 휴먼은 뺀다 — 아무도 모르면 null) */
  readonly avgSatisfaction: number;
  readonly avgFedPm: number | null;
  readonly houses: number;
  /** 깃발이 선 가문 수(깃발마다) */
  readonly flags: Readonly<Record<HouseFlag, number>>;
}

/** 가문 한 줄(도시를 골랐을 때) */
export interface AiMonitorHouse {
  readonly id: number;
  readonly name: string | null;
  readonly head: number | null;
  readonly status: HouseStatus;
  readonly flags: readonly HouseFlag[];
  /** 가문 금고 잔고(최소 단위, 글자) — 그 도시 주인 화폐. 금고가 없으면 "0" */
  readonly vault: string;
}

export interface AiMonitorView {
  readonly generatedAt: number;
  /** 지금 날(사회 규칙의 하루 끝 수) */
  readonly day: number;
  /** 스위치(설정 칸 값 그대로) */
  readonly switches: { readonly npcAi: number; readonly unitAi: number; readonly houseAi: number };
  readonly totals: {
    readonly cities: number;
    readonly humans: number;
    readonly guards: number;
    readonly strikes: number;
    readonly drafted: number;
    readonly unpaid: number;
    readonly unfed: number;
    readonly houses: number;
    readonly flaggedHouses: number;
    readonly avgSatisfaction: number;
  };
  /** 마지막 하루 끝의 가문세·돌봄 배당(이 서버가 켜진 뒤 아직 없으면 null) */
  readonly lastHouseDay: { readonly atMs: number; readonly taxed: number; readonly cared: number } | null;
  /** 마지막으로 일꾼 차례가 바뀐 점검(없으면 null)·지금까지 바뀐 도시 수 합 */
  readonly lastLaborChange: { readonly atMs: number; readonly cities: number } | null;
  readonly laborChanges: number;
  /** 도시 표(지시 불복 많은 차례, 그다음 도시 ID) */
  readonly cities: readonly AiMonitorCity[];
  /** 고른 도시의 가문 표(도시를 고르지 않았거나 없는 도시면 null) */
  readonly city: { readonly id: number; readonly houses: readonly AiMonitorHouse[] } | null;
}

/** 표에 싣는 도시 수 상한 */
export const AI_MONITOR_CITY_LIMIT = 300;

const NO_FLAGS: Readonly<Record<HouseFlag, number>> = { food_short: 0, morale_low: 0, unruly: 0 };

interface MonitorUnit {
  readonly city: number;
  readonly guard?: boolean | undefined;
  readonly satisfactionMilli: number;
  readonly fedPm?: number | undefined;
  readonly paidToday?: number | undefined;
  readonly onStrike?: boolean | undefined;
}

export function buildAiMonitor(o: {
  readonly nowMs: number;
  readonly day: number;
  readonly switches: AiMonitorView["switches"];
  readonly units: Iterable<MonitorUnit>;
  readonly cities: ReadonlyMap<number, { readonly owner: number }>;
  readonly planOf: (cityId: number) => CityLaborPlan | undefined;
  readonly cityName: (cityId: number) => string | undefined;
  readonly lastHouseDay: AiMonitorView["lastHouseDay"];
  readonly lastLaborChange: AiMonitorView["lastLaborChange"];
  readonly laborChanges: number;
  /** 고른 도시의 가문 줄(가문 고리가 없으면 빈 목록) */
  readonly housesOf: (cityId: number, plan: CityLaborPlan | undefined) => readonly AiMonitorHouse[];
  readonly cityId?: number | undefined;
  /** 못 먹음으로 세는 식사 몫 문턱(‰) */
  readonly unfedBelowPm: number;
}): AiMonitorView {
  const rows = new Map<
    number,
    {
      humans: number;
      guards: number;
      strikes: number;
      unpaid: number;
      unfed: number;
      sat: number;
      fed: number;
      fedN: number;
    }
  >();
  for (const unit of o.units) {
    if (!o.cities.has(unit.city)) continue;
    let row = rows.get(unit.city);
    if (!row) {
      row = { humans: 0, guards: 0, strikes: 0, unpaid: 0, unfed: 0, sat: 0, fed: 0, fedN: 0 };
      rows.set(unit.city, row);
    }
    row.sat += Math.floor(unit.satisfactionMilli / 1000);
    if (unit.fedPm !== undefined) {
      row.fed += unit.fedPm;
      row.fedN += 1;
      if (unit.fedPm < o.unfedBelowPm) row.unfed += 1;
    }
    if (unit.guard === true) {
      row.guards += 1;
      continue;
    }
    row.humans += 1;
    if (unit.onStrike === true) row.strikes += 1;
    if (unit.paidToday === 0) row.unpaid += 1;
  }
  const cities: AiMonitorCity[] = [];
  const totals = {
    cities: o.cities.size,
    humans: 0,
    guards: 0,
    strikes: 0,
    drafted: 0,
    unpaid: 0,
    unfed: 0,
    houses: 0,
    flaggedHouses: 0,
    avgSatisfaction: 0,
  };
  let satSum = 0;
  for (const [id, city] of o.cities) {
    const row = rows.get(id) ?? {
      humans: 0,
      guards: 0,
      strikes: 0,
      unpaid: 0,
      unfed: 0,
      sat: 0,
      fed: 0,
      fedN: 0,
    };
    const plan = o.planOf(id);
    const flags = { ...NO_FLAGS };
    let flagged = 0;
    for (const house of plan?.houses.values() ?? []) {
      if (house.flags.length > 0) flagged += 1;
      for (const flag of house.flags) flags[flag] += 1;
    }
    const all = row.humans + row.guards;
    const drafted = plan?.drafted.length ?? 0;
    cities.push({
      id,
      name: o.cityName(id) ?? null,
      owner: city.owner,
      humans: row.humans,
      guards: row.guards,
      strikes: row.strikes,
      drafted,
      unpaid: row.unpaid,
      unfed: row.unfed,
      avgSatisfaction: all === 0 ? 0 : Math.floor(row.sat / all),
      avgFedPm: row.fedN === 0 ? null : Math.floor(row.fed / row.fedN),
      houses: plan?.houses.size ?? 0,
      flags,
    });
    totals.humans += row.humans;
    totals.guards += row.guards;
    totals.strikes += row.strikes;
    totals.drafted += drafted;
    totals.unpaid += row.unpaid;
    totals.unfed += row.unfed;
    totals.houses += plan?.houses.size ?? 0;
    totals.flaggedHouses += flagged;
    satSum += row.sat;
  }
  const everyone = totals.humans + totals.guards;
  totals.avgSatisfaction = everyone === 0 ? 0 : Math.floor(satSum / everyone);
  const picked = o.cityId !== undefined && o.cities.has(o.cityId) ? o.cityId : undefined;
  return {
    generatedAt: o.nowMs,
    day: o.day,
    switches: o.switches,
    totals,
    lastHouseDay: o.lastHouseDay,
    lastLaborChange: o.lastLaborChange,
    laborChanges: o.laborChanges,
    cities: cities
      .toSorted((a, b) => b.strikes - a.strikes || b.unfed - a.unfed || a.id - b.id)
      .slice(0, AI_MONITOR_CITY_LIMIT),
    city: picked === undefined ? null : { id: picked, houses: o.housesOf(picked, o.planOf(picked)) },
  };
}
