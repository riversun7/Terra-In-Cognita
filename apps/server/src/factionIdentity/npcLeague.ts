// NPC 가문의 연맹 판단 — 기획 답(질문 2502 — NPC 가문도 플레이어처럼 연맹을 만들고 든다), D-323(점수로 고르기 + 성향 프리셋 + 규칙식), D-555 1509
// ("NPC만으로도 똑같이"), D-587 4·5(연맹 = 가문끼리 맺는 조약, 들지는 그 가문이 고른다). docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (npc-invest-2)".
// 순수 함수: 가문장 7축 성향 → 후보(쉬기·만들기·들기)마다 점수 → 문턱을 넘는 것 가운데 가장 높은 하나. 같은 점수면 들기가 먼저(연맹 수가 덜 는다).
// [임시] 점수 꼴(기획이 정하지 않은 가중 — 질문 2563): 들기 = (개방 + 공동체) ÷ 2, 만들기 = (개방 + 자치 + 과감) ÷ 3, 문턱은 설정 칸
// house_npc_league_found_score·house_npc_league_join_score. 들 연맹 = 든 가문이 가장 많은 연맹(같으면 작은 ID). NPC 가문은 연맹 하나만 든다.
// 바뀜 (npc-fix-3, 기획 검토 2562 라·2563 다·라 — D-555 1509 "NPC만으로도 똑같이", D-323 성향 규칙식): NPC 가문도 대표 투표에 표를 던지고, 플레이어와 같은
// 규칙으로 연맹을 나간다. 꼴은 기술이 정한 [임시](문턱은 설정 칸):
// - 성향 거리: 두 가문장 7축 성향의 친밀도 = 1000 − (축마다 차이의 합 ÷ 7). 성향을 모르는 가문(플레이어 가문)은 500(가운데)으로 친다.
// - 표(npcLeagueVoteFor): 지금 대표는 자기를 찍는다. 그 밖은 자기 말고 든 가문 가운데 친밀도가 가장 높은 가문(같으면 지금 대표, 그다음 든 차례).
// - 표를 여는 때(npcLeagueStartsVote): 열린 투표가 없고, 대표가 아니며, 대표와의 친밀도가 문턱(house_npc_league_vote_start_score) 아래일 때. 열린 투표가 있으면
//   아직 표를 던지지 않은 NPC 가문은 모두 던진다(leagueService.ts npcSweep).
// - 나가기(npcLeagueLeaves): 대표가 아니고 대표와의 친밀도가 문턱(house_npc_league_leave_score) 아래일 때. 대표는 플레이어처럼 위임 전에는 못 나간다([임시] 2504).
// - 들기: 나가기 문턱 아래인 대표의 연맹에는 들지 않는다(들자마자 나가지 않게). 그 밖은 옛 판 그대로 — 가장 큰 연맹(2563 나는 기술 기본값 — 지금대로).
//   같은 나라·도시 연맹을 먼저 고르는 몫은 없다(2563 라 확인 — 들기 후보는 연맹의 수·대표 성향만 보고 나라·도시를 받지 않는다, D-587 "국가와 무관").
// 바뀜 (league-2, 사용자 결정 D-590 2502 다 — NPC 가문도 같은 절차, D-323 성향 규칙식): 바로 들지 않고 플레이어와 같은 초대·신청을 거친다. 꼴은 [임시](질문 2644):
// - 신청(npcLeagueChoice "apply"): 옛 "들기" 자리 그대로 — 아직 어느 연맹에도 들지 않았고 보낸 신청이 없는 NPC 가문이 들기 점수로 가장 큰 연맹에 신청한다.
// - 승인(npcLeagueApproves): NPC 대표는 신청한 가문과의 친밀도가 나가기 문턱 이상이면 받고, 아래면 거절한다(들자마자 나갈 가문은 받지 않는다).
// - 초대(npcLeagueInviteTarget): NPC 대표는 아직 어느 연맹에도 들지 않았고 이 연맹에 초대·신청이 없는 NPC 가문 가운데 친밀도가 가장 높은 하나를 초대 문턱
//   (house_npc_league_invite_score)·나가기 문턱 이상이면 부른다. 플레이어 가문은 부르지 않는다(성향을 모른다 — 플레이어가 신청한다).
// - 수락(npcLeagueAccepts): 초대받은 NPC 가문은 들기 점수가 들기 문턱 이상이고 대표와의 친밀도가 나가기 문턱 이상이면 받고, 아니면 거절한다. 이미 다른
//   연맹에 들었어도 받는다(연맹 수 상한 없음 — D-590 2504). 스스로 신청하는 것은 아무 연맹에도 들지 않았을 때만이다(판단 — 한 시간마다 모든 연맹에 몰리지 않게).
// - 대표 가문도 나가기 규칙(npcLeagueLeaves)은 그대로 대표가 아닌 가문만 본다(대표가 나갈 까닭이 성향 거리로는 없다 — 나가면 승계는 houseLeague.ts).
// 정수만 쓴다.
import { UNIT_TRAIT_MID, type UnitTraits } from "@terra/shared/unitTraits";

