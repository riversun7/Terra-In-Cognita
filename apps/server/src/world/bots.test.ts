// 시험 봇 목적지 고르기 시험 — 집이 있는 봇(NPC 휴먼, docs/adr/2026-11-07-play-flow.md "WP-NPC")의 목적지 네모(homeArea), 일터가 있는
// NPC 휴먼의 일하는 때·목적지·쉬는 시간("WP-NPC2", 기획 답 740 나 — 일하는 때는 그 2차맵 지역 시각의 낮, "WP-NPC4" 770 나)
import { createRng } from "@terra/shared";
import { PLANET_CALENDAR_EPOCH_MS, PLANET_DAY_MS, localSolarHours } from "@terra/shared/planetCalendar";
import { anchorCenter, createPlacementGrid } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORK_SHIFT,
  HOME_RADIUS_CELLS,
  TRIP_RADIUS_CELLS,
  WORK_JITTER_PM,
  type WorkShift,
  arrivalIdleMs,
  atWork,
  shiftFatiguePm,
  homeArea,
  idleMs,
  localDayPm,
  pickDestination,
  tripArea,
} from "./bots.ts";

const at = (x: number, y: number) => anchorCenter(x, y, 1);

describe("homeArea", () => {
  it("집 반경 안이면 집 둘레 네모", () => {
    expect(homeArea(at(130, 120), 1, { x: 128, y: 128 })).toEqual({
      x: 128,
      y: 128,
      radius: HOME_RADIUS_CELLS,
    });
  });

  it("멀면 집 쪽으로 TRIP_RADIUS_CELLS만큼 다가간 칸 둘레(작은 반경)", () => {
    const area = homeArea(at(10, 128), 1, { x: 200, y: 128 });
    expect(area.x).toBe(10 + TRIP_RADIUS_CELLS);
    expect(area.y).toBe(128);
    expect(area.radius).toBeLessThan(HOME_RADIUS_CELLS);
    // 대각선: 체비셰프 거리로 나눈다(두 축 모두 다가간다)
    const diagonal = homeArea(at(0, 0), 1, { x: 200, y: 100 });
    expect(diagonal.x).toBe(TRIP_RADIUS_CELLS);
    expect(diagonal.y).toBe(TRIP_RADIUS_CELLS / 2);
  });
});

describe("pickDestination", () => {
  it("네모를 주면 그 안에서, 안 주면 지금 자리 둘레 TRIP_RADIUS_CELLS 안에서 고른다(난수 차례는 예전과 같다)", () => {
    const grid = createPlacementGrid();
    for (let seed = 1; seed <= 40; seed++) {
      const inside = pickDestination(grid, createRng(seed), 1, at(20, 20), { x: 128, y: 128, radius: 10 });
      expect(inside).toBeDefined();
      const x = Math.floor((inside?.x ?? 0) / 1024);
      const y = Math.floor((inside?.y ?? 0) / 1024);
      expect(Math.abs(x - 128)).toBeLessThanOrEqual(10);
      expect(Math.abs(y - 128)).toBeLessThanOrEqual(10);
      // 네모 없이 = 지금 자리 둘레(옛 규칙과 같은 값)
      const plain = pickDestination(grid, createRng(seed), 1, at(128, 128));
      const sameAsArea = pickDestination(grid, createRng(seed), 1, at(128, 128), {
        x: 128,
        y: 128,
        radius: TRIP_RADIUS_CELLS,
      });
      expect(plain).toEqual(sameAsArea);
    }
  });
});

/** 경도 lonDeg의 지역 시각 hour(시)가 되는 시각(달력 기원 뒤 dayIndex일째) — 엔진 utcMsForLocalHour와 같은 거꾸로 셈 */
const timeAtLocalHour = (lonDeg: number, hour: number, dayIndex = 30): number =>
  PLANET_CALENDAR_EPOCH_MS +
  dayIndex * PLANET_DAY_MS +
  Math.round((((((hour - lonDeg / 15) % 24) + 24) % 24) / 24) * PLANET_DAY_MS);

/** 기본 일하는 때(06:00~18:00)를 그 경도로 */
const shift = (lonDeg: number): WorkShift => ({ ...DEFAULT_WORK_SHIFT, lonDeg });

