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
  /** NPC 후보 출마 점수 문턱·도전자 수 상한(질문 2404 나) */
  readonly npcRunScore: number;
  readonly npcRunMax: number;
  /** 지도자 빈자리 기간(ms, 2403 답 D-582 — 가르는 절차는 빈틈, 읽기만) */
  readonly vacancySplitMs: number;
  /** 군사 쿠데타 만족도 감소(점, 2401 답 D-582 — 쿠데타 길은 아직 없음) */
  readonly coupSatisfactionDrop: number;
  /** 세율 안건이 되는 한 번 바꾸기 폭(‰ — 질문 2407 가) */
  readonly taxAgendaWidthPm: number;
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
    npcRunScore: Number.isSafeInteger(g.npcRunScore) ? g.npcRunScore : 20,
    npcRunMax: Math.min(10, whole(g.npcRunMax)),
    vacancySplitMs: period(g.vacancySplitMs),
    coupSatisfactionDrop: Math.min(100, whole(g.coupSatisfactionDrop)),
    taxAgendaWidthPm: Math.max(1, permille(g.taxAgendaWidthPm)),
  };
}

/** 팩 없이 띄운 서버·시험 */
export const TEST_GOVERNANCE_RULES: GovernanceRules = governanceRulesFrom(TEST_SOCIETY_COEFFICIENTS);

/** 세율 크게 바꾸기 안건의 문턱(질문 2407 가 — 한 번에 바꾸는 폭이 설정 칸 gov_tax_agenda_width_pm 이상이면 안건, 아래는 지도자가 바로) */
export function taxChangeNeedsAgenda(fromPm: number, toPm: number, widthPm: number): boolean {
  return Math.abs(Math.trunc(toPm) - Math.trunc(fromPm)) >= Math.max(1, Math.trunc(widthPm));
}
