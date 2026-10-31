import { describe, expect, it } from "vitest";
import { DAY_MS, type FactionDay, createMetricsRecorder } from "./metrics.ts";

const T0 = 1_000_000;
const at = (day: number, hour = 0) => T0 + day * DAY_MS + hour * 3_600_000;

function rows(cities: Record<number, number>, tech: Record<number, number> = {}): FactionDay[] {
  return Object.entries(cities).map(([id, count]) => ({
    id: Number(id),
    cities: count,
    population: count * 10,
    tech: tech[Number(id)] ?? 1,
  }));
}

describe("D-391 지표 기록기", () => {
  it("하루 몫: 도시 몫 최대값(만분율, 정원사 제외)과 그 세력을 하루 줄로 적는다", () => {
    const lines: string[] = [];
    const recorder = createMetricsRecorder({ startMs: T0, sink: (line) => lines.push(line) });
    recorder.start([
      { id: 1, fixed: true, tech: 1 },
      { id: 2, fixed: true, tech: 1 },
    ]);
    recorder.day(1, [
      ...rows({ 1: 3, 2: 1 }),
      { id: 9, cities: 100, population: 0, tech: 0, gardener: true },
    ]);
    const day = JSON.parse(lines.at(-1) ?? "{}");
    expect(day).toMatchObject({
      t: "day",
      day: 1,
      atMs: at(1),
      cityTotal: 4,
      shareMaxBp: 7500,
      shareMaxFaction: 1,
    });
    expect(day.factions[0]).toEqual({ id: 1, cities: 3, population: 30, tech: 1 });
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ t: "start", atMs: T0 });
  });

  it("독점: 같은 세력이 문턱 이상인 가장 긴 연속 날 수와 통과 여부(넘지 않으면 통과)", () => {
    const recorder = createMetricsRecorder({
      startMs: T0,
      sink: () => {},
      monopolyShareBp: 4000,
      monopolyMaxDays: 3,
    });
    recorder.start([
      { id: 1, fixed: true, tech: 1 },
      { id: 2, fixed: true, tech: 1 },
    ]);
    // 1: 50% 50% 50% | 2가 60%로 바뀜 | 1: 40% 40% 40% 40% (4일 연속 → 실패)
    const days = [
      { 1: 5, 2: 5 },
      { 1: 5, 2: 5 },
      { 1: 5, 2: 5 },
      { 1: 4, 2: 6 },
      { 1: 4, 2: 6 },
    ];
    days.forEach((cities, index) => recorder.day(index + 1, rows(cities)));
    // 1은 1~5일 모두 40% 이상 → 5일, 2는 1~5일 모두 40% 이상(50,50,50,60,60) → 5일
    let summary = recorder.summary(at(5));
    expect(summary.monopoly.longest).toEqual({ faction: 1, days: 5, fromDay: 1 });
    expect(summary.monopoly.pass).toBe(false);
    const short = createMetricsRecorder({
      startMs: T0,
      sink: () => {},
      monopolyShareBp: 4000,
      monopolyMaxDays: 3,
    });
    short.start([
      { id: 1, fixed: true, tech: 1 },
      { id: 2, fixed: true, tech: 1 },
      { id: 3, fixed: true, tech: 1 },
    ]);
    [
      { 1: 4, 2: 3, 3: 3 },
      { 1: 4, 2: 3, 3: 3 },
      { 1: 3, 2: 3, 3: 4 },
      { 1: 4, 2: 3, 3: 3 },
    ].forEach((cities, index) => short.day(index + 1, rows(cities)));
    summary = short.summary(at(4));
    expect(summary.monopoly.longest).toEqual({ faction: 1, days: 2, fromDay: 1 });
    expect(summary.monopoly.pass).toBe(true);
    expect(summary.series.shareMaxBp).toEqual([4000, 4000, 4000, 4000]);
  });

  it("통합·분열: 30일 구간마다 생김과 사라짐이 함께 있었는지, 몫이 문턱 이상이면 통과", () => {
    const recorder = createMetricsRecorder({
      startMs: T0,
      sink: () => {},
      windowDays: 30,
      churnWindowShareBp: 8333,
    });
    recorder.start([{ id: 1, fixed: true, tech: 1 }]);
    // 구간 0: 생김+사라짐, 구간 1: 생김만, 구간 2: 생김+사라짐 → 3구간 중 2 = 66.7% < 83.33% → 실패
    recorder.born(at(3), 10, "rebellion", { parent: 1, tech: 1 });
    recorder.died(at(20), 10, "conquered", { into: 1 });
    recorder.born(at(40), 11, "rebellion", { parent: 1, tech: 1 });
    recorder.born(at(61), 12, "independence", { parent: 1, tech: 1 });
    recorder.died(at(89, 23), 11, "bankrupt");
    // 90일째 경계의 사건은 넷째(덜 찬) 구간이라 세지 않는다
    recorder.died(at(90), 12, "conquered");
    const summary = recorder.summary(at(90));
    expect(summary.churn).toMatchObject({ windows: 3, windowsWithBoth: 2, pass: false });
    expect(summary.churn.born).toEqual({ total: 3, byCause: { independence: 1, rebellion: 2 } });
    expect(summary.churn.died).toEqual({ total: 3, byCause: { bankrupt: 1, conquered: 2 } });
  });

  it("기술: 내려간 적 있는 세력 몫과 시작·끝 평균(끝이 높아야 통과)", () => {
    const recorder = createMetricsRecorder({ startMs: T0, sink: () => {}, techDownFactionShareBp: 3000 });
    recorder.start([
      { id: 1, fixed: true, tech: 2 },
      { id: 2, fixed: true, tech: 2 },
      { id: 3, fixed: true, tech: 2 },
    ]);
    recorder.tech(at(1), 1, 2, 3, "research");
    recorder.tech(at(2), 1, 3, 2, "city_lost");
    recorder.tech(at(2), 2, 2, 4, "research");
    recorder.day(3, rows({ 1: 1, 2: 1, 3: 1 }, { 1: 2, 2: 4, 3: 2 }));
    const summary = recorder.summary(at(3));
    // 세력 3개 중 1개(33.3%) ≥ 30%, 끝 평균 2.667 > 시작 2 → 통과
    expect(summary.tech).toMatchObject({
      ups: 2,
      downs: 1,
      downsByCause: { city_lost: 1 },
      factionsWithDown: 1,
      factionsSeen: 3,
      startAvgMilli: 2000,
      endAvgMilli: 2666,
      pass: true,
    });
    expect(summary.series.techAvgMilli).toEqual([2666]);
  });

  it("사건 줄은 받은 차례로 한 줄씩 쓰고, 금액 같은 큰 수는 문자열로 쓴다", () => {
    const lines: string[] = [];
    const recorder = createMetricsRecorder({ startMs: T0, sink: (line) => lines.push(line) });
    recorder.start([{ id: 1, fixed: false, tech: 1 }]);
    recorder.born(at(0, 5), 2, "rebellion", { parent: 1, tech: 1 });
    recorder.day(1, [{ id: 1, cities: 1, population: 1, tech: 1, treasury: 12345678901234567890n }]);
    expect(lines.map((line) => JSON.parse(line).t)).toEqual(["start", "born", "day"]);
    expect(JSON.parse(lines[1] ?? "{}")).toEqual({
      t: "born",
      atMs: at(0, 5),
      day: 1,
      faction: 2,
      cause: "rebellion",
      parent: 1,
      tech: 1,
    });
    expect(JSON.parse(lines[2] ?? "{}").factions[0].treasury).toBe("12345678901234567890");
  });
});