describe("낮밤 일(WP-NPC4, 770 나)", () => {
  it("지역 시각은 공용 달력 localSolarHours(2차맵 빛과 같은 셈)의 천분율", () => {
    for (const lonDeg of [0, 37.5, -120, 179]) {
      for (const hour of [0, 6, 12.25, 18, 23.5]) {
        const t = timeAtLocalHour(lonDeg, hour);
        expect(localDayPm(t, lonDeg)).toBeCloseTo((hour * 1000) / 24, 3);
        const msIntoDay = (((t - PLANET_CALENDAR_EPOCH_MS) % PLANET_DAY_MS) + PLANET_DAY_MS) % PLANET_DAY_MS;
        expect(localDayPm(t, lonDeg)).toBe((localSolarHours(msIntoDay, lonDeg) * 1000) / 24);
      }
    }
  });

  it("피로 바퀴(질문 1095 가): 바퀴 가운데 일 몫만 일터, 휴먼마다 시작을 흩고, 낮·밤과 상관없다", () => {
    const cycle = { workMs: 2 * 3_600_000, periodMs: 6 * 3_600_000 };
    for (const unitId of [1, 2, 77]) {
      // 한 바퀴를 1분씩 훑으면 일터인 몫 = 2시간 / 6시간
      let working = 0;
      for (let t = 0; t < cycle.periodMs; t += 60_000)
        if (atWork({ ...shift(0), cycle }, unitId, t)) working += 1;
      expect(working).toBe(120);
      // 바퀴 뒤 같은 자리
      expect(atWork({ ...shift(0), cycle }, unitId, 1_000)).toBe(
        atWork({ ...shift(0), cycle }, unitId, 1_000 + cycle.periodMs),
      );
    }
    const starts = Array.from({ length: 30 }, (_, i) => atWork({ ...shift(0), cycle }, i + 1, 0));
    expect(new Set(starts).size).toBe(2);
  });

  it("어림 피로: 일하는 때 동안 오르고 쉬는 때 동안 내린다(피로 바퀴·낮밤 모두)", () => {
    const cycle = { workMs: 2 * 3_600_000, periodMs: 6 * 3_600_000 };
    for (const unitId of [1, 2, 77]) {
      let peak = 0;
      let low = 1000;
      for (let t = 0; t < cycle.periodMs; t += 60_000) {
        const pm = shiftFatiguePm({ ...shift(0), cycle }, unitId, t);
        peak = Math.max(peak, pm);
        low = Math.min(low, pm);
      }
      expect(peak).toBeGreaterThan(550);
      expect(peak).toBeLessThanOrEqual(600);
      expect(low).toBeLessThan(20);
    }
    // 낮밤: 퇴근 무렵이 아침보다 피곤하고, 새벽에는 거의 풀린다
    expect(shiftFatiguePm(shift(0), 5, timeAtLocalHour(0, 17))).toBeGreaterThan(
      shiftFatiguePm(shift(0), 5, timeAtLocalHour(0, 8)),
    );
    expect(shiftFatiguePm(shift(0), 5, timeAtLocalHour(0, 5))).toBeLessThan(100);
  });

  it("낮(06:00~18:00 + 휴먼마다 흩은 출근·퇴근)에 일터, 밤에 집 — 같은 시각이라도 경도가 다르면 다르다", () => {
    for (const unitId of [1, 2, 77, 9001]) {
      for (const lonDeg of [0, 90, -45]) {
        // 한낮·한밤은 흩기와 상관없이 정해진다
        expect(atWork(shift(lonDeg), unitId, timeAtLocalHour(lonDeg, 12))).toBe(true);
        expect(atWork(shift(lonDeg), unitId, timeAtLocalHour(lonDeg, 0))).toBe(false);
        expect(atWork(shift(lonDeg), unitId, timeAtLocalHour(lonDeg, 5.9))).toBe(false);
        // 출근 흩기(지역 1시간 = WORK_JITTER_PM) 뒤에는 모두 일터, 퇴근 흩기 뒤에는 모두 집
        expect(atWork(shift(lonDeg), unitId, timeAtLocalHour(lonDeg, 7.05))).toBe(true);
        expect(atWork(shift(lonDeg), unitId, timeAtLocalHour(lonDeg, 19.05))).toBe(false);
      }
    }
    // 경도 0의 한낮 = 경도 180의 한밤
    const noon = timeAtLocalHour(0, 12);
    expect(atWork(shift(0), 5, noon)).toBe(true);
    expect(atWork(shift(180), 5, noon)).toBe(false);
    // 출근 때가 휴먼마다 흩어진다(지역 06:00~07:00 사이, 한꺼번에 길을 묻지 않게)
    const starts = new Set(
      Array.from({ length: 20 }, (_, index) => {
        for (let pm = 240; pm <= 250 + WORK_JITTER_PM + 1; pm += 1)
          if (atWork(shift(0), index + 1, timeAtLocalHour(0, (pm * 24) / 1000))) return pm;
        return -1;
      }),
    );
    expect(starts.size).toBeGreaterThan(5);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(250);
    expect(Math.max(...starts)).toBeLessThanOrEqual(250 + WORK_JITTER_PM + 1);
  });

  it("설정 칸 모양: 시작 > 끝이면 밤을 넘는 몫, 같으면 늘 집, 0~1000이면 늘 일터", () => {
    const night: WorkShift = { lonDeg: 0, startPm: 875, endPm: 125 };
    expect(atWork(night, 3, timeAtLocalHour(0, 0))).toBe(true);
    expect(atWork(night, 3, timeAtLocalHour(0, 12))).toBe(false);
    const never: WorkShift = { lonDeg: 0, startPm: 500, endPm: 500 };
    const always: WorkShift = { lonDeg: 0, startPm: 0, endPm: 1000 };
    for (const hour of [0, 3, 9, 12, 15, 21, 23.9]) {
      expect(atWork(never, 3, timeAtLocalHour(0, hour))).toBe(false);
      expect(atWork(always, 3, timeAtLocalHour(0, hour))).toBe(true);
    }
  });
});

