// NPC 가문의 연맹 판단 — 기획 답(질문 2502 — NPC 가문도 플레이어처럼 연맹을 만들고 든다), D-323(점수로 고르기 + 성향 프리셋 + 규칙식), D-555 1509
// ("NPC만으로도 똑같이"), D-587 4·5(연맹 = 가문끼리 맺는 조약, 들지는 그 가문이 고른다). docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (npc-invest-2)".
// 순수 함수: 가문장 7축 성향 → 후보(쉬기·만들기·들기)마다 점수 → 문턱을 넘는 것 가운데 가장 높은 하나. 같은 점수면 들기가 먼저(연맹 수가 덜 는다).
// [임시] 점수 꼴(기획이 정하지 않은 가중 — 질문 2563): 들기 = (개방 + 공동체) ÷ 2, 만들기 = (개방 + 자치 + 과감) ÷ 3, 문턱은 설정 칸
// house_npc_league_found_score·house_npc_league_join_score. 들 연맹 = 든 가문이 가장 많은 연맹(같으면 작은 ID). NPC 가문은 연맹 하나만 든다(나가지 않는다).
// 정수만 쓴다.
import type { UnitTraits } from "@terra/shared/unitTraits";

export interface NpcLeagueRules {
  /** 만들기 문턱(0~1000). 넘지 않으면 만들지 않는다 */
  readonly foundScore: number;
  /** 들기 문턱(0~1000). 넘지 않으면 들지 않는다 */
  readonly joinScore: number;
}

export type NpcLeagueChoice =
  | { readonly kind: "found" }
  | { readonly kind: "join"; readonly leagueId: number };

/** 들기 점수(0~1000) */
export const npcLeagueJoinScore = (t: Pick<UnitTraits, "openness" | "communalism">): number =>
  Math.floor((t.openness + t.communalism) / 2);

/** 만들기 점수(0~1000) */
export const npcLeagueFoundScore = (t: Pick<UnitTraits, "openness" | "autonomy" | "boldness">): number =>
  Math.floor((t.openness + t.autonomy + t.boldness) / 3);

/** 아직 연맹에 들지 않은 NPC 가문의 판단. 아무것도 안 하면 undefined */
export function npcLeagueChoice(
  traits: Pick<UnitTraits, "openness" | "communalism" | "autonomy" | "boldness">,
  leagues: readonly { readonly id: number; readonly members: number }[],
  rules: NpcLeagueRules,
): NpcLeagueChoice | undefined {
  let target: { id: number; members: number } | undefined;
  for (const league of leagues)
    if (
      !target ||
      league.members > target.members ||
      (league.members === target.members && league.id < target.id)
    )
      target = league;
  const join = npcLeagueJoinScore(traits);
  const found = npcLeagueFoundScore(traits);
  const canJoin = target !== undefined && join >= Math.max(0, Math.trunc(rules.joinScore));
  const canFound = found >= Math.max(0, Math.trunc(rules.foundScore));
  if (canJoin && target && (!canFound || join >= found)) return { kind: "join", leagueId: target.id };
  return canFound ? { kind: "found" } : undefined;
}