export interface NpcLeagueRules {
  /** 만들기 문턱(0~1000). 넘지 않으면 만들지 않는다 */
  readonly foundScore: number;
  /** 들기 문턱(0~1000). 넘지 않으면 들지 않는다 */
  readonly joinScore: number;
  /** 나가기 문턱(대표와의 친밀도 0~1000, npc-fix-3). 이 아래면 나간다. 0이면 나가지 않는다. 없으면 300 */
  readonly leaveScore?: number | undefined;
  /** 표를 여는 문턱(대표와의 친밀도 0~1000, npc-fix-3). 이 아래면 투표를 연다. 0이면 열지 않는다. 없으면 400 */
  readonly voteStartScore?: number | undefined;
  /** NPC 대표의 초대 문턱(league-2 — 대표와의 친밀도 0~1000). 1001이면 부르지 않는다. 없으면 600 */
  readonly inviteScore?: number | undefined;
}

/** 성향(7축). 모르면 undefined(플레이어 가문 — 가운데로 친다) */
export type LeagueTraits = UnitTraits | undefined;

const AXES = [
  "belligerence",
  "greed",
  "boldness",
  "communalism",
  "autonomy",
  "openness",
  "discipline",
] as const satisfies readonly (keyof UnitTraits)[];

/** 두 가문장 성향의 친밀도(0~1000): 1000 − 축마다 차이의 합 ÷ 7(내림). 한쪽이라도 모르면 가운데(500) */
export function npcLeagueAffinity(a: LeagueTraits, b: LeagueTraits): number {
  if (!a || !b) return UNIT_TRAIT_MID;
  let sum = 0;
  for (const axis of AXES) sum += Math.abs(Math.trunc(a[axis]) - Math.trunc(b[axis]));
  return Math.max(0, 1000 - Math.floor(sum / AXES.length));
}

const leaveFloor = (rules: NpcLeagueRules): number => Math.max(0, Math.trunc(rules.leaveScore ?? 300));

/** 나가나: 대표가 아니고 대표와의 친밀도가 나가기 문턱 아래 */
export function npcLeagueLeaves(
  me: LeagueTraits,
  representative: LeagueTraits,
  isRepresentative: boolean,
  rules: NpcLeagueRules,
): boolean {
  return !isRepresentative && npcLeagueAffinity(me, representative) < leaveFloor(rules);
}

/** 투표를 여나: 대표가 아니고 대표와의 친밀도가 문턱 아래(열린 투표가 없을 때 부른다) */
export function npcLeagueStartsVote(
  me: LeagueTraits,
  representative: LeagueTraits,
  isRepresentative: boolean,
  rules: NpcLeagueRules,
): boolean {
  return (
    !isRepresentative &&
    npcLeagueAffinity(me, representative) < Math.max(0, Math.trunc(rules.voteStartScore ?? 400))
  );
}

/**
 * 누구를 찍나: 지금 대표는 자기를 찍는다(자리를 지킨다). 그 밖은 자기 말고 든 가문(든 차례) 가운데 친밀도가 가장 높은 가문. 같으면 지금 대표, 그다음 든 차례
 * 앞. 후보가 없으면 undefined
 */
