// 나라 의결 설정값 — 콘텐츠 팩 tuning을 얹은 세력·사회 계수표의 governance 칸(@terra/sim GovernanceCoefficients)에서 고른다. 부를 때마다 읽어
// 개발자 패널에서 바꾸면 다음 틱·명령부터 쓴다. 팩 없이 띄운 서버·시험은 sim 시험 계수표(팩 출발값과 같다). docs/adr/2026-11-21-governance.md
import { type AgendaKind, agendaGroupOf } from "@terra/shared/governance";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import type { ApprovalFactorRules } from "./approvalFactors.ts";

export interface GovernanceRules {
  /** 안건 종류의 투표 기간(ms) */
  periodOf(kind: AgendaKind): number;
  /** 안건 종류의 정족수(‰) */
  quorumOf(kind: AgendaKind): number;
  /** 안건 종류의 가결 문턱(‰) */
  thresholdOf(kind: AgendaKind): number;
  readonly termMs: number;
  readonly registerMs: number;
  readonly graceRegimeMs: number;
  readonly proposeSharePm: number;
  readonly openPerProposer: number;
  readonly autoElections: boolean;
  readonly warAgenda: boolean;
  readonly npcKeepSatisfaction: number;
  readonly npcWarTraitPm: number;
  /** NPC 후보 출마 점수 문턱·도전자 수 상한(질문 2404 나) */
  readonly npcRunScore: number;
  readonly npcRunMax: number;
  /** 지도자 빈자리 자동 선출 기간(ms — D-584: 빈자리는 도시 독립으로 이어지지 않고 누구나 나서는 선출을 바로 연다) */
  readonly vacancyElectionMs: number;
  /** 군사 쿠데타 만족도 감소(점, 2401 답 D-582 — 쿠데타 길은 아직 없음) */
  readonly coupSatisfactionDrop: number;
  /** 세율 안건이 되는 한 번 바꾸기 폭(‰ — 질문 2407 가) */
  readonly taxAgendaWidthPm: number;
  /** 군사 쿠데타(질문 2433 답·D-583, 줄기 governance-3): 켬·쿨타임·참가 받기·실패 비용·실패 만족도·NPC 점수·NPC 힘 비·편마다 전투 유닛·보상 */
  readonly coupEnabled: boolean;
  readonly coupCooldownMs: number;
  readonly coupGatherMs: number;
  readonly coupFailCost: bigint;
  readonly coupFailSatisfactionDrop: number;
  readonly coupNpcScore: number;
  readonly coupNpcPowerPm: number;
  readonly coupBattleUnits: number;
  readonly coupMeritRenown: number;
  readonly coupCreditReward: number;
  /** 줄기 governance-5: 쿠데타 보호 기간(ms)·강화 수락 기다림(ms)·NPC 가문 독립 점수 문턱·힘 비(‰)·지도자 신임도 시작값·해임/반란 보정 폭 */
  readonly coupProtectMs: number;
  readonly peaceOfferMs: number;
  readonly houseIndependenceNpcScore: number;
  readonly houseIndependencePowerPm: number;
  readonly approvalPlayerStart: number;
  readonly approvalNpcStart: number;
  readonly approvalRemovalEasePm: number;
  readonly approvalRebellionEase: number;
  /** 줄기 gov-coup(D-588 2493): 신임도 보정 기준점·오르내림 크기(approvalFactors.ts) */
  readonly approval: ApprovalFactorRules;
  /** 줄기 gov-coup(D-588 2499): 손 조절 목표 물가 상한 출발값·아래 끝·위 끝(천분율) */
  readonly monetaryCapMilli: number;
  readonly monetaryCapMinMilli: number;
  readonly monetaryCapMaxMilli: number;
  /** 지도자끼리 조약(diplomacy/ — 사용자 결정 D-588): 기간 상한(날)·공물 상한(‰)·공물 주기(ms — 봉신 공물 주기 칸과 같다)·참전 요청 답 기한(ms)·NPC 차분함 문턱(‰) */
  readonly treatyMaxDays: number;
  readonly tributeMaxPm: number;
  readonly tributeEveryMs: number;
  readonly warRequestMs: number;
  readonly npcTreatyCalmPm: number;
  /** 조약 위반 한 번의 세력 신뢰 하락·제재 명분 기간(ms)·제재 명분 몫(줄기 fixes-1117c, 설정 칸 dip_breach_* · dip_sanction_*) */
  readonly breachTrustPenalty: number;
  readonly sanctionWindowMs: number;
  readonly sanctionCauseBonus: number;
  /** 세력 쌍 호감 하락 몫(줄기 gov-fix-4 — D-591 2531·D-290·D-291, 설정 칸 dip_*_affinity — diplomacy/affinity.ts) */
  readonly independenceAffinity: number;
  readonly noCauseAffinity: number;
  readonly joinRefuseAffinity: number;
  /** 국고 지분 안건 집행 기간(ms — D-591 2526, 설정 칸 gov_share_exec_ms — 7~30일로 자른다, cityShares/treasuryRuns.ts) */
  readonly shareExecMs: number;
  /** 위반 기록을 잊는 기간(ms, 0 = 잊지 않음 — 줄기 fixes-d592 D-592 2583 다, 설정 칸 dip_breach_expire_ms) */
  readonly breachExpireMs: number;
  /** 호감이 오르는 길(줄기 npc-diplo — 질문 2662, 설정 칸 dip_affinity_drift_per_day·dip_treaty_kept_affinity·dip_peace_affinity·dip_join_accept_affinity — diplomacy/affinityRise.ts) */
  readonly affinityDriftPerDay: number;
  readonly treatyKeptAffinity: number;
  readonly peaceAffinity: number;
  readonly joinAcceptAffinity: number;
  /** NPC 참전 답의 관계 몫(‰ — 세력·사회 npc 칸 npc_relation_join_*, @terra/sim/npcAi npcJoinsWarScored, 줄기 npc-diplo) */
  readonly relationJoinAffinityPm: number;
  readonly relationJoinTrustPm: number;
  /** 강화 조약 불가침 기간(ms — 세력·사회 d292_truce, 휴전·강화 조약의 기본 기간) */
  readonly truceMs: number;
}

