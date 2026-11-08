// 행성 달력(공용, 결정적): 서버 UTC 시각(ms) → 행성 날짜(하루·계절·한 해). ADR 2026-10-29-primary-map-sky 2절.
// - 기획 값: 낮·밤 한 번 = 실제 1시간, 계절 하나 = 7일(실제 7시간), 한 해 = 4계절 = 28일(실제 28시간)(D-091·D-5030).
//   지역 시각은 경도로 정한다(D-091). 시간 기준은 서버 UTC다(PLAN 4.6).
// - 지역 시각(낮밤)은 판정에 쓰지 않는다(D-142). 판정은 계절만 쓴다(D-118 계절 보정, 남반구는 반대).
// - 서버의 계절 보정과 기기의 하늘(엔진 sky.ts)이 이 모듈 하나를 쓴다. 그래서 보이는 계절이 판정 계절과 같다.
// - 결정성 검사 대상이다(scripts/check-boundaries.mjs): 정수 사칙연산과 명세가 정한 Math.floor만 쓴다.
//   초월함수·Date·현재 시각은 쓰지 않는다(기원도 정수 글자로 적는다).
// - 진입점은 @terra/shared/planetCalendar다. 첫 화면이 쓰지 않으므로 index.ts에서 내보내지 않는다(ADR 2026-10-29-app-shell의
//   @terra/shared/dashboard와 같은 관례). 맨 위에서 부르는 코드를 두지 않는다(package.json "sideEffects": false).
// - 하루·계절·한 해와 기원은 docs/PROTECTED.md 대상이다.

/** 낮·밤 한 번(ms) = 실제 1시간 */
export const PLANET_DAY_MS = 3_600_000;
/** 계절 하나의 날 수 */
export const PLANET_DAYS_PER_SEASON = 7;
/** 한 해의 계절 수 */
export const PLANET_SEASONS_PER_YEAR = 4;
/** 한 해의 날 수(28) */
export const PLANET_DAYS_PER_YEAR = PLANET_DAYS_PER_SEASON * PLANET_SEASONS_PER_YEAR;
/** 계절 하나(ms) = 실제 7시간 */
export const PLANET_SEASON_MS = PLANET_DAY_MS * PLANET_DAYS_PER_SEASON;
/** 한 해(ms) = 실제 28시간(100,800,000) */
export const PLANET_YEAR_MS = PLANET_DAY_MS * PLANET_DAYS_PER_YEAR;

/**
 * [임시] 달력 기원 = 2026-10-01T00:00:00Z: 경도 0에서 0년 0일 0시, 북반구 봄 첫날.
 * 지난 날짜라 지금의 날·해 번호가 음수가 아니다. 정시라 경도 0의 자정이 매 정시 UTC(= 매 정시 KST)다.
 * 출시 전에 기획 답(docs/questions/2026-10-29-game-calendar.md 질문 1)으로 한 번 정하고, 출시 뒤에는 바꾸지 않는다.
 * 바꾸면 연도·나이(D-021)·계절(D-118)이 모두 밀린다.
 */
export const PLANET_CALENDAR_EPOCH_MS = 1_790_812_800_000;

/** 계절 번호(북반구 이름): 0 봄, 1 여름, 2 가을, 3 겨울. 남반구는 southernSeason으로 바꾼다 */
export type PlanetSeason = 0 | 1 | 2 | 3;

/** 한 시각의 행성 날짜. 모두 정수다. 기원 앞은 날·해 번호가 음수이고, 안쪽 ms·날은 늘 0 이상이다 */
export interface PlanetCalendar {
  /** 기원에서 잰 시간(ms) = 입력 − 기원 */
  readonly msSinceEpoch: number;
  /** 기원부터 센 날(0일부터) */
  readonly dayIndex: number;
  /** 경도 0에서 그날 0시부터 지난 시간(ms, 0 이상 PLANET_DAY_MS 미만). 지역 시각(낮밤)은 화면 연출만 쓴다(D-142) */
  readonly msIntoDay: number;
  /** 기원부터 센 해(0년부터) */
  readonly yearIndex: number;
  /** 그해 첫날 0시부터 지난 시간(ms, 0 이상 PLANET_YEAR_MS 미만) */
  readonly msIntoYear: number;
  /** 그해의 몇째 날(0~27) */
  readonly dayOfYear: number;
  /** 계절 번호(북반구 기준). 판정의 계절 보정은 이 값과 반구로 정한다(D-118·D-142) */
  readonly season: PlanetSeason;
  /** 그 계절의 몇째 날(0~6) */
  readonly dayOfSeason: number;
}

