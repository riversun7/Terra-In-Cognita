// NPC AI 작동 모니터(/dev/npc-ai [작동 모니터] 탭) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (모니터 탭)"·"바뀜 (모니터 개편)".
// 읽기만 한다. "필수요소가 돌고 있나"를 유닛 → 가문 → 도시 → 세계로 같은 여섯 기둥으로 센다:
//   식사(그날 생필품 몫) · 벌이(일터·임금) · 주거(숙소·집·노숙) · 회복(부상·활동 불가) · 움직임(걷는 중·서 있음·오래 멈춤·지도에 없음) · 질서(지시 불복·만족도).
// 유닛 한 줄은 거울 세계 휴먼(식사 몫·임금·만족도·부상·불복)에 2차맵 몸(지금 하는 일·움직임, aiMonitorSource.ts)과 쉼터 계획의 자리(주거)를 붙인 것이다.
// 도시는 여기에 생산(시설이 도는가)·생필품 재고(몇 번 더 낼 수 있나)·국고를 더한다. 부를 때마다 휴먼을 한 번 훑는다(개발 화면 조회 — 판정을 바꾸지 않는다).
import type { CityLaborPlan, HouseFlag } from "@terra/sim/npcAi";

/** 유닛 문제(하나라도 있으면 문제 유닛) */
export type MonitorIssue = "unfed" | "unpaid" | "homeless" | "injured" | "strike" | "stuck" | "off_map";
export const MONITOR_ISSUES: readonly MonitorIssue[] = [
  "unfed",
  "unpaid",
  "homeless",
  "injured",
  "strike",
  "stuck",
  "off_map",
];

/**
 * 지금 하는 일: post 일터 근무 · haul 운반 · forage 둘레 채집 · need 장보기 · rest 휴식 · patrol 순찰 · evade 대피 ·
 * down 활동 불가(중태·포로) · travel 다른 곳(2차맵 사이 이동·배·다른 2차맵) · none 지도에 없음
 */
export type MonitorActivity =
  | "post"
  | "haul"
  | "forage"
  | "need"
  | "rest"
  | "patrol"
  | "evade"
  | "down"
  | "travel"
  | "none";
export const MONITOR_ACTIVITIES: readonly MonitorActivity[] = [
  "post",
  "haul",
  "forage",
  "need",
  "rest",
  "patrol",
  "evade",
  "down",
  "travel",
  "none",
];

export type MonitorRole = "worker" | "idle" | "guard";
export type MonitorHousing = "lodging" | "home" | "homeless";

/** [임시] 이만큼 넘게 한 자리에 서 있으면 "오래 멈춤"(일터 대기 최대 135초·FSM 체류 최대 3분보다 넉넉히) */
export const STUCK_AFTER_MS = 10 * 60_000;
/** 표에 싣는 도시·유닛 수 상한 */
export const AI_MONITOR_CITY_LIMIT = 300;
export const AI_MONITOR_UNIT_LIMIT = 300;

/** 2차맵 몸(없으면 지도에 없음) */
export interface MonitorBody {
  readonly activity: Exclude<MonitorActivity, "none">;
  /** 도시 경제가 일꾼으로 둔 휴먼(일터 건물·도시 직무) */
  readonly worker: boolean;
  readonly moving: boolean;
  /** 서 있은 시간(ms, 걷는 중이면 0) */
  readonly idleMs: number;
}

/** 유닛 하나의 1차 값(집계 입력) */
export interface MonitorUnitInput {
  readonly id: number;
  readonly city: number;
  readonly guard?: boolean | undefined;
  readonly satisfactionMilli: number;
  readonly fedPm?: number | undefined;
  readonly paidToday?: number | undefined;
  readonly onStrike?: boolean | undefined;
  readonly laborRank?: number | undefined;
  /** 부상 단계(0 초록 ~ 3 빨강) */
  readonly injuryStage: number;
  readonly houseId: number | null;
  readonly body: MonitorBody | null;
}

