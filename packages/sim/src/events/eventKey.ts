// 같은 시각 예약의 차례 키 — docs/adr/2026-10-31-s3-server-stage.md 1절 "같은 시각의 순서 = (시각, 종류, 대상 ID)"
// 서버(2차맵 예약)와 시뮬레이터(docs/adr/2026-10-31-rules-simulator.md)가 같은 비교 함수를 쓴다.
// 키로 차례를 정하면 넣은 차례(실행 이력)와 상관없이 상태만으로 차례가 정해진다 → 다시 켜서 다시 걸어도 같은 차례.

export interface EventKey {
  /** 예약 종류. 지역 설정이 아니라 문자 코드 순서로 비교한다(localeCompare는 실행 환경마다 다를 수 있다) */
  readonly kind: string;
  /** 대상 ID(유닛·세력 등) */
  readonly subject: number;
}

/** 종류 → 대상 차례. 시각은 큐가 먼저 비교하고, 키가 같으면 큐가 예약 번호로 가른다 */
export function compareEventKeys(a: EventKey, b: EventKey): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return a.subject - b.subject;
}
