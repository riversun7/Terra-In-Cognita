// 신전·종교(유저 휴먼) — 기획 D-517(사용자 원문 "수명이다하면 비활성 상태가 되어 환생(종교시설)이나 유전자 조각(생명과학연구소)으로 변환",
// 395 나의 "안 고르면 떠남"을 바꿈)·D-021(종교 = 환생·신격화)·D-311(신관이 신전에서 집전, 신격화 = 그 도시 수호신, 도시당 상한 S15, 유전자는
// D-517로 빠짐)·D-440(환생 = 레벨 1·환생 횟수 +1)·D-441(비용 = 신앙도·화폐)·D-444 165·D-451(신앙도 = 문턱, 환생하면 0)·D-455 186,
// docs/adr/2026-11-07-temple-religion.md.
// - 비활성: 수명 끝(태어난 시각 + 수명) ≤ 지금. 일하지 않고, 고르지 않으면 그대로 남는다. 기다림 상한(설정 칸)은 출발값이 없어 0 = 상한 없음
//   이고, 0보다 크면 수명 끝 + 상한에 떠난다(유전자를 남김 — [임시], 질문). 저장하지 않고 셈한다.
// - 신전 의식: 환생(레벨 1·태어난 시각 = 지금·수명 다시(T4)·환생 +1·신앙도 0) / 신격화(그 도시 수호신, 도시당 상한). 비용 = 신앙도 문턱 + 화폐.
//   유전자는 들지 않는다(D-517). 유전자로 바꾸는 길은 생명과학 연구소(서버 유전자 명령)다.
// - 신앙도 얻는 길(옛 REL-1 기도·헌금): 기도 = 한 번에 prayFaith(쿨다운), 헌금 = max(1, ⌊금액 ÷ offeringPerFaith⌋). 신앙도는 FAITH_MAX에서
//   멈추고 신앙 포인트는 다 쌓인다(D-451·D-455 186).
// - 수호신(기획 답 456 가·470 가·471 가): 새 종류 유닛으로 그 도시에 남아 방어전에 나서고 도시 버프 하나. 버프 종류는 기획이 고르지 않고
//   수호신마다 편집기 칸(GUARDIAN_BUFFS, 출발값 방어). 방어 = 그 도시가 공격받는 전투의 수비 유닛 방어율 + guardianDefensePm, 만족도 = 그 도시
//   휴먼 만족도 하루 + guardianSatisfactionMilli, 생산 = 그 도시 시설 산출 + guardianProductionPm ‰. 모두 수호신마다 더하고 도시당 상한(S15)이
//   묶는다 [임시].
// 시뮬은 이 규칙을 쓰지 않는다(NPC 휴먼은 D-395 확률, population.ts). 정수만 쓴다.
import type { SocietyCoefficients } from "./coefficients.ts";
import { FAITH_MAX, FAITH_POINTS_MAX } from "./faith.ts";
import { lifespanMs } from "./population.ts";

/** 신전 계수(팩 tuning 경로 "temple.*", 49 S15 + [임시] 칸) */
export interface TempleCoefficients {
  /** 비활성 기다림 상한(수명 끝 → 떠남, ms). 0 = 상한 없음(D-517 출발값 없음) */
  readonly inactiveCapMs: number;
  /** 휴먼 환생 신앙도 문턱(환생하면 0, D-451) */
  readonly rebirthFaith: number;
  /** 휴먼 환생 화폐(최소 단위) */
  readonly rebirthCurrency: number;
  /** 신격화 신앙도 문턱 */
  readonly deifyFaith: number;
  /** 신격화 화폐(최소 단위) */
  readonly deifyCurrency: number;
  /** 수호신 도시당 상한(49 S15) */
  readonly guardianCap: number;
  /** 기도 한 번 신앙도(옛 +1) */
  readonly prayFaith: number;
  /** 기도 쿨다운(옛 1시간) */
  readonly prayCooldownMs: number;
  /** 헌금: 신앙도 1당 화폐(옛 50) */
  readonly offeringPerFaith: number;
  /** 수호신 방어 버프(기획 답 456 가): 그 도시 수비 유닛 방어율 ‰(방어 버프 수호신마다 더함) [임시] */
  readonly guardianDefensePm: number;
  /** 수호신 만족도 버프(기획 답 470 가): 그 도시 휴먼 만족도 하루 +(밀리점, 수호신마다 더함) [임시] */
  readonly guardianSatisfactionMilli: number;
  /** 수호신 생산 버프(기획 답 470 가): 그 도시 시설 산출 + ‰(수호신마다 더함) [임시] */
  readonly guardianProductionPm: number;
}

