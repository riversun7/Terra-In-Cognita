// D-391 지표 기록기 — docs/adr/2026-10-31-rules-simulator.md, 기술 순서 ADR 4절 "지표", 질문 119 기본안(D-412)
// 조정 시뮬(가상 시계)과 출시 관문(실제 시간으로 몇 달, ADR 2026-10-31-n1-real-time-gate.md)이 같은 기록기를 쓴다.
// 시계를 모른다: 사건(생김·사라짐·기술 오르내림)은 시각(ms)을 받고, 하루 몫은 부르는 쪽이 하루가 끝날 때 넘긴다.
// 출력은 JSON 줄(사건 줄·하루 줄)과 요약 객체다. 줄은 받은 차례대로 쓴다(관전 그래프·관리자 NPC 건강도가 같은 줄을 읽는다).
// - 날: 시작 시각부터 DAY_MS씩. "N일째" = 1부터(첫 24시간이 1일째). 하루 줄의 day = 끝난 날 수.
// - 몫: 도시 수의 몫(정원사 제외), 만분율 정수(⌊도시 × 10000 ÷ 전체⌋).
// - 문턱(설정 칸 49 S38, 질문 119 기본안): 도시 몫 40% 이상이 한 번에 30일을 넘지 않음 / 30일 구간의 5/6 이상에서
//   세력이 생기고 사라짐 / 기술이 내려간 적 있는 세력 30% 이상 + 끝 평균 > 시작 평균.

/** 하루(ms). 지표의 날은 실제 24시간이다(D-391) */
export const DAY_MS = 86_400_000;

export interface MetricsOptions {
  readonly startMs: number;
  /** 한 줄씩 받는다(줄 끝 문자 없음) */
  readonly sink: (line: string) => void;
  readonly monopolyShareBp?: number | undefined;
  readonly monopolyMaxDays?: number | undefined;
  readonly windowDays?: number | undefined;
  readonly churnWindowShareBp?: number | undefined;
  readonly techDownFactionShareBp?: number | undefined;
}

export interface FactionStart {
  readonly id: number;
  /** 고정 세력(D-324: 기본 NPC 세력은 사라지지 않는다) */
  readonly fixed: boolean;
  readonly tech: number;
}

/** 하루가 끝날 때 세력 하나의 값. 조정용 값은 R2~R5에서 칸을 더한다(읽는 쪽은 모르는 칸을 무시한다) */
export interface FactionDay {
  readonly id: number;
  readonly cities: number;
  /** 유닛 수(D-098: 집계 인구 없음) */
  readonly population: number;
  readonly tech: number;
  /** 정원사(몫 계산에서 뺀다) */
  readonly gardener?: boolean | undefined;
  /** 국고(최소 단위). 문자열로 쓴다 */
  readonly treasury?: bigint | undefined;
}

export interface CountByCause {
  total: number;
  byCause: Record<string, number>;
}

export interface MetricsSummary {
  readonly days: number;
  readonly thresholds: {
    monopolyShareBp: number;
    monopolyMaxDays: number;
    windowDays: number;
    churnWindowShareBp: number;
    techDownFactionShareBp: number;
  };
  readonly monopoly: {
    shareMaxBp: number;
    shareMaxFaction: number | null;
    longest: { faction: number; days: number; fromDay: number } | null;
    pass: boolean;
  };
  readonly churn: {
    born: CountByCause;
    died: CountByCause;
    windows: number;
    windowsWithBoth: number;
    factionsStart: number;
    factionsEnd: number;
    factionsPeak: number;
    pass: boolean;
  };
  readonly tech: {
    ups: number;
    downs: number;
    downsByCause: Record<string, number>;
    factionsWithDown: number;
    factionsSeen: number;
    startAvgMilli: number;
    endAvgMilli: number;
    pass: boolean;
  };
  /** 하루마다(1일째부터) — 그래프용 */
  readonly series: { factions: number[]; shareMaxBp: number[]; techAvgMilli: number[] };
}

