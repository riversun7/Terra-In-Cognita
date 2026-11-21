// 나라 의결 설정값 — 콘텐츠 팩 tuning을 얹은 세력·사회 계수표의 governance 칸(@terra/sim GovernanceCoefficients)에서 고른다. 부를 때마다 읽어
// 개발자 패널에서 바꾸면 다음 틱·명령부터 쓴다. 팩 없이 띄운 서버·시험은 sim 시험 계수표(팩 출발값과 같다). docs/adr/2026-11-21-governance.md
import { type AgendaKind, agendaGroupOf } from "@terra/shared/governance";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";

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
}

const whole = (value: number): number => (Number.isSafeInteger(value) && value > 0 ? value : 0);
const permille = (value: number): number => Math.min(1000, whole(value));
/** 기간(ms): 1분 이상 */
const period = (value: number): number => Math.max(60_000, whole(value));

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
  };
}

/** 팩 없이 띄운 서버·시험 */
export const TEST_GOVERNANCE_RULES: GovernanceRules = governanceRulesFrom(TEST_SOCIETY_COEFFICIENTS);
