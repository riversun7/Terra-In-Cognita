// NPC 투표 — 질문 2361 나안(기획 대조: D-323 점수 고르기 + 성향 프리셋 + 규칙식 D-554, NPC 가문·NPC 주주도 똑같이 — D-555 1509).
// NPC 가문·NPC 주주(다른 NPC 나라 국고)마다 보기(찬성·반대·기권, 선출이면 후보)에 점수를 매겨 가장 높은 것을 고른다(같으면 현상 유지 쪽).
// 점수 [임시 — 가중치는 코드 상수, 문턱 둘은 설정 칸]:
// - 만족도 차 = 그 가문 도시 휴먼 평균 만족도 − 설정 칸 gov_npc_keep_satisfaction(0~100). 높으면 현직 편(D-219·D-253 만족도 = 충성도).
// - 성향(나라 성향 4축 ‰, 팩 국가 프리셋 성향이 얹힌 값 — presetTemper.ts): 신앙은 현상 유지 쪽, 상업은 자본주의 쪽, 공격은 독재 쪽.
// - 선전포고: 공격 성향 ≥ 설정 칸 gov_npc_war_trait_pm이면 찬성, 아래면 반대.
// - 선출: 자기 가문이 후보면 자기 가문. 아니면 현직이 후보이고 만족도 차 ≥ 0이면 현직, 아니면 먼저 등록한 도전자.
// - loyal(지배 가문 편 — 지금 쓰는 곳 없음, 국고 지분은 표를 던지지 않고 다른 주주에게 나눈다 D-581): 현직·반대(선전포고는 성향 규칙 그대로).
// 판정에 난수를 쓰지 않는다(같은 입력 = 같은 표).
import type { GovernanceRegime, HouseKey } from "@terra/shared/governance";
import type { AgendaKind } from "@terra/shared/governance";

export interface NpcTraits {
  readonly aggression: number;
  readonly commerce: number;
  readonly faith: number;
}

export interface NpcVoteInput {
  readonly kind: AgendaKind;
  /** 지금 지배 가문 */
  readonly incumbent: HouseKey | null;
  /** 투표하는 NPC 가문(주주면 null) */
  readonly self: HouseKey | null;
  /** 선출 후보(등록 차례) */
  readonly candidates: readonly HouseKey[];
  /** 해임 뒤 다시 뽑기에서 막힌 가문(그 가문은 고르지 않는다) */
  readonly barred?: HouseKey | null | undefined;
  /** 그 가문 도시 휴먼 평균 만족도(0~100). 모르면 설정 문턱(중립) */
  readonly satisfaction: number | undefined;
  readonly traits: NpcTraits;
  /** 체제 전환 목표 */
  readonly targetRegime?: GovernanceRegime | undefined;
  /** 지배 가문 편(국고 지분) */
  readonly loyal?: boolean | undefined;
}

export interface NpcVoteRules {
  readonly npcKeepSatisfaction: number;
  readonly npcWarTraitPm: number;
}

/** 성향 ‰ → −50~50 */
const lean = (pm: number): number => Math.trunc((Math.min(1000, Math.max(0, pm)) - 500) / 10);

/** 찬반 점수(+ 찬성, − 반대, 0 기권) */
function motionScore(input: NpcVoteInput, rules: NpcVoteRules, keep: number): number {
  const { traits } = input;
  switch (input.kind) {
    case "leader_removal":
      // 만족도가 낮을수록 해임 찬성, 신앙이 높을수록 유지
      return -keep * 2 - lean(traits.faith);
    case "regime_change": {
      const target = input.targetRegime;
      const toward =
        target === "capitalism"
          ? lean(traits.commerce)
          : target === "dictatorship"
            ? lean(traits.aggression)
            : -lean(traits.aggression);
      return -keep * 2 - lean(traits.faith) + toward;
    }
    case "war_declaration":
      // 공격 성향이 문턱 이상이면 찬성, 아래면 반대(만족도는 보지 않는다)
      return traits.aggression >= rules.npcWarTraitPm ? 1 : -1;
    default:
      return 0;
  }
}

/** NPC 한 표를 고른다: yes | no | abstain | 후보 가문 열쇠 */
export function npcVoteChoice(input: NpcVoteInput, rules: NpcVoteRules): string {
  const keep =
    input.satisfaction === undefined || !Number.isFinite(input.satisfaction)
      ? 0
      : Math.trunc(input.satisfaction) - rules.npcKeepSatisfaction;
  if (input.kind === "leader_election") {
    const open = input.candidates.filter((key) => key !== input.barred);
    if (open.length === 0) return "abstain";
    if (input.self && open.includes(input.self)) return input.self;
    const sitting = input.incumbent !== null && open.includes(input.incumbent) ? input.incumbent : null;
    if (sitting && (input.loyal || keep >= 0)) return sitting;
    return open.find((key) => key !== sitting) ?? sitting ?? "abstain";
  }
  if (input.loyal && input.kind !== "war_declaration") return "no";
  const score = motionScore(input, rules, keep);
  if (score > 0) return "yes";
  return score < 0 ? "no" : "abstain";
}