export function npcLeagueVoteFor(
  me: { readonly house: number; readonly traits: LeagueTraits },
  members: readonly { readonly house: number; readonly traits: LeagueTraits }[],
  representative: number,
): number | undefined {
  if (me.house === representative) return representative;
  let best: { house: number; score: number } | undefined;
  for (const member of members) {
    if (member.house === me.house) continue;
    const score = npcLeagueAffinity(me.traits, member.traits);
    if (!best || score > best.score || (score === best.score && member.house === representative))
      best = { house: member.house, score };
  }
  return best?.house;
}

export type NpcLeagueChoice =
  | { readonly kind: "found" }
  /** 신청(league-2 — 옛 "바로 듦") */
  | { readonly kind: "apply"; readonly leagueId: number };

/** 들기 점수(0~1000) */
export const npcLeagueJoinScore = (t: Pick<UnitTraits, "openness" | "communalism">): number =>
  Math.floor((t.openness + t.communalism) / 2);

/** 만들기 점수(0~1000) */
export const npcLeagueFoundScore = (t: Pick<UnitTraits, "openness" | "autonomy" | "boldness">): number =>
  Math.floor((t.openness + t.autonomy + t.boldness) / 3);

/**
 * 아직 연맹에 들지 않은 NPC 가문의 판단. 아무것도 안 하면 undefined. 나가기 문턱 아래인 대표(representative — 성향을 모르면 가운데)의 연맹은 들 후보에서
 * 뺀다(npc-fix-3 — 들자마자 나가지 않게)
 */
export function npcLeagueChoice(
  traits: UnitTraits,
  leagues: readonly {
    readonly id: number;
    readonly members: number;
    readonly representative: LeagueTraits;
  }[],
  rules: NpcLeagueRules,
): NpcLeagueChoice | undefined {
  let target: { id: number; members: number } | undefined;
  for (const league of leagues) {
    if (npcLeagueAffinity(traits, league.representative) < leaveFloor(rules)) continue;
    if (
      !target ||
      league.members > target.members ||
      (league.members === target.members && league.id < target.id)
    )
      target = league;
  }
  const join = npcLeagueJoinScore(traits);
  const found = npcLeagueFoundScore(traits);
  const canJoin = target !== undefined && join >= Math.max(0, Math.trunc(rules.joinScore));
  const canFound = found >= Math.max(0, Math.trunc(rules.foundScore));
  if (canJoin && target && (!canFound || join >= found)) return { kind: "apply", leagueId: target.id };
  return canFound ? { kind: "found" } : undefined;
}

/** NPC 대표가 신청을 받나(league-2): 신청한 가문과의 친밀도가 나가기 문턱 이상 */
export function npcLeagueApproves(
  representative: LeagueTraits,
  applicant: LeagueTraits,
  rules: NpcLeagueRules,
): boolean {
  return npcLeagueAffinity(representative, applicant) >= leaveFloor(rules);
}

/** 초대받은 NPC 가문이 받나(league-2): 들기 점수 ≥ 들기 문턱, 대표와의 친밀도 ≥ 나가기 문턱 */
export function npcLeagueAccepts(
  me: UnitTraits,
  representative: LeagueTraits,
  rules: NpcLeagueRules,
): boolean {
  return (
    npcLeagueJoinScore(me) >= Math.max(0, Math.trunc(rules.joinScore)) &&
    npcLeagueAffinity(me, representative) >= leaveFloor(rules)
  );
}

/**
 * NPC 대표가 부를 가문(league-2): 후보(부르는 쪽이 고른 — 어느 연맹에도 들지 않았고 이 연맹에 초대·신청이 없는 NPC 가문, 차례대로) 가운데 대표와의 친밀도가
 * 가장 높고 초대 문턱·나가기 문턱 이상인 하나(같으면 앞). 없으면 undefined
 */
export function npcLeagueInviteTarget(
  representative: LeagueTraits,
  candidates: readonly { readonly house: number; readonly traits: UnitTraits }[],
  rules: NpcLeagueRules,
): number | undefined {
  // 나가기 문턱 아래 가문은 부르지 않는다(들자마자 나가지 않게)
  const floor = Math.max(0, Math.trunc(rules.inviteScore ?? 600), leaveFloor(rules));
  let best: { house: number; score: number } | undefined;
  for (const candidate of candidates) {
    const score = npcLeagueAffinity(representative, candidate.traits);
    if (score >= floor && (!best || score > best.score)) best = { house: candidate.house, score };
  }
  return best?.house;
}
