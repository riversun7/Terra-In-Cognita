// 거래소 건물(기획 D-561 "거래소는 건물", D-560 시설 분류 상업, D-564 1628·D-569 1784 "거래소로 실어 나른 물건만") — 공용 이름·규칙.
// docs/adr/2026-11-16-exchange-buildings.md. 팩 스키마(@terra/content facilities exchange 칸)·서버(apps/server/src/market)·화면이 같은 값을 쓴다.
// - 거래소 종류(팩 시설 exchange 칸): goods = 물자 거래소(도시 × 물건 호가창, D-117·D-125), fx = 외환 거래소(나라 화폐 ↔ 기준 통화 동시호가),
//   units = 유닛 거래소(D-242 — 경매 기능이 아직 없어 잠금), securities = 증권 거래소(D-393·D-409 출시 뒤 잠금).
// - 도시마다 종류마다 하나(D-117 "도시마다 거래소"): 같은 도시에 같은 종류를 둘 짓지 않는다. 그 도시의 그 종류 거래소 = 다 지은(레벨 1 이상) 것
//   가운데 건물 ID가 가장 작은 것 [임시].
// - 주문 한도(D-148 "거래소에 배치한 유닛의 INT·WIS는 낼 수 있는 주문 수의 한도만 늘린다"): 기본 ORDER_BASE + 그 종류 거래소 건물 둘레
//   EXCHANGE_STATION_CELLS 칸 안에 선 내 유닛마다 ⌊(INT + WIS) ÷ EXCHANGE_STAT_DIVISOR⌋, 더하는 몫 위 끝 EXCHANGE_BONUS_MAX [임시](질문 1944).
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
/** [임시] 거래소 건물 둘레 몇 칸 안(건물 칸에서 체비셰프 거리)에 선 유닛을 "배치"로 보나(질문 1944) */
export const EXCHANGE_STATION_CELLS = 3;
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

/** 건물 칸(왼쪽 위·가로·세로)에서 칸까지 체비셰프 거리(안이면 0) */
export function cellsFromRect(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  x: number,
  y: number,
): number {
  const dx = x < rect.x ? rect.x - x : x >= rect.x + rect.width ? x - (rect.x + rect.width - 1) : 0;
  const dy = y < rect.y ? rect.y - y : y >= rect.y + rect.height ? y - (rect.y + rect.height - 1) : 0;
  return Math.max(dx, dy);
}
