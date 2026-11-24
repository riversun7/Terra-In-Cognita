// 작동 모니터 탭의 판정 도우미(순수 함수) — 서버가 준 수를 정상·주의·문제로 가른다. 문턱은 [임시] 화면 상수(판정에 쓰지 않는다).

export type MonitorLevel = "ok" | "warn" | "bad" | "none";
export type PillarKey = "food" | "income" | "housing" | "recovery" | "motion" | "order";
export const PILLAR_KEYS: readonly PillarKey[] = ["food", "income", "housing", "recovery", "motion", "order"];

/** 여섯 기둥(서버 MonitorPillars 가운데 판정에 쓰는 몫) */
export interface PillarCounts {
  readonly humans: number;
  readonly guards: number;
  readonly food: { readonly ok: number; readonly bad: number; readonly unknown: number };
  readonly income: {
    readonly workers: number;
    readonly idle: number;
    readonly paid: number;
    readonly unpaid: number;
  };
  readonly housing: { readonly lodging: number; readonly home: number; readonly homeless: number };
  readonly recovery: { readonly injured: number; readonly down: number };
  readonly motion: {
    readonly moving: number;
    readonly standing: number;
    readonly stuck: number;
    readonly offMap: number;
    readonly away: number;
  };
  readonly order: { readonly strikes: number; readonly avgSatisfaction: number };
}

/** 문제 몫이 이 분모 가운데 하나 이상이면 "문제"(20%) */
const BAD_SHARE = 5;
/** 평균 만족도 문턱(점) */
const SAT_BAD = 40;
const SAT_WARN = 55;
/** 생필품 재고로 버티는 시간이 이 아래면 주의 */
const COVER_WARN_HOURS = 24;

const RANK: Readonly<Record<MonitorLevel, number>> = { none: 0, ok: 1, warn: 2, bad: 3 };

/** 문제 수 ÷ 전체 → 단계. 전체가 0이면 자료 없음 */
export function levelOf(bad: number, total: number): MonitorLevel {
  if (total <= 0) return "none";
  if (bad <= 0) return "ok";
  return bad * BAD_SHARE >= total ? "bad" : "warn";
}

export const worseOf = (a: MonitorLevel, b: MonitorLevel): MonitorLevel => (RANK[a] >= RANK[b] ? a : b);

/** 기둥마다 정상인 수 / 전체 */
export function pillarRatios(p: PillarCounts): Readonly<Record<PillarKey, { ok: number; total: number }>> {
  const all = p.humans + p.guards;
  const housed = p.housing.lodging + p.housing.home;
  const onMap = p.motion.moving + p.motion.standing + p.motion.stuck + p.motion.offMap;
  return {
    food: { ok: p.food.ok, total: p.food.ok + p.food.bad },
    income: { ok: p.income.paid, total: p.income.paid + p.income.unpaid },
    housing: { ok: housed, total: housed + p.housing.homeless },
    recovery: { ok: all - p.recovery.injured, total: all },
    motion: { ok: p.motion.moving + p.motion.standing, total: onMap },
    order: { ok: p.humans - p.order.strikes, total: p.humans },
  };
}

/** 기둥마다 단계 */
export function pillarLevels(p: PillarCounts): Readonly<Record<PillarKey, MonitorLevel>> {
  const r = pillarRatios(p);
  const all = p.humans + p.guards;
  const of = (key: PillarKey): MonitorLevel => levelOf(r[key].total - r[key].ok, r[key].total);
  // 벌이: 임금 못 받음 + 휴먼 절반 넘게 일이 없으면 주의
  const jobless: MonitorLevel = p.humans === 0 ? "none" : p.income.idle * 2 > p.humans ? "warn" : "ok";
  // 회복: 활동 불가가 있으면 그 몫으로, 부상만 있으면 주의
  const recovery: MonitorLevel =
    all === 0
      ? "none"
      : p.recovery.down > 0
        ? worseOf("warn", levelOf(p.recovery.down, all))
        : p.recovery.injured > 0
          ? "warn"
          : "ok";
  const mood: MonitorLevel =
    all === 0
      ? "none"
      : p.order.avgSatisfaction < SAT_BAD
        ? "bad"
        : p.order.avgSatisfaction < SAT_WARN
          ? "warn"
          : "ok";
  return {
    food: of("food"),
    income: worseOf(of("income"), jobless),
    housing: of("housing"),
    recovery,
    motion: of("motion"),
    order: worseOf(of("order"), mood),
  };
}

/** 생산: 일꾼은 있는데 멈춘 시설이 문제, 일꾼 없는 시설은 주의 */
export function productionLevel(
  production: { readonly facilities: number; readonly stalled: number; readonly unstaffed: number } | null,
): MonitorLevel {
  if (!production || production.facilities === 0) return "none";
  const stalled = levelOf(production.stalled, production.facilities);
  return production.unstaffed > 0 ? worseOf(stalled, "warn") : stalled;
}

/** 생필품 재고: 바닥났으면 문제, 하루를 못 버티면 주의 */
export function stockLevel(coverHours: number | null): MonitorLevel {
  if (coverHours === null) return "none";
  if (coverHours <= 0) return "bad";
  return coverHours < COVER_WARN_HOURS ? "warn" : "ok";
}

/** 오늘 배급: 낼 몫 가운데 못 낸 몫(낼 것이 아직 없었으면 자료 없음) */
export function rationLevel(due: number, short: number): MonitorLevel {
  return levelOf(short, due);
}

/** 문제·주의·자료 없음 수(총평) */
export function countLevels(levels: readonly MonitorLevel[]): {
  readonly bad: number;
  readonly warn: number;
  readonly none: number;
} {
  return {
    bad: levels.filter((level) => level === "bad").length,
    warn: levels.filter((level) => level === "warn").length,
    none: levels.filter((level) => level === "none").length,
  };
}

/** ms → 시·분·초(내림) */
export function durationParts(ms: number): { readonly h: number; readonly m: number; readonly s: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** 막대 폭(%) — 0이 아니면 적어도 2% */
export function sharePct(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Math.max(2, Math.round((count * 100) / total));
}