export interface MetricsRecorder {
  /** 처음 세력(시작 시각) */
  start(factions: readonly FactionStart[]): void;
  /** 세력이 생김(반란·독립·새 도시·유목 등) */
  born(atMs: number, faction: number, cause: string, extra?: { parent?: number; tech?: number }): void;
  /** 세력이 사라지거나 합쳐짐(멸망·파산·편입·종속 등) */
  died(atMs: number, faction: number, cause: string, extra?: { into?: number }): void;
  /** 세력 기술 단계가 바뀜 */
  tech(atMs: number, faction: number, from: number, to: number, cause: string): void;
  /** day일째가 끝났을 때 살아 있는 세력들의 값 */
  day(day: number, factions: readonly FactionDay[]): void;
  /** day일째 경제 조정용 줄(시세·통화량·환율·모자람 등, 내용은 부르는 쪽이 정한다) */
  econ(day: number, data: Record<string, unknown>): void;
  summary(endMs: number): MetricsSummary;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** 이름 차례로 놓은 객체(출력이 넣은 차례와 상관없이 같게) */
function sortedRecord(map: ReadonlyMap<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of [...map.keys()].toSorted()) out[key] = map.get(key) ?? 0;
  return out;
}

function avgMilli(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return Math.floor((sum * 1000) / values.length);
}

