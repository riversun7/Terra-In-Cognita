// 식품 포장(D-524, 사용자 2026-11-08 "음식은 포장된것만 스택. 포장 해제시 신선도 하락시작") — docs/adr/2026-11-03-item-holdings.md
// "바뀜 (D-524, 2026-11-08)". 서버(apps/server/src/holdings/)가 쓰는 판정 한 벌이다. 정수만 쓴다.
// - 포장된 식품 칸(lot, packed)만 겹쳐 쌓인다. 포장된 동안은 숙성이 멈춘다(보존 배율 0과 같다, 해석 — 거래소 포장 D-289와 같은 뜻).
// - 포장을 풀면 낱개(수량 1 칸 하나하나)가 되고 그 시각부터 보관 곳 배율(D-512 322)로 숙성한다. 신선도 × 효과(D-512 320)는 풀린 것에도
//   포장된 것에도 그 칸의 지금 신선도를 쓴다(포장된 것은 멈춘 값).
// - 다시 포장하기는 정하지 않았다(지금은 없음, 질문 843). 거래소에는 포장된 식품만 올린다(D-524·D-289, 문턱 E14).
import type { AgeState, PreservePm } from "./holding.ts";

/** 칸의 실제 보존 배율: 포장된 동안은 멈춤(0), 풀린 것은 보관 곳 배율(음수는 0) */
export function lotPreserve(packed: boolean, placePm: PreservePm): PreservePm {
  return packed ? 0 : Math.max(0, placePm);
}

/** 포장 풀기 명령 하나가 만드는 낱개 수 상한([임시], 질문 840 — 낱개는 칸 하나하나라 한 번에 너무 많이 만들지 않는다) */
export const UNPACK_MAX = 100;

/** 포장 풀기 한 번의 결과 */
export interface UnpackPlan {
  /** 푸는 수 = 새 낱개 칸 수 */
  readonly count: number;
  /** 포장 칸에 남는 수(0이면 칸이 사라진다) */
  readonly left: number;
  /** 낱개 하나하나의 숙성 상태: 포장 때 멈춘 숙성 값에서 nowMs부터 흐른다 */
  readonly age: AgeState;
}

/**
 * 포장 칸 하나에서 want개를 푼다(1 ≤ 푸는 수 ≤ min(수량, UNPACK_MAX)). 포장이 아니거나 신선도가 없는 칸이면 null.
 * 포장된 숙성은 멈춰 있으므로 낱개의 숙성 ms = 포장 칸의 숙성 ms 그대로, 기준 시각 = nowMs(되돌아가지 않는다)
 */
export function planUnpack(
  lot: { readonly quantity: number; readonly packed: boolean; readonly age: AgeState | null },
  want: number,
  nowMs: number,
): UnpackPlan | null {
  if (!lot.packed || lot.age === null || lot.quantity < 1) return null;
  const count = Math.max(1, Math.min(lot.quantity, Math.floor(want), UNPACK_MAX));
  return {
    count,
    left: lot.quantity - count,
    age: { agedMs: lot.age.agedMs, atMs: Math.max(lot.age.atMs, nowMs) },
  };
}

/**
 * 거래소에 올릴 수 있는 식품 칸인가(D-524 "포장된 것만"·D-289 "거의 신선한 것만"): 포장되어 있고 신선도 ≥ 문턱(‰, 설정 칸 E14).
 * 풀린 낱개는 다시 포장할 수 없어(질문 843) 올리지 못한다. 보유 칸 → 거래소 입고 길은 아직 없다(지금 거래소는 원장 물자만 — 원장 식품은
 * 신선도가 없는 포장 묶음이다). 그 길을 여는 줄기가 이 함수로 거른다
 */
export function exchangeListable(
  lot: { readonly packed: boolean },
  freshnessPm: number,
  thresholdPm: number,
): boolean {
  return lot.packed && freshnessPm >= thresholdPm;
}