/** 그 유닛이 일하는 때 / 집에 있는 때인 시각 하나(경도 0, 기본 일하는 때 — 한낮·한밤) */
const timeWhen = (_unitId: number, working: boolean): number => timeAtLocalHour(0, working ? 12 : 0);

describe("일터가 있는 NPC 휴먼(WP-NPC2)", () => {
  const work = { x: 60, y: 60, radius: 5 };
  const home = { x: 128, y: 128, work };

  it("일하는 몫이면 일터 쪽(멀면 다가간 칸), 쉬는 몫이면 집 둘레. 일터가 없으면 늘 집 둘레", () => {
    const t = timeWhen(5, true);
    expect(tripArea(at(62, 58), 1, home, 5, t)).toEqual(work);
    // 일터에서 43칸 안이면 한 번에 일터 네모로(일터 반경 5 + 고르는 칸 ≤ 한 번 길 48칸)
    expect(tripArea(at(100, 60), 1, home, 5, t)).toEqual(work);
    const far = tripArea(at(200, 60), 1, home, 5, t);
    expect(far.x).toBe(200 - TRIP_RADIUS_CELLS);
    expect(far.radius).toBeLessThan(HOME_RADIUS_CELLS);
    const off = timeWhen(5, false);
    expect(tripArea(at(130, 130), 1, home, 5, off)).toEqual({ x: 128, y: 128, radius: HOME_RADIUS_CELLS });
    expect(tripArea(at(130, 130), 1, { x: 128, y: 128 }, 5, t)).toEqual({
      x: 128,
      y: 128,
      radius: HOME_RADIUS_CELLS,
    });
  });

  it("쉬는 시간: 시험 봇·다가가는 중은 예전 값, 일터 안은 길게, 집 둘레 안은 조금 길게(난수는 한 번)", () => {
    const t = timeWhen(5, true);
    const off = timeWhen(5, false);
    for (let seed = 1; seed <= 20; seed++) {
      const plain = idleMs(createRng(seed));
      expect(arrivalIdleMs(createRng(seed), { id: 5, size: 1, home: undefined }, at(10, 10), t)).toBe(plain);
      // 일하는 몫인데 일터 밖(다가가는 중)
      expect(arrivalIdleMs(createRng(seed), { id: 5, size: 1, home }, at(200, 200), t)).toBe(plain);
      const working = arrivalIdleMs(createRng(seed), { id: 5, size: 1, home }, at(62, 60), t);
      expect(working).toBeGreaterThanOrEqual(45_000);
      expect(working).toBeLessThanOrEqual(135_000);
      const resting = arrivalIdleMs(createRng(seed), { id: 5, size: 1, home }, at(130, 130), off);
      expect(resting).toBeGreaterThanOrEqual(8_000);
      expect(resting).toBeLessThanOrEqual(24_000);
    }
  });
});

describe("보이는 운반 일정(D-570 1886)", () => {
  const work = { x: 60, y: 60, radius: 5 };
  const store = { x: 90, y: 60, radius: 4 };

  it("운반 일정 동안은 창고 둘레로, 끝나면 일터로. 창고에 닿으면 일정 끝까지 서 있고, 일터에서는 일정 시작에 깬다", () => {
    const t = timeWhen(5, true);
    const home = { x: 128, y: 128, work, haul: { area: store, fromMs: t + 10_000, untilMs: t + 70_000 } };
    expect(tripArea(at(62, 58), 1, home, 5, t)).toEqual(work);
    expect(tripArea(at(62, 58), 1, home, 5, t + 10_000)).toEqual(store);
    expect(tripArea(at(90, 60), 1, home, 5, t + 70_000)).toEqual(work);
    // 일터 안: 다가오는 일정 시작에 맞춰 깬다
    expect(arrivalIdleMs(createRng(1), { id: 5, size: 1, home }, at(60, 60), t)).toBe(10_000);
    // 창고 둘레: 일정 끝까지
    expect(arrivalIdleMs(createRng(1), { id: 5, size: 1, home }, at(90, 60), t + 20_000)).toBe(50_000);
  });
});
