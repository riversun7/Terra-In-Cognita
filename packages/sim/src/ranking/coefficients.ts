// 랭킹 계수 — 기획 20 §8(D-037 감쇠형·D-041 백분위 등급·D-042 공통 장치), docs/adr/2026-11-07-ranking.md.
// 세력·사회 계수표 ranking 칸(팩 tuning 경로 "ranking.*", 설정 칸 [임시] — 49에 칸이 없어 코드는 비운다). 서버 랭킹 집계가 집계마다 읽는다.
// 시뮬레이터는 아직 읽지 않는다(NPC가 랭킹을 보고 판단하는 규칙은 D-043 영향 — 다음 줄기).

/** 세력 판 점수(세력 규모, D-322와 같은 재료: 도시·휴먼·국고) */
export interface RankingFactionWeights {
  /** 도시 하나의 점수 */
  readonly cityPoints: number;
  /** 도시 발전도 1점의 점수 */
  readonly developmentPoints: number;
  /** 휴먼 하나의 점수 */
  readonly humanPoints: number;
  /** 국고(시험 화폐) 몇 단위가 1점인가 */
  readonly treasuryUnit: number;
}

export interface RankingCoefficients {
  /** 집계 주기(ms). 경계 = 주기의 배수(UTC 기준) — 하루면 UTC 0시(NPC 하루 끝과 같은 때) */
  readonly periodMs: number;
  /** 집계마다 줄어드는 몫(‰, D-037 "주 10~15%" 예 → 하루 18‰ ≈ 주 12%) */
  readonly decayPm: number;
  /** 백분위 등급 문턱(‰, 오름차순 넷, D-041 예 상위 1·5·20·50%) */
  readonly tiersPm: readonly number[];
  /** 최상위 표시 순위(1…n, D-041 별도 혜택 — 혜택 내용은 미정) */
  readonly topRanks: number;
  /** 언더독 배율 상한(‰, D-042 ①: 상대 전력 ÷ 내 전력, 강자를 이기면 크게, 약자를 이기면 0에 가깝게) */
  readonly underdogCapPm: number;
  readonly faction: RankingFactionWeights;
}

/** [임시] 출발값(D-515: 수치는 밸런싱 단계, 설정 칸에서 맞춘다) */
export const TEST_RANKING_COEFFICIENTS: RankingCoefficients = {
  periodMs: 24 * 60 * 60 * 1000,
  decayPm: 18,
  tiersPm: [10, 50, 200, 500],
  topRanks: 3,
  underdogCapPm: 4000,
  faction: { cityPoints: 1000, developmentPoints: 10, humanPoints: 100, treasuryUnit: 1000 },
};