/** 시설 한 줄(고른 도시) */
export interface AiMonitorFacility {
  readonly id: number;
  readonly buildingId: number | null;
  readonly facility: string;
  readonly recipe: string;
  readonly level: number;
  readonly workers: number;
  /** 다음 생산 한 번이 잡혀 있나(일꾼이 없거나 재료가 없으면 false) */
  readonly running: boolean;
  readonly endsAtMs: number | null;
  /** 쉼터·거리 셈 생산 속도 배율(‰) */
  readonly dutyPm: number;
}

/** 생필품 재고 한 줄 */
export interface AiMonitorStock {
  readonly asset: string;
  /** 도시 창고 재고·한 번(모든 유닛)에 드는 양(기본 단위, 글자) */
  readonly have: string;
  readonly perRound: string;
  /** 지금 재고로 더 낼 수 있는 횟수(유닛이 없으면 null)·내는 간격(시간) */
  readonly rounds: number | null;
  readonly periodHours: number;
  /** 지금 재고로 버티는 시간(횟수 × 간격, 유닛이 없으면 null) */
  readonly coverHours: number | null;
}

/** 도시 경제 몫(집계 입력 — 경제가 없으면 통째로 없다) */
export interface MonitorCityEcon {
  /** 쉼터 계획의 일꾼 차례별 쉼터 종류 */
  readonly rests: readonly MonitorHousing[];
  readonly beds: number;
  readonly bedsUsed: number;
  /** 인구 상한에 더하는 침대 */
  readonly capBeds: number;
  readonly facilities: readonly AiMonitorFacility[];
  readonly stocks: readonly AiMonitorStock[];
  /** 오늘 낼 생필품(유닛 × 회)·못 낸 몫 */
  readonly due: number;
  readonly short: number;
  /** 주인 나라 국고(임금 화폐, 최소 단위 글자)·화폐 */
  readonly treasury: string | null;
  readonly currency: string | null;
}

/** 여섯 기둥(유닛 수) — 세계 합계·도시·가문이 같은 모양을 쓴다 */
export interface MonitorPillars {
  /** 휴먼(경비대 아님)·경비대 */
  readonly humans: number;
  readonly guards: number;
  /** 식사: 먹음·못 먹음(몫이 문턱 아래)·모름(아직 하루 끝 전) */
  readonly food: { readonly ok: number; readonly bad: number; readonly unknown: number };
  /** 벌이(경비대 제외): 일꾼·일 없음, 그날 임금 받음·못 받음(임금 틀 밖은 세지 않는다) */
  readonly income: {
    readonly workers: number;
    readonly idle: number;
    readonly paid: number;
    readonly unpaid: number;
  };
  readonly housing: { readonly lodging: number; readonly home: number; readonly homeless: number };
  /** 회복: 부상(단계 1 이상)·활동 불가 */
  readonly recovery: { readonly injured: number; readonly down: number };
  readonly motion: {
    readonly moving: number;
    readonly standing: number;
    readonly stuck: number;
    readonly offMap: number;
    readonly away: number;
  };
  readonly order: { readonly strikes: number; readonly avgSatisfaction: number };
  readonly activity: Readonly<Record<MonitorActivity, number>>;
  /** 문제가 하나라도 있는 유닛 수 */
  readonly issues: number;
}

/** 도시 한 줄 */
export interface AiMonitorCity extends MonitorPillars {
  readonly id: number;
  readonly name: string | null;
  readonly owner: number;
  /** 인구 상한(주거 + 상한에 드는 침대) */
  readonly cap: number;
  readonly avgFedPm: number | null;
  /** 도시가 부른 가문 없는 휴먼 */
  readonly drafted: number;
  readonly houses: number;
  readonly flaggedHouses: number;
  /** 생산: 시설 수·도는 시설·멈춘 시설(일꾼은 있는데 생산이 안 잡힘)·일꾼 없는 시설. 경제가 없으면 null */
  readonly production: {
    readonly facilities: number;
    readonly running: number;
    readonly stalled: number;
    readonly unstaffed: number;
  } | null;
  /** 숙소 침대·쓰는 침대 */
  readonly beds: number;
  readonly bedsUsed: number;
  /** 생필품: 오늘 낼 몫(유닛 × 회)·못 낸 몫, 가장 모자란 생필품 재고로 버티는 시간(null = 모름) */
  readonly due: number;
  readonly short: number;
  readonly minCoverHours: number | null;
}

