// 실제 운반 하나의 꼴(gather/station.ts carry — 거래소 넣기·창고 꺼내기·사업장 판매 운반·배 상하역·NPC 맡기기가 같이 쓴다). station.ts 줄 수 때문에 따로 둔다.
// 기획 D-555 1505("자동운반이란 어떤 유닛이든 실제로 옮겨야한다"), D-576(물류센터 맡기기), docs/adr/2026-11-16-logistics-center.md.

/** 실제 운반 하나(기획 D-555 1505) */
export interface CarrySpec {
  /** 물건 주인(운반꾼은 이 주인 몫을 진다) */
  readonly ownerId: number;
  /** 운반꾼을 고르는 건물(그 건물 일꾼 먼저, 같은 건물·주인 짐은 합친다) */
  readonly buildingId: number;
  readonly mapKey: number;
  readonly cityId: number;
  /** 꺼내는 원장 위치 / 닿으면 넣는 원장 위치 */
  readonly source: number;
  readonly deliverTo: number;
  /** 걷는 길(배치 칸) — 거리 셈과 운반꾼 걸음 */
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly loads: readonly { readonly asset: string; readonly qty: bigint }[];
  readonly atMs: number;
  /** 바로 옮길 때(옮김 셈 끔·거리 0) 거래 이름 */
  readonly instantKind: string;
  /** 닿을 때 받을 자리를 다시 고른다(porter.ts PorterTrip.redirect) */
  readonly redirect?: (() => number | undefined) | undefined;
  /**
   * 물류센터에 맡기기(기획 D-576): 건물 ID = 그 물류센터, auto = 내 운반꾼이 없으면 같은 도시의 가장 싼 곳, own = 내 운반꾼만. 없으면 계정 자동 맡기기
   * (haulService.auto — 켰으면 auto, 기획 대조 2272)
   */
  readonly via?: HaulVia | undefined;
  /** 판매(D-569 1781): 물건을 내주는 사람(판 사람 몫을 산 사람 화물로 — porter.ts sourceOwnerId). 없으면 물건 주인 */
  readonly sellerId?: number | undefined;
  /** 물류센터 요금을 낸 뒤에도 물건 주인 지갑에 남아야 할 돈(같은 화폐 — 사업장 사기의 물건 값) */
  readonly keep?: { readonly asset: string; readonly amount: bigint } | undefined;
}

/** 운반 맡기기 고르기(프로토콜 haulViaSchema) */
export type HaulVia = number | "auto" | "own";

/** 실제 운반 결과: 닿는 시각(바로 옮겼으면 atMs, porter 없음)이나 운반꾼이 없는 까닭 */
export type CarryResult =
  | { readonly arriveAtMs: number; readonly porter?: number }
  | "unit_busy"
  | "unknown_unit"
  // 물류센터(D-576): 나를 일꾼 없음·받지 않음(고를 수 없는 건물 포함)·요금 모자람
  | "no_shop_worker"
  | "service_closed"
  | "insufficient_funds";