/** 내림 나눗셈: 나머지(0 이상 d 미만)를 먼저 구해 몫이 늘 나누어떨어지게 한다. x·d가 안전 정수면 정확하다 */
function floorDivMod(x: number, d: number): { readonly q: number; readonly r: number } {
  const r = ((x % d) + d) % d;
  return { q: (x - r) / d, r };
}

/** 계절 번호를 타입으로 좁힌다(0~3 밖은 계산 실수라 던진다) */
function toSeason(index: number): PlanetSeason {
  if (index === 0 || index === 1 || index === 2 || index === 3) return index;
  throw new RangeError(`season index must be 0..3: ${index}`);
}

/** planetCalendarAt이 받는 시각인가: 안전 정수이고, 기원에서 잰 ms도 안전 정수 */
export function isPlanetCalendarTime(utcMs: number): boolean {
  return Number.isSafeInteger(utcMs) && Number.isSafeInteger(utcMs - PLANET_CALENDAR_EPOCH_MS);
}

/**
 * 서버 UTC 시각(정수 ms)의 행성 날짜. 판정 쪽 입구다.
 * 받는 시각이 아니면(소수·NaN·무한대·안전 정수 밖) RangeError를 던진다: 판정 쪽 실수를 잡으려는 것이다.
 * 기기 시각(소수가 섞인다)은 planetCalendarForDisplay로 넘긴다.
 */
export function planetCalendarAt(utcMs: number): PlanetCalendar {
  if (!isPlanetCalendarTime(utcMs)) {
    throw new RangeError(`utcMs must be a safe integer within the calendar range: ${utcMs}`);
  }
  const msSinceEpoch = utcMs - PLANET_CALENDAR_EPOCH_MS;
  const day = floorDivMod(msSinceEpoch, PLANET_DAY_MS);
  const year = floorDivMod(msSinceEpoch, PLANET_YEAR_MS);
  const dayOfYear = floorDivMod(day.q, PLANET_DAYS_PER_YEAR).r;
  const inYear = floorDivMod(dayOfYear, PLANET_DAYS_PER_SEASON);
  return {
    msSinceEpoch,
    dayIndex: day.q,
    msIntoDay: day.r,
    yearIndex: year.q,
    msIntoYear: year.r,
    dayOfYear,
    season: toSeason(inYear.q),
    dayOfSeason: inYear.r,
  };
}

/**
 * 화면(엔진) 쪽 입구. 던지지 않는다(검토 H1).
 * 기기 시각 = Date.now() + 시계 차이에는 소수가 섞인다(clock.ts의 차이는 두 시각의 평균이라 x.5ms가 나온다). 그대로
 * planetCalendarAt에 넘기면 RangeError가 나고, 프레임 예약기는 그리는 함수의 예외를 잡지 않아 지도가 멈춘다.
 * 그래서 여기서 내림(Math.floor)한다. 내린 값이 받는 시각이 아니면(NaN·무한대·안전 정수 밖) null이다: 시각을 모르는 것과 같다.
 * 판정 코드는 이것을 쓰지 않는다(planetCalendarAt이 실수를 잡는다).
 */
export function planetCalendarForDisplay(utcMs: number): PlanetCalendar | null {
  const floored = Math.floor(utcMs);
  return isPlanetCalendarTime(floored) ? planetCalendarAt(floored) : null;
}

/** 남반구 계절(D-142: 북반구와 반대): 봄 ↔ 가을, 여름 ↔ 겨울 */
export function southernSeason(season: PlanetSeason): PlanetSeason {
  return toSeason((season + 2) % PLANET_SEASONS_PER_YEAR);
}

/**
 * 지역 시각(시, 0 이상 24 미만) = 24 × 경도 0의 하루 비율 + 경도 ÷ 15°(D-091: 지역 시각은 경도로). 1차맵 하늘·2차맵 빛(엔진 planet/sky.ts
 * localSolarHours)과 서버 NPC 휴먼의 낮밤 일(기획 답 770 나, apps/server/src/world/bots.ts)이 이 함수 하나를 쓴다 — 보이는 낮밤과 휴먼이 일터에
 * 가는 때가 같다. 실수 사칙연산만 쓴다(명세가 결과를 정한다). 화면 연출·보이는 움직임만이고 판정에 쓰지 않는다(D-142)
 */
export function localSolarHours(msIntoDay: number, lonDeg: number): number {
  const hours = (msIntoDay / PLANET_DAY_MS) * 24 + lonDeg / 15;
  return ((hours % 24) + 24) % 24;
}