/** 가문 한 줄(도시를 골랐을 때) */
export interface AiMonitorHouse extends MonitorPillars {
  readonly id: number;
  readonly name: string | null;
  readonly head: number | null;
  readonly flags: readonly HouseFlag[];
  /** 가문 금고 잔고(최소 단위, 글자) — 그 도시 주인 화폐. 금고가 없으면 "0" */
  readonly vault: string;
}

/** 유닛 한 줄 */
export interface AiMonitorUnit {
  readonly id: number;
  readonly city: number;
  readonly house: number | null;
  readonly role: MonitorRole;
  readonly activity: MonitorActivity;
  readonly moving: boolean;
  /** 서 있은 시간(ms). 지도에 없으면 null */
  readonly idleMs: number | null;
  readonly fedPm: number | null;
  /** 그날 받은 임금(임금 틀 밖이면 null) */
  readonly paid: number | null;
  readonly housing: MonitorHousing;
  readonly injury: number;
  readonly satisfaction: number;
  readonly issues: readonly MonitorIssue[];
}

export interface AiMonitorView {
  readonly generatedAt: number;
  /** 지금 날(사회 규칙의 하루 끝 수) */
  readonly day: number;
  /** 스위치(설정 칸 값 그대로) */
  readonly switches: { readonly npcAi: number; readonly unitAi: number; readonly houseAi: number };
  readonly totals: MonitorPillars & {
    readonly cities: number;
    readonly drafted: number;
    readonly houses: number;
    readonly flaggedHouses: number;
    readonly facilities: number;
    readonly running: number;
    readonly stalled: number;
    readonly unstaffed: number;
    /** 오늘 낼 생필품 몫·못 낸 몫(모든 도시) */
    readonly due: number;
    readonly short: number;
    /** 문제마다 유닛 수 */
    readonly byIssue: Readonly<Record<MonitorIssue, number>>;
  };
  /** 마지막 하루 끝의 가문세·돌봄 배당(이 서버가 켜진 뒤 아직 없으면 null) */
  readonly lastHouseDay: { readonly atMs: number; readonly taxed: number; readonly cared: number } | null;
  /** 마지막으로 일꾼 차례가 바뀐 점검(없으면 null)·지금까지 바뀐 도시 수 합 */
  readonly lastLaborChange: { readonly atMs: number; readonly cities: number } | null;
  readonly laborChanges: number;
  /** 도시 표(문제 유닛 많은 차례, 그다음 도시 ID) */
  readonly cities: readonly AiMonitorCity[];
  /** 고른 도시의 시설·재고·국고·가문(도시를 고르지 않았거나 없는 도시면 null) */
  readonly city: {
    readonly id: number;
    readonly facilities: readonly AiMonitorFacility[];
    readonly stocks: readonly AiMonitorStock[];
    readonly treasury: string | null;
    readonly currency: string | null;
    readonly houses: readonly AiMonitorHouse[];
  } | null;
  /** 유닛 표: 도시를 골랐으면 그 도시 유닛 모두, 아니면 세계의 문제 유닛만(문제 많은 차례, 상한 AI_MONITOR_UNIT_LIMIT) */
  readonly units: readonly AiMonitorUnit[];
  /** 상한에 잘리기 전 유닛 표 줄 수 */
  readonly unitsFound: number;
}

/** 고른 도시 가문의 이름·가문장·금고(가문 고리 — aiBridge.ts) */
export interface MonitorHouseInfo {
  readonly id: number;
  readonly name: string | null;
  readonly head: number | null;
  readonly vault: string;
}

