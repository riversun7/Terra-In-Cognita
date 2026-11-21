// 나라 의결(governance) 설정 칸 값 ↔ 계수표 — 기획 D-5057(정족수·투표 기간 = 49 S34)·D-131(체제 전환 7일 유예)·질문 2351~2365 답(D-580·기획 대조),
// docs/adr/2026-11-21-governance.md. 판정 코드(시뮬)는 읽지 않고 서버 의결이 틱·명령마다 읽는다. 모두 [임시] 출발값이다(D-515).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path,
  structural: false,
  ko,
  en,
});

export const GOVERNANCE_TUNING_KEYS: readonly TuningKey[] = [
  // 안건별 정족수·투표 기간(49 S34, D-5057 — 급한 전쟁 안건은 짧게)
  k(
    "gov_period_leader_ms",
    "S34",
    "governance.periodLeaderMs",
    "투표 기간: 지도자·체제 안건(ms)",
    "Vote period: leader and regime agendas (ms)",
  ),
  k(
    "gov_period_war_ms",
    "S34",
    "governance.periodWarMs",
    "투표 기간: 전쟁 안건(ms)",
    "Vote period: war agendas (ms)",
  ),
  k(
    "gov_quorum_leader_pm",
    "S34",
    "governance.quorumLeaderPm",
    "정족수: 지도자·체제 안건(‰)",
    "Quorum: leader and regime agendas (‰)",
  ),
  k("gov_quorum_war_pm", "S34", "governance.quorumWarPm", "정족수: 전쟁 안건(‰)", "Quorum: war agendas (‰)"),
  // 가결 문턱(질문 2354 — 출발값 나, D-131 통화 단계 전환 2/3 선례)
  k("gov_threshold_pm", "", "governance.thresholdPm", "가결 문턱: 기본(‰)", "Pass threshold: default (‰)"),
  k(
    "gov_threshold_regime_pm",
    "",
    "governance.thresholdRegimePm",
    "가결 문턱: 체제 전환(‰)",
    "Pass threshold: regime change (‰)",
  ),
  k(
    "gov_threshold_removal_pm",
    "",
    "governance.thresholdRemovalPm",
    "가결 문턱: 지도자 해임(‰)",
    "Pass threshold: leader removal (‰)",
  ),
  // 임기·후보 등록·유예(질문 2357·2358·2364, D-131)
  k("gov_term_ms", "", "governance.termMs", "지도자 임기(ms)", "Leader term (ms)"),
  k(
    "gov_register_ms",
    "",
    "governance.registerMs",
    "선출 후보 등록 기간(ms)",
    "Election registration period (ms)",
  ),
  k("gov_grace_regime_ms", "", "governance.graceRegimeMs", "체제 전환 유예(ms)", "Regime change grace (ms)"),
  // 발의권(질문 2351)
  k(
    "gov_propose_share_pm",
    "",
    "governance.proposeSharePm",
    "자본주의 발의·후보 의결권 하한(‰)",
    "Capitalism agenda and candidacy voting share floor (‰)",
  ),
  k(
    "gov_open_per_proposer",
    "",
    "governance.openPerProposer",
    "한 발의자가 열어 둘 수 있는 안건 수",
    "Open agendas per proposer",
  ),
  k(
    "gov_auto_elections",
    "",
    "governance.autoElections",
    "임기 끝 자동 선출(1 = 켬)",
    "Automatic election at term end (1 = on)",
  ),
  k(
    "gov_war_agenda",
    "",
    "governance.warAgenda",
    "선전포고 안건(1 = 켬)",
    "War declaration agendas (1 = on)",
  ),
  // NPC 투표 규칙식(질문 2361 나안 — D-323·D-554)
  k(
    "gov_npc_keep_satisfaction",
    "",
    "governance.npcKeepSatisfaction",
    "NPC 투표: 현직 편 만족도 문턱(0~100)",
    "NPC vote: satisfaction to back the incumbent (0-100)",
  ),
  k(
    "gov_npc_war_trait_pm",
    "",
    "governance.npcWarTraitPm",
    "NPC 투표: 선전포고 찬성 공격 성향(‰)",
    "NPC vote: aggression to back war (‰)",
  ),
  // NPC 후보(질문 2404 나)·빈자리(2403 답 D-582)·군사 쿠데타(2401 답 D-582) — 줄기 governance-2
  k(
    "gov_npc_run_score",
    "",
    "governance.npcRunScore",
    "NPC 후보: 출마 점수 문턱",
    "NPC candidacy: run score threshold",
  ),
  k(
    "gov_npc_run_max",
    "",
    "governance.npcRunMax",
    "NPC 후보: 선출마다 도전자 수 상한",
    "NPC candidacy: challengers per election",
  ),
  k(
    "gov_vacancy_split_ms",
    "",
    "governance.vacancySplitMs",
    "지도자 빈자리 기간: 독립 투표까지(ms)",
    "Leader vacancy: time until independence votes (ms)",
  ),
  k(
    "gov_coup_satisfaction_drop",
    "",
    "governance.coupSatisfactionDrop",
    "군사 쿠데타 만족도 감소(점)",
    "Military coup satisfaction drop (points)",
  ),
];
