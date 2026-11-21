// 나라 의결(governance) 계수(팩 tuning 경로 "governance.*") — 기획 D-5057("정족수·투표 기간은 설정값, 급한 전쟁·강화 안건은 짧게" — 49 S34)·
// D-131(체제 전환 7일 유예)·질문 2351~2365 답(D-580·기획 대조), docs/adr/2026-11-21-governance.md. 서버 의결(apps/server/src/governance)만 읽는다.
// 시뮬은 의결 층이 없어(체제는 세울 때 정하고 바뀌지 않는다) 시뮬 판정·출력은 그대로다(SIM_VERSION 그대로). 수치는 모두 [임시] 출발값이다.

export interface GovernanceCoefficients {
  /** 투표 기간(ms, 실제 시간 D-5030): 지도자 묶음(선출·해임·체제 전환)·전쟁 묶음(선전포고 — 짧게, D-5057). S34 */
  readonly periodLeaderMs: number;
  readonly periodWarMs: number;
  /** 정족수(‰ — 던진 표(기권 포함) ÷ 투표권 전체, 2353): 지도자 묶음·전쟁 묶음. S34 */
  readonly quorumLeaderPm: number;
  readonly quorumWarPm: number;
  /** 가결 문턱(‰ — 찬성 × 1000 > 문턱 × (찬성 + 반대), 2354 출발값 나): 기본(선전포고)·체제 전환·지도자 해임 */
  readonly thresholdPm: number;
  readonly thresholdRegimePm: number;
  readonly thresholdRemovalPm: number;
  /** 지도자 임기(ms, 2357 — 민주주의·자본주의, 2주~1달). 독재는 임기가 없다 */
  readonly termMs: number;
  /** 선출 안건의 후보 등록 기간(ms, 2358 가 — 그 뒤 NPC가 표를 낸다. 투표 기간보다 길면 투표 기간 끝까지) */
  readonly registerMs: number;
  /** 체제 전환 유예(ms, D-131 "7일 유예" — 가결·직권 결정 뒤 이만큼 지나 집행) */
  readonly graceRegimeMs: number;
  /** 자본주의에서 안건을 올리고 후보로 나설 수 있는 의결권 몫 하한(‰ — 2351 가 "의결권 ≥ 설정값") */
  readonly proposeSharePm: number;
  /** 한 가문·주주가 동시에 열어 둘 수 있는 안건 수(2351 기술 기본값) */
  readonly openPerProposer: number;
  /** 임기 끝 자동 선출(1 = 켬): 임기가 끝나기 투표 기간 전에 선출 안건을 저절로 연다 */
  readonly autoElections: number;
  /** 선전포고 안건(1 = 켬): 가결되면 바로 전쟁(세력·사회 선전포고 — 무명분 비용 포함) */
  readonly warAgenda: number;
  /** NPC 투표 규칙식(D-323·D-554): 만족도(0~100)가 이 값 이상이면 현직 편, 아래면 바꾸는 쪽 */
  readonly npcKeepSatisfaction: number;
  /** NPC 투표 규칙식: 공격 성향(‰)이 이 값 이상이면 선전포고 찬성 */
  readonly npcWarTraitPm: number;
}

export const START_GOVERNANCE: GovernanceCoefficients = {
  periodLeaderMs: 72 * 3_600_000,
  periodWarMs: 6 * 3_600_000,
  quorumLeaderPm: 500,
  quorumWarPm: 300,
  thresholdPm: 500,
  thresholdRegimePm: 666,
  thresholdRemovalPm: 666,
  termMs: 14 * 86_400_000,
  registerMs: 24 * 3_600_000,
  graceRegimeMs: 7 * 86_400_000,
  proposeSharePm: 50,
  openPerProposer: 1,
  autoElections: 1,
  warAgenda: 1,
  npcKeepSatisfaction: 50,
  npcWarTraitPm: 600,
};