interface Tally {
  humans: number;
  guards: number;
  food: { ok: number; bad: number; unknown: number };
  income: { workers: number; idle: number; paid: number; unpaid: number };
  housing: { lodging: number; home: number; homeless: number };
  recovery: { injured: number; down: number };
  motion: { moving: number; standing: number; stuck: number; offMap: number; away: number };
  strikes: number;
  sat: number;
  fed: number;
  fedN: number;
  activity: Record<MonitorActivity, number>;
  issues: number;
}

const newTally = (): Tally => ({
  humans: 0,
  guards: 0,
  food: { ok: 0, bad: 0, unknown: 0 },
  income: { workers: 0, idle: 0, paid: 0, unpaid: 0 },
  housing: { lodging: 0, home: 0, homeless: 0 },
  recovery: { injured: 0, down: 0 },
  motion: { moving: 0, standing: 0, stuck: 0, offMap: 0, away: 0 },
  strikes: 0,
  sat: 0,
  fed: 0,
  fedN: 0,
  activity: {
    post: 0,
    haul: 0,
    forage: 0,
    need: 0,
    rest: 0,
    patrol: 0,
    evade: 0,
    down: 0,
    travel: 0,
    none: 0,
  },
  issues: 0,
});

/** 유닛 한 줄을 집계에 더한다 */
function addUnit(t: Tally, row: AiMonitorUnit): void {
  if (row.role === "guard") t.guards += 1;
  else {
    t.humans += 1;
    if (row.role === "worker") t.income.workers += 1;
    else t.income.idle += 1;
    if (row.paid !== null) {
      if (row.paid > 0) t.income.paid += 1;
      else t.income.unpaid += 1;
    }
  }
  if (row.fedPm === null) t.food.unknown += 1;
  else {
    t.fed += row.fedPm;
    t.fedN += 1;
    if (row.issues.includes("unfed")) t.food.bad += 1;
    else t.food.ok += 1;
  }
  t.housing[row.housing] += 1;
  if (row.injury > 0) t.recovery.injured += 1;
  if (row.activity === "down") t.recovery.down += 1;
  if (row.activity === "none") t.motion.offMap += 1;
  else if (row.activity === "travel") t.motion.away += 1;
  else if (row.moving) t.motion.moving += 1;
  else if (row.issues.includes("stuck")) t.motion.stuck += 1;
  else t.motion.standing += 1;
  if (row.issues.includes("strike")) t.strikes += 1;
  t.sat += row.satisfaction;
  t.activity[row.activity] += 1;
  if (row.issues.length > 0) t.issues += 1;
}

function pillarsOf(t: Tally): MonitorPillars {
  const all = t.humans + t.guards;
  return {
    humans: t.humans,
    guards: t.guards,
    food: t.food,
    income: t.income,
    housing: t.housing,
    recovery: t.recovery,
    motion: t.motion,
    order: { strikes: t.strikes, avgSatisfaction: all === 0 ? 0 : Math.floor(t.sat / all) },
    activity: t.activity,
    issues: t.issues,
  };
}

/**
 * 도시 유닛의 주거: 일꾼 차례(가문 일 지시 차례, 불복은 맨 뒤 — humanPlaces.assignHumanPlaces와 같다)의 앞 일꾼은 쉼터 계획 자리,
 * 나머지(일 없는 휴먼·경비대)는 남은 주거 수까지 집, 그 뒤는 노숙. 경제가 없으면 주거 수 안은 집
 */
function housingOf(
  units: readonly MonitorUnitInput[],
  housing: number,
  rests: readonly MonitorHousing[],
): Map<number, MonitorHousing> {
  const rank = (unit: MonitorUnitInput): number =>
    unit.onStrike === true ? Number.MAX_SAFE_INTEGER : (unit.laborRank ?? Number.MAX_SAFE_INTEGER - 1);
  const humans = units
    .filter((unit) => unit.guard !== true)
    .toSorted((a, b) => rank(a) - rank(b) || a.id - b.id);
  const out = new Map<number, MonitorHousing>();
  let homes = housing;
  humans.forEach((unit, index) => {
    const rest = rests[index];
    if (rest === undefined) return;
    out.set(unit.id, rest);
    if (rest === "home") homes -= 1;
  });
  const others = [
    ...humans.filter((unit) => !out.has(unit.id)),
    ...units.filter((unit) => unit.guard === true).toSorted((a, b) => a.id - b.id),
  ];
  for (const unit of others) {
    out.set(unit.id, homes > 0 ? "home" : "homeless");
    homes -= 1;
  }
  return out;
}