const HOUR_MS = 3_600_000;

/**
 * 출발값: 기도 +1·쿨다운 1시간·헌금 50당 +1은 옛 religion_routes.js. 환생 신앙도 50·화폐 10,000은 사이보그 N34 [임시]와 같게, 신격화 신앙도
 * 100은 D-311 예("신앙도 100인 휴먼 장군"). 기다림 상한은 D-517 출발값 없음(0 = 상한 없음). 신격화 화폐 20,000·수호신 상한 3·수호신 버프
 * (방어 100‰·만족도 하루 1점 = 1,000밀리점·생산 100‰)은 [임시]
 */
export const OLD_TEMPLE_COEFFICIENTS: TempleCoefficients = {
  inactiveCapMs: 0,
  rebirthFaith: 50,
  rebirthCurrency: 10_000,
  deifyFaith: 100,
  deifyCurrency: 20_000,
  guardianCap: 3,
  prayFaith: 1,
  prayCooldownMs: HOUR_MS,
  offeringPerFaith: 50,
  guardianDefensePm: 100,
  guardianSatisfactionMilli: 1000,
  guardianProductionPm: 100,
};

/**
 * 수호신 도시 버프 종류(기획 답 456 가 "도시 버프 하나", 종류는 수호신마다 편집기 칸, 출발값 방어 — 효과는 470 가). 저장된 값이라 이름을
 * 바꾸거나 지우지 않는다
 */
export const GUARDIAN_BUFFS = ["defense", "satisfaction", "production"] as const;
export type GuardianBuff = (typeof GUARDIAN_BUFFS)[number];
/** 새 수호신의 버프(출발값) */
export const DEFAULT_GUARDIAN_BUFF: GuardianBuff = "defense";

/** 수호신 버프 값인가(DB·메시지에서 읽은 글자) */
export const isGuardianBuff = (value: unknown): value is GuardianBuff =>
  typeof value === "string" && (GUARDIAN_BUFFS as readonly string[]).includes(value);

/** 버프 종류 하나의 수호신 한 명 몫(설정 칸, 음수는 0) */
function guardianBuffUnit(kind: GuardianBuff, c: TempleCoefficients): number {
  const value =
    kind === "defense"
      ? c.guardianDefensePm
      : kind === "satisfaction"
        ? c.guardianSatisfactionMilli
        : c.guardianProductionPm;
  return Math.max(0, Math.floor(value));
}

/**
 * 그 도시 수호신 버프 종류 하나의 합(471 가 — 수호신마다 더하고 도시당 상한 S15가 묶는다): 그 종류 수호신 수 × 한 명 몫. 방어 = 수비 유닛
 * 방어율 ‰, 만족도 = 휴먼 만족도 하루 + 밀리점, 생산 = 시설 산출 + ‰
 */
export function guardianBuffValue(
  buffs: readonly GuardianBuff[],
  kind: GuardianBuff,
  c: TempleCoefficients,
): number {
  return buffs.filter((buff) => buff === kind).length * guardianBuffUnit(kind, c);
}

/** 그 도시 수비 유닛의 방어율 더하기(‰): 방어 버프 수호신 수 × guardianDefensePm(음수는 0) */
export function guardianDefensePm(buffs: readonly GuardianBuff[], c: TempleCoefficients): number {
  return guardianBuffValue(buffs, "defense", c);
}

/** 신전 의식: 환생·신격화 */
export const TEMPLE_RITES = ["rebirth", "deify"] as const;
export type TempleRite = (typeof TEMPLE_RITES)[number];

export interface InactiveWindow {
  /** 비활성이 된 시각(수명 끝) */
  readonly sinceMs: number;
  /** 떠나는 시각(수명 끝 + 상한). 상한이 없으면 null(떠나지 않음) */
  readonly departsAtMs: number | null;
}

