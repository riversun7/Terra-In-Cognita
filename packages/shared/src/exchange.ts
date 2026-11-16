// 거래소 건물(기획 D-561 "거래소는 건물", D-560 시설 분류 상업, D-564 1628·D-569 1784 "거래소로 실어 나른 물건만") — 공용 이름·규칙.
// docs/adr/2026-11-16-exchange-buildings.md. 팩 스키마(@terra/content facilities exchange 칸)·서버(apps/server/src/market)·화면이 같은 값을 쓴다.
// - 거래소 종류(팩 시설 exchange 칸): goods = 물자 거래소(도시 × 물건 호가창, D-117·D-125), fx = 외환 거래소(나라 화폐 ↔ 기준 통화 동시호가),
//   units = 유닛 거래소(D-242 — 경매 기능이 아직 없어 잠금), securities = 증권 거래소(D-393·D-409 출시 뒤 잠금).
// - 도시마다 종류마다 하나(D-117 "도시마다 거래소"): 같은 도시에 같은 종류를 둘 짓지 않는다. 그 도시의 그 종류 거래소 = 다 지은(레벨 1 이상) 것
//   가운데 건물 ID가 가장 작은 것 [임시].
// - 주문 한도(D-148 "거래소에 배치한 유닛의 INT·WIS는 낼 수 있는 주문 수의 한도만 늘린다"): 기본 ORDER_BASE + 그 종류 거래소 건물의
//   거래 직무 유닛(D-571 1944 "거래소에 배치, 거래소 개인 창고·거래 물품 관리") 마다 ⌊(INT + WIS) ÷ EXCHANGE_STAT_DIVISOR⌋, 더하는 몫 위 끝
//   EXCHANGE_BONUS_MAX [임시]. 바뀜 (D-571): 예전 "건물 3칸 안에 선 유닛"(EXCHANGE_STATION_CELLS)을 없앴다.
// - 개인 창고(D-571 1943 "유닛마다 작은 한도 창고, 비용 내면 확장"): 그 도시 물자 거래소 건물 창고에서 주인마다 쓰는 자리 = 기본 크기 + 넓힌 칸 × 한
//   칸(설정 칸 exchange_locker_*). 쓰는 무게 = 창고 물건 + 걸어 둔 팔 물건 + 걸어 둔 사기 남은 수량(lockerFits).
// 정수 연산만 쓴다.

/** 거래소 종류(팩 facilities.json exchange 칸). 한 번 쓴 이름은 다른 뜻으로 다시 쓰지 않는다 */
export const EXCHANGE_KINDS = ["goods", "fx", "units", "securities"] as const;
export type ExchangeKind = (typeof EXCHANGE_KINDS)[number];

/** 잠긴 거래소와 까닭: after_launch = 출시 뒤 연다(D-393·D-409), not_ready = 기능이 아직 없다(유닛 경매 D-242) */
export const EXCHANGE_LOCKS: Readonly<Partial<Record<ExchangeKind, "after_launch" | "not_ready">>> = {
  units: "not_ready",
  securities: "after_launch",
};

/** 잠긴 거래소인가(짓지 못한다) */
export const exchangeLocked = (kind: ExchangeKind): boolean => EXCHANGE_LOCKS[kind] !== undefined;

/** 거래소 종류 이름표인가 */
export function isExchangeKind(value: unknown): value is ExchangeKind {
  return typeof value === "string" && (EXCHANGE_KINDS as readonly string[]).includes(value);
}

/** [임시] 걸어 둘 수 있는 기본 주문 수(질문 149 기본안 → D-443 출발값 — 옛 ORDER_MAX) */
export const ORDER_BASE = 10;
/** [임시] 배치 유닛 하나가 더하는 주문 수 = ⌊(INT + WIS) ÷ 이 값⌋(질문 1944) */
export const EXCHANGE_STAT_DIVISOR = 20;
/** [임시] 배치 유닛이 더하는 주문 수 합의 위 끝(질문 1944) */
export const EXCHANGE_BONUS_MAX = 40;

/** 배치 유닛 하나가 더하는 주문 수(INT·WIS는 입은 장비·버프를 넣은 값) */
export function stationBonus(int: number, wis: number): number {
  const sum = Math.max(0, Math.trunc(int)) + Math.max(0, Math.trunc(wis));
  return Math.floor(sum / EXCHANGE_STAT_DIVISOR);
}

/** 주문 한도 = 기본 + 배치 유닛 몫 합(위 끝까지) */
export function orderLimit(bonuses: readonly number[]): number {
  let sum = 0;
  for (const bonus of bonuses) sum += Math.max(0, Math.trunc(bonus));
  return ORDER_BASE + Math.min(EXCHANGE_BONUS_MAX, sum);
}

/** 개인 창고 크기(g) = 기본 + 넓힌 칸 × 한 칸. 음수·틀린 값은 0으로 본다 */
/** 0 이상 정수 BigInt(틀린 값·음수는 0) */
const whole = (value: number): bigint =>
  Number.isFinite(value) && value > 0 ? BigInt(Math.trunc(value)) : 0n;

export function lockerCapacityG(baseG: number, stepG: number, steps: number): bigint {
  return whole(baseG) + whole(stepG) * whole(steps);
}

/** 개인 창고에 더 넣을 수 있나: 지금 쓰는 무게 + 더할 무게 ≤ 크기(더할 무게가 0 이하면 늘 된다) */
export function lockerFits(usedG: bigint, addG: bigint, capacityG: bigint): boolean {
  return addG <= 0n || usedG + addG <= capacityG;
}