const whole = (value: number): number => (Number.isSafeInteger(value) && value > 0 ? value : 0);
const permille = (value: number): number => Math.min(1000, whole(value));
/** 기간(ms): 1분 이상 */
const period = (value: number): number => Math.max(60_000, whole(value));

/** 목표 물가 상한 칸(아래 끝 ≤ 출발값 ≤ 위 끝으로 맞춘다, 1 이상) */
function monetaryCaps(
  start: number,
  low: number,
  high: number,
): Pick<GovernanceRules, "monetaryCapMilli" | "monetaryCapMinMilli" | "monetaryCapMaxMilli"> {
  const min = Math.max(1, whole(low));
  const max = Math.max(min, whole(high));
  return {
    monetaryCapMilli: Math.min(max, Math.max(min, whole(start))),
    monetaryCapMinMilli: min,
    monetaryCapMaxMilli: max,
  };
}

export function governanceRulesFrom(c: SocietyCoefficients): GovernanceRules {
  const g = c.governance;
  return {
    periodOf: (kind) => period(agendaGroupOf(kind) === "war" ? g.periodWarMs : g.periodLeaderMs),
    quorumOf: (kind) => permille(agendaGroupOf(kind) === "war" ? g.quorumWarPm : g.quorumLeaderPm),
    thresholdOf: (kind) =>
      Math.min(
        999,
        whole(
          kind === "regime_change"
            ? g.thresholdRegimePm
            : kind === "leader_removal"
              ? g.thresholdRemovalPm
              : kind === "currency_stage"
                ? g.thresholdCurrencyPm
                : g.thresholdPm,
        ),
      ),
    termMs: period(g.termMs),
    registerMs: whole(g.registerMs),
    graceRegimeMs: whole(g.graceRegimeMs),
    proposeSharePm: permille(g.proposeSharePm),
    openPerProposer: Math.max(1, whole(g.openPerProposer)),
    autoElections: g.autoElections !== 0,
    warAgenda: g.warAgenda !== 0,
    npcKeepSatisfaction: Math.min(100, whole(g.npcKeepSatisfaction)),
    npcWarTraitPm: permille(g.npcWarTraitPm),
    npcRunScore: Number.isSafeInteger(g.npcRunScore) ? g.npcRunScore : 20,
    npcRunMax: Math.min(10, whole(g.npcRunMax)),
    vacancyElectionMs: period(g.vacancyElectionMs),
    coupSatisfactionDrop: Math.min(100, whole(g.coupSatisfactionDrop)),
    taxAgendaWidthPm: Math.max(1, permille(g.taxAgendaWidthPm)),
    coupEnabled: g.coupEnabled !== 0,
    coupCooldownMs: whole(g.coupCooldownMs),
    coupGatherMs: period(g.coupGatherMs),
    coupFailCost: BigInt(whole(g.coupFailCost)),
    coupFailSatisfactionDrop: Math.min(100, whole(g.coupFailSatisfactionDrop)),
    coupNpcScore: Number.isSafeInteger(g.coupNpcScore) ? g.coupNpcScore : 40,
    coupNpcPowerPm: whole(g.coupNpcPowerPm),
    coupBattleUnits: Math.max(1, Math.min(200, whole(g.coupBattleUnits))),
    coupMeritRenown: whole(g.coupMeritRenown),
    coupCreditReward: whole(g.coupCreditReward),
    coupProtectMs: whole(g.coupProtectMs),
    peaceOfferMs: period(g.peaceOfferMs),
    houseIndependenceNpcScore: Number.isSafeInteger(g.houseIndependenceNpcScore)
      ? g.houseIndependenceNpcScore
      : 40,
    houseIndependencePowerPm: whole(g.houseIndependencePowerPm),
    approvalPlayerStart: permille(g.approvalPlayerStart),
    approvalNpcStart: permille(g.approvalNpcStart),
    approvalRemovalEasePm: permille(g.approvalRemovalEasePm),
    approvalRebellionEase: Math.min(100, whole(g.approvalRebellionEase)),
    approval: {
      neutralPm: permille(g.approvalNeutralPm),
      taxPerPm: Math.min(1000, whole(g.approvalTaxPerPm)),
      warStart: permille(g.approvalWarStart),
      warDaily: permille(g.approvalWarDaily),
      peace: permille(g.approvalPeace),
      cityWon: permille(g.approvalCityWon),
      cityLost: permille(g.approvalCityLost),
      satisfactionPullPm: permille(g.approvalSatisfactionPullPm),
    },
    ...monetaryCaps(g.monetaryCapMilli, g.monetaryCapMinMilli, g.monetaryCapMaxMilli),
    treatyMaxDays: Math.max(1, Math.min(3650, whole(g.treatyMaxDays))),
    tributeMaxPm: permille(g.tributeMaxPm),
    tributeEveryMs: period(c.tributeEveryMs),
    warRequestMs: period(g.warRequestMs),
    npcTreatyCalmPm: permille(g.npcTreatyCalmPm),
    breachTrustPenalty: Math.min(200, whole(g.breachTrustPenalty)),
    sanctionWindowMs: whole(g.sanctionWindowMs),
    sanctionCauseBonus: whole(g.sanctionCauseBonus),
    independenceAffinity: Math.min(200, whole(g.independenceAffinity)),
    noCauseAffinity: Math.min(200, whole(g.noCauseAffinity)),
    joinRefuseAffinity: Math.min(200, whole(g.joinRefuseAffinity)),
    shareExecMs: Math.min(30 * 86_400_000, Math.max(7 * 86_400_000, whole(g.shareExecMs))),
    breachExpireMs: whole(g.breachExpireMs),
    affinityDriftPerDay: Math.min(200, whole(g.affinityDriftPerDay)),
    treatyKeptAffinity: Math.min(200, whole(g.treatyKeptAffinity)),
    peaceAffinity: Math.min(200, whole(g.peaceAffinity)),
    joinAcceptAffinity: Math.min(200, whole(g.joinAcceptAffinity)),
    relationJoinAffinityPm: whole(c.npc.relationJoinAffinityPm ?? 0),
    relationJoinTrustPm: whole(c.npc.relationJoinTrustPm ?? 0),
    truceMs: period(c.npc.truceMs),
  };
}

/** 팩 없이 띄운 서버·시험 */
export const TEST_GOVERNANCE_RULES: GovernanceRules = governanceRulesFrom(TEST_SOCIETY_COEFFICIENTS);

/** 세율 크게 바꾸기 안건의 문턱(질문 2407 가 — 한 번에 바꾸는 폭이 설정 칸 gov_tax_agenda_width_pm 이상이면 안건, 아래는 지도자가 바로) */
export function taxChangeNeedsAgenda(fromPm: number, toPm: number, widthPm: number): boolean {
  return Math.abs(Math.trunc(toPm) - Math.trunc(fromPm)) >= Math.max(1, Math.trunc(widthPm));
}