/** 비활성 구간(수명 끝 ~ 떠남). 상한이 0 이하면 떠나지 않는다 */
export function inactiveWindow(bornAtMs: number, lifespan: number, c: TempleCoefficients): InactiveWindow {
  const sinceMs = bornAtMs + lifespan;
  return { sinceMs, departsAtMs: c.inactiveCapMs > 0 ? sinceMs + c.inactiveCapMs : null };
}

/** 지금 비활성인가(수명 끝 ≤ 지금, 떠날 때 전) */
export function isInactiveAt(window: InactiveWindow, nowMs: number): boolean {
  return window.sinceMs <= nowMs && (window.departsAtMs === null || nowMs < window.departsAtMs);
}

/** 의식 비용(신앙도 문턱·화폐) */
export function riteCost(rite: TempleRite, c: TempleCoefficients): { faith: number; currency: bigint } {
  return rite === "rebirth"
    ? { faith: c.rebirthFaith, currency: BigInt(Math.max(0, c.rebirthCurrency)) }
    : { faith: c.deifyFaith, currency: BigInt(Math.max(0, c.deifyCurrency)) };
}

export type RiteBlocker = "not_inactive" | "faith" | "currency" | "guardian_cap";

export interface RiteInput {
  readonly rite: TempleRite;
  readonly nowMs: number;
  readonly window: InactiveWindow;
  readonly faith: number;
  readonly currency: bigint;
  /** 그 도시의 수호신 수(신격화만 본다) */
  readonly guardians: number;
}

/** 의식을 막는 것(비어 있으면 할 수 있다): 비활성, 신앙도 문턱, 화폐, (신격화) 도시당 상한 차례 */
export function riteBlockers(input: RiteInput, c: TempleCoefficients): RiteBlocker[] {
  const out: RiteBlocker[] = [];
  const cost = riteCost(input.rite, c);
  if (!isInactiveAt(input.window, input.nowMs)) out.push("not_inactive");
  if (input.faith < cost.faith) out.push("faith");
  if (input.currency < cost.currency) out.push("currency");
  if (input.rite === "deify" && input.guardians >= c.guardianCap) out.push("guardian_cap");
  return out;
}

/** 환생에서 바뀌는 휴먼 칸 */
export interface RebornHuman {
  readonly level: number;
  readonly rebirths: number;
  readonly bornAtMs: number;
  readonly lifespanMs: number;
  readonly faith: number;
}

/**
 * 휴먼 환생(D-440·D-451): 레벨 1, 태어난 시각 = 지금, 수명 = T4 굴림(0~9999), 환생 횟수 +1, 신앙도 0. 스탯·속성·배운 스킬은 그대로
 * [임시](휴먼 행에 K가 없다). 신앙 포인트는 남는다(D-451)
 */
export function rebirthHuman<T extends RebornHuman>(
  human: T,
  nowMs: number,
  lifespanRoll: number,
  society: SocietyCoefficients,
): T {
  return {
    ...human,
    level: 1,
    rebirths: human.rebirths + 1,
    bornAtMs: nowMs,
    lifespanMs: lifespanMs(lifespanRoll, society),
    faith: 0,
  };
}

/** 기도·헌금 한 번이 쌓는 양: 기도 = prayFaith, 헌금 = max(1, ⌊금액 ÷ offeringPerFaith⌋)(옛 religion_routes.js). 신앙 포인트 상한에서 자른다 */
export function devotionGain(kind: "pray" | "offer", amount: bigint, c: TempleCoefficients): number {
  if (kind === "pray") return Math.max(0, c.prayFaith);
  const per = BigInt(Math.max(1, c.offeringPerFaith));
  const gain = amount / per;
  if (gain > BigInt(FAITH_POINTS_MAX)) return FAITH_POINTS_MAX;
  return Math.max(1, Number(gain));
}

/** 신앙도·포인트에 얻은 양을 더한다(신앙도는 FAITH_MAX에서 멈춤, 포인트는 상한에서 자름 — D-451·D-455 186) */
export function addDevotion(
  faith: number,
  points: number,
  gain: number,
): { readonly faith: number; readonly faithPoints: number } {
  const add = Math.max(0, Math.floor(gain));
  return {
    faith: Math.min(FAITH_MAX, Math.max(0, faith) + add),
    faithPoints: Math.min(FAITH_POINTS_MAX, Math.max(0, points) + add),
  };
}