export function buildAiMonitor(o: {
  readonly nowMs: number;
  readonly day: number;
  readonly switches: AiMonitorView["switches"];
  readonly units: Iterable<MonitorUnitInput>;
  readonly cities: ReadonlyMap<number, { readonly owner: number; readonly housing: number }>;
  readonly planOf: (cityId: number) => CityLaborPlan | undefined;
  readonly cityName: (cityId: number) => string | undefined;
  /** 도시 경제 몫(경제가 없으면 undefined) */
  readonly econOf: (cityId: number) => MonitorCityEcon | undefined;
  readonly lastHouseDay: AiMonitorView["lastHouseDay"];
  readonly lastLaborChange: AiMonitorView["lastLaborChange"];
  readonly laborChanges: number;
  /** 고른 도시의 가문 이름·가문장·금고(가문 고리가 없으면 빈 목록) */
  readonly housesOf: (cityId: number) => readonly MonitorHouseInfo[];
  readonly cityId?: number | undefined;
  /** 못 먹음으로 세는 식사 몫 문턱(‰) */
  readonly unfedBelowPm: number;
  readonly stuckAfterMs?: number | undefined;
}): AiMonitorView {
  const stuckAfterMs = o.stuckAfterMs ?? STUCK_AFTER_MS;
  const picked = o.cityId !== undefined && o.cities.has(o.cityId) ? o.cityId : undefined;
  const byCity = new Map<number, MonitorUnitInput[]>();
  for (const unit of o.units) {
    if (!o.cities.has(unit.city)) continue;
    const list = byCity.get(unit.city);
    if (list) list.push(unit);
    else byCity.set(unit.city, [unit]);
  }
  const world = newTally();
  const byIssue: Record<MonitorIssue, number> = {
    unfed: 0,
    unpaid: 0,
    homeless: 0,
    injured: 0,
    strike: 0,
    stuck: 0,
    off_map: 0,
  };
  const cities: AiMonitorCity[] = [];
  const shown: AiMonitorUnit[] = [];
  const houseTallies = new Map<number, Tally>();
  let pickedEcon: MonitorCityEcon | undefined;
  const sums = {
    drafted: 0,
    houses: 0,
    flaggedHouses: 0,
    facilities: 0,
    running: 0,
    stalled: 0,
    unstaffed: 0,
    due: 0,
    short: 0,
  };

  for (const [id, city] of o.cities) {
    const members = byCity.get(id) ?? [];
    const econ = o.econOf(id);
    if (id === picked) pickedEcon = econ;
    const homes = housingOf(members, city.housing, econ?.rests ?? []);
    const tally = newTally();
    for (const unit of members) {
      const guard = unit.guard === true;
      const body = unit.body;
      const housing = homes.get(unit.id) ?? "home";
      const activity: MonitorActivity = body?.activity ?? "none";
      const issues: MonitorIssue[] = [];
      if (unit.fedPm !== undefined && unit.fedPm < o.unfedBelowPm) issues.push("unfed");
      if (!guard && unit.paidToday === 0) issues.push("unpaid");
      if (housing === "homeless") issues.push("homeless");
      if (unit.injuryStage > 0) issues.push("injured");
      if (!guard && unit.onStrike === true) issues.push("strike");
      if (body && !body.moving && body.idleMs >= stuckAfterMs && activity !== "down" && activity !== "travel")
        issues.push("stuck");
      if (!body) issues.push("off_map");
      const row: AiMonitorUnit = {
        id: unit.id,
        city: id,
        house: unit.houseId,
        role: guard ? "guard" : body?.worker === true ? "worker" : "idle",
        activity,
        moving: body?.moving === true,
        idleMs: body ? body.idleMs : null,
        fedPm: unit.fedPm ?? null,
        paid: guard ? null : (unit.paidToday ?? null),
        housing,
        injury: unit.injuryStage,
        satisfaction: Math.floor(unit.satisfactionMilli / 1000),
        issues,
      };
      addUnit(tally, row);
      addUnit(world, row);
      for (const issue of issues) byIssue[issue] += 1;
      if (id === picked) {
        shown.push(row);
        if (unit.houseId !== null) {
          let house = houseTallies.get(unit.houseId);
          if (!house) {
            house = newTally();
            houseTallies.set(unit.houseId, house);
          }
          addUnit(house, row);
        }
      } else if (picked === undefined && issues.length > 0) shown.push(row);
    }
    const plan = o.planOf(id);
    let flagged = 0;
    for (const house of plan?.houses.values() ?? []) if (house.flags.length > 0) flagged += 1;
    const production = econ
      ? {
          facilities: econ.facilities.length,
          running: econ.facilities.filter((f) => f.running).length,
          stalled: econ.facilities.filter((f) => !f.running && f.workers > 0).length,
          unstaffed: econ.facilities.filter((f) => f.workers === 0).length,
        }
      : null;
    const covers = (econ?.stocks ?? []).flatMap((stock) =>
      stock.coverHours === null ? [] : [stock.coverHours],
    );
    const drafted = plan?.drafted.length ?? 0;
    cities.push({
      ...pillarsOf(tally),
      id,
      name: o.cityName(id) ?? null,
      owner: city.owner,
      cap: city.housing + (econ?.capBeds ?? 0),
      avgFedPm: tally.fedN === 0 ? null : Math.floor(tally.fed / tally.fedN),
      drafted,
      houses: plan?.houses.size ?? 0,
      flaggedHouses: flagged,
      production,
      beds: econ?.beds ?? 0,
      bedsUsed: econ?.bedsUsed ?? 0,
      due: econ?.due ?? 0,
      short: econ?.short ?? 0,
      minCoverHours: covers.length === 0 ? null : Math.min(...covers),
    });
    sums.drafted += drafted;
    sums.houses += plan?.houses.size ?? 0;
    sums.flaggedHouses += flagged;
    sums.facilities += production?.facilities ?? 0;
    sums.running += production?.running ?? 0;
    sums.stalled += production?.stalled ?? 0;
    sums.unstaffed += production?.unstaffed ?? 0;
    sums.due += econ?.due ?? 0;
    sums.short += econ?.short ?? 0;
  }

  const plan = picked === undefined ? undefined : o.planOf(picked);
  const units = shown.toSorted((a, b) => b.issues.length - a.issues.length || a.city - b.city || a.id - b.id);
  return {
    generatedAt: o.nowMs,
    day: o.day,
    switches: o.switches,
    totals: { ...pillarsOf(world), cities: o.cities.size, ...sums, byIssue },
    lastHouseDay: o.lastHouseDay,
    lastLaborChange: o.lastLaborChange,
    laborChanges: o.laborChanges,
    cities: cities.toSorted((a, b) => b.issues - a.issues || a.id - b.id).slice(0, AI_MONITOR_CITY_LIMIT),
    city:
      picked === undefined
        ? null
        : {
            id: picked,
            facilities: pickedEcon?.facilities ?? [],
            stocks: pickedEcon?.stocks ?? [],
            treasury: pickedEcon?.treasury ?? null,
            currency: pickedEcon?.currency ?? null,
            houses: o.housesOf(picked).map((house) => ({
              ...pillarsOf(houseTallies.get(house.id) ?? newTally()),
              ...house,
              flags: plan?.houses.get(house.id)?.flags ?? [],
            })),
          },
    units: units.slice(0, AI_MONITOR_UNIT_LIMIT),
    unitsFound: units.length,
  };
}