export function createMetricsRecorder(options: MetricsOptions): MetricsRecorder {
  const thresholds = {
    monopolyShareBp: options.monopolyShareBp ?? 4000,
    monopolyMaxDays: options.monopolyMaxDays ?? 30,
    windowDays: options.windowDays ?? 30,
    churnWindowShareBp: options.churnWindowShareBp ?? 8333,
    techDownFactionShareBp: options.techDownFactionShareBp ?? 3000,
  };
  const { startMs, sink } = options;
  const write = (record: object): void => sink(JSON.stringify(record));
  const dayOf = (atMs: number): number => Math.floor((atMs - startMs) / DAY_MS) + 1;

  const seen = new Set<number>();
  const living = new Set<number>();
  let startTechAvg = 0;
  let startCount = 0;
  const born = new Map<string, number>();
  const died = new Map<string, number>();
  let bornTotal = 0;
  let diedTotal = 0;
  /** 구간 번호 → [생김, 사라짐] */
  const windowEvents = new Map<number, [boolean, boolean]>();
  let ups = 0;
  let downs = 0;
  const downsByCause = new Map<string, number>();
  const withDown = new Set<number>();
  let factionsPeak = 0;
  let lastDay = 0;
  let lastTechAvg: number | undefined;
  let shareMaxBp = 0;
  let shareMaxFaction: number | null = null;
  /** 세력 → 지금 이어지는 독점 구간 시작 날 */
  const runs = new Map<number, number>();
  let longest: { faction: number; days: number; fromDay: number } | null = null;

  const series = { factions: [] as number[], shareMaxBp: [] as number[], techAvgMilli: [] as number[] };

  const markWindow = (atMs: number, slot: 0 | 1): void => {
    const window = Math.floor((dayOf(atMs) - 1) / thresholds.windowDays);
    const flags = windowEvents.get(window) ?? [false, false];
    flags[slot] = true;
    windowEvents.set(window, flags);
  };

  type Run = { faction: number; days: number; fromDay: number };
  /** 더 긴 구간(같으면 먼저 시작한 것, 그것도 같으면 작은 세력 ID) */
  const longer = (best: Run | null, faction: number, fromDay: number, endDay: number): Run | null => {
    const days = endDay - fromDay + 1;
    if (
      !best ||
      days > best.days ||
      (days === best.days && (fromDay < best.fromDay || (fromDay === best.fromDay && faction < best.faction)))
    )
      return { faction, days, fromDay };
    return best;
  };
  const closeRun = (faction: number, fromDay: number, endDay: number): void => {
    longest = longer(longest, faction, fromDay, endDay);
  };

  return {
    start(factions) {
      for (const faction of factions) {
        seen.add(faction.id);
        living.add(faction.id);
      }
      factionsPeak = living.size;
      startCount = living.size;
      startTechAvg = avgMilli(factions.map((faction) => faction.tech));
      write({ t: "start", atMs: startMs, factions });
    },
    born(atMs, faction, cause, extra = {}) {
      seen.add(faction);
      living.add(faction);
      factionsPeak = Math.max(factionsPeak, living.size);
      bornTotal += 1;
      bump(born, cause);
      markWindow(atMs, 0);
      write({ t: "born", atMs, day: dayOf(atMs), faction, cause, ...extra });
    },
    died(atMs, faction, cause, extra = {}) {
      living.delete(faction);
      diedTotal += 1;
      bump(died, cause);
      markWindow(atMs, 1);
      write({ t: "died", atMs, day: dayOf(atMs), faction, cause, ...extra });
    },
    tech(atMs, faction, from, to, cause) {
      if (to > from) ups += 1;
      else if (to < from) {
        downs += 1;
        bump(downsByCause, cause);
        withDown.add(faction);
      }
      write({ t: "tech", atMs, day: dayOf(atMs), faction, from, to, cause });
    },
    day(day, factions) {
      let cityTotal = 0;
      for (const faction of factions) if (!faction.gardener) cityTotal += faction.cities;
      let maxBp = 0;
      let maxFaction: number | null = null;
      const counted = factions.filter((faction) => !faction.gardener);
      for (const faction of counted) {
        const bp = cityTotal === 0 ? 0 : Math.floor((faction.cities * 10_000) / cityTotal);
        if (bp > maxBp || (bp === maxBp && maxFaction !== null && faction.id < maxFaction)) {
          maxBp = bp;
          maxFaction = faction.id;
        }
        const runStart = runs.get(faction.id);
        if (bp >= thresholds.monopolyShareBp) {
          if (runStart === undefined) runs.set(faction.id, day);
        } else if (runStart !== undefined) {
          closeRun(faction.id, runStart, day - 1);
          runs.delete(faction.id);
        }
      }
      // 사라진 세력의 구간은 그 전날에 끝난다
      const present = new Set(counted.map((faction) => faction.id));
      for (const [faction, runStart] of runs) {
        if (present.has(faction)) continue;
        closeRun(faction, runStart, day - 1);
        runs.delete(faction);
      }
      if (maxBp > shareMaxBp || shareMaxFaction === null) {
        shareMaxBp = maxBp;
        shareMaxFaction = maxFaction;
      }
      const techAvg = avgMilli(counted.map((faction) => faction.tech));
      lastDay = day;
      lastTechAvg = techAvg;
      series.factions.push(counted.length);
      series.shareMaxBp.push(maxBp);
      series.techAvgMilli.push(techAvg);
      write({
        t: "day",
        day,
        atMs: startMs + day * DAY_MS,
        cityTotal,
        shareMaxBp: maxBp,
        shareMaxFaction: maxFaction,
        factions: factions.map((faction) => {
          const { treasury, ...rest } = faction;
          return treasury === undefined ? rest : { ...rest, treasury: treasury.toString() };
        }),
      });
    },
    econ(day, data) {
      write({ t: "econ", day, ...data });
    },
    summary(endMs) {
      const days = Math.floor((endMs - startMs) / DAY_MS);
      // 아직 이어지는 구간은 마지막 하루까지로 친다(기록기 상태는 바꾸지 않는다 — 여러 번 불러도 같다)
      let longestRun = longest;
      for (const [faction, runStart] of runs) longestRun = longer(longestRun, faction, runStart, lastDay);
      const windows = Math.floor(days / thresholds.windowDays);
      let withBoth = 0;
      for (let window = 0; window < windows; window++) {
        const flags = windowEvents.get(window);
        if (flags?.[0] && flags[1]) withBoth += 1;
      }
      const endAvg = lastTechAvg ?? startTechAvg;
      return {
        days,
        thresholds,
        monopoly: {
          shareMaxBp,
          shareMaxFaction,
          longest: longestRun,
          pass: (longestRun?.days ?? 0) <= thresholds.monopolyMaxDays,
        },
        churn: {
          born: { total: bornTotal, byCause: sortedRecord(born) },
          died: { total: diedTotal, byCause: sortedRecord(died) },
          windows,
          windowsWithBoth: withBoth,
          factionsStart: startCount,
          factionsEnd: living.size,
          factionsPeak,
          pass: windows > 0 && withBoth * 10_000 >= thresholds.churnWindowShareBp * windows,
        },
        tech: {
          ups,
          downs,
          downsByCause: sortedRecord(downsByCause),
          factionsWithDown: withDown.size,
          factionsSeen: seen.size,
          startAvgMilli: startTechAvg,
          endAvgMilli: endAvg,
          pass:
            seen.size > 0 &&
            withDown.size * 10_000 >= thresholds.techDownFactionShareBp * seen.size &&
            endAvg > startTechAvg,
        },
        series,
      };
    },
  };
}
