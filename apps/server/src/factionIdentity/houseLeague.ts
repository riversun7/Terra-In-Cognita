// 가문 연맹 = 가문끼리 맺는 조약(우호 기능) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (2026-11-22, D-587 연맹 바로잡기·NPC 투자 판단)"
// 사용자 답(D-587):
// - 2461 나: 연맹은 가문끼리 맺는 조약이다. 서로 다른 나라·도시에 사는 플레이어끼리도 관계를 이어 가게 하는 우호 기능이고, 나라와 상관없다.
//   도시 내정 기구가 아니다(도시·나라를 보지 않는다 — 여기 어느 함수도 도시·나라를 받지 않는다).
// - 2462 다: 플레이어 가문은 들지 고른다(가입은 그 가문이 스스로 한다 — 저절로 넣지 않는다).
// - 2463: 대표 = 연맹을 처음 만든 가문. 위임·투표 등으로 바뀔 수 있다(나라와 상관없음). 위임·투표 모두 여기 있다(투표 꼴은 [임시] — 아래 바뀜).
// - 2464: 연맹은 확장·생산 투자를 하지 않는다(기금·국고 넘기기·직접 짓기 없음). 그래서 금고·분담금이 없다.
// 순수 규칙만 둔다(상태를 받아 새 상태를 돌려준다). 저장·명령은 leagueStore.ts·leagueService.ts(npc-invest-2 — 질문 2502 "NPC 가문도 플레이어처럼
// 만들고 든다"), 화면·우호 기능은 아직 없다(질문 2501). 가문 ID는 부르는 쪽이 정한 수(서비스는 가문 열쇠 p:/n:를 수로 바꿔 넣는다).
// [임시] 기술 기본값(질문 2504): 대표는 위임하기 전에는 나가지 못한다(남은 가문이 없으면 나가며 연맹이 끝난다). 한 가문이 드는 연맹 수 상한은 두지 않는다.

/** 연맹 하나 */
export interface HouseLeague {
  readonly id: number;
  /** 처음 만든 가문(바뀌지 않는다) */
  readonly founder: number;
  /** 지금 대표(처음엔 만든 가문, 위임으로 바뀐다) */
  readonly representative: number;
  /** 든 가문(든 차례). 대표와 만든 가문도 들어 있다 */
  readonly members: readonly number[];
  readonly createdAtMs: number;
}

export type HouseLeagueFailure =
  | "already_member"
  | "not_member"
  | "not_representative"
  | "representative_must_delegate"
  | "same_house"
  | "consent_required";

export type HouseLeagueResult =
  | { readonly ok: true; readonly league: HouseLeague | null }
  | { readonly ok: false; readonly code: HouseLeagueFailure };

const fail = (code: HouseLeagueFailure): HouseLeagueResult => ({ ok: false, code });

/** 연맹을 만든다: 만든 가문이 대표이자 첫 가문 */
export function foundHouseLeague(id: number, founder: number, nowMs: number): HouseLeague {
  return { id, founder, representative: founder, members: [founder], createdAtMs: nowMs };
}

/**
 * 가문이 든다(2462 다 — 고른 가문만). consent = 그 가문이 스스로 고른 것(가문장 명령)인가. 남이 넣어 줄 수 없다. 나라·도시는 보지 않는다(2461 나)
 */
export function joinHouseLeague(league: HouseLeague, house: number, consent: boolean): HouseLeagueResult {
  if (!consent) return fail("consent_required");
  if (league.members.includes(house)) return fail("already_member");
  return { ok: true, league: { ...league, members: [...league.members, house] } };
}

/**
 * 가문이 나간다. 대표는 먼저 위임해야 한다([임시] 2504). 대표 혼자 남았으면 나가며 연맹이 끝난다(league = null)
 */
export function leaveHouseLeague(league: HouseLeague, house: number): HouseLeagueResult {
  if (!league.members.includes(house)) return fail("not_member");
  if (house === league.representative) {
    if (league.members.length > 1) return fail("representative_must_delegate");
    return { ok: true, league: null };
  }
  return { ok: true, league: { ...league, members: league.members.filter((member) => member !== house) } };
}

/** 대표 위임(2463): 지금 대표만, 든 다른 가문에게. 만든 가문 기록은 그대로 */
export function delegateHouseLeague(league: HouseLeague, from: number, to: number): HouseLeagueResult {
  if (from !== league.representative) return fail("not_representative");
  if (from === to) return fail("same_house");
  if (!league.members.includes(to)) return fail("not_member");
  return { ok: true, league: { ...league, representative: to } };
}

// 바뀜 (npc-invest-2, 질문 2503 — D-587 6 "위임이나 투표 등"): 투표로 대표 바꾸기를 위임과 함께 둔다. 표 꼴은 사용자에게 묻는 중이라 가장 작은 [임시]:
// 든 가문마다 한 표(가문장이 던진다), 든 가문의 과반(절반 넘게)이 한 후보(든 가문)를 찍으면 그 가문이 대표가 되고 표를 모두 지운다. 기간·정족수 없음,
// 표는 바꿀 수 있다(마지막 표만 센다), 나간 가문의 표는 지운다. NPC 가문은 표를 던지지 않는다(leagueService.ts — 질문 2562) → 아래 바뀜 (npc-fix-3)에서 던진다.

/** 표 하나: 투표한 가문 → 찍은 가문 */
export type HouseLeagueVotes = ReadonlyMap<number, number>;

export type HouseLeagueVoteResult =
  | { readonly ok: true; readonly votes: HouseLeagueVotes; readonly elected: number | null }
  | { readonly ok: false; readonly code: HouseLeagueFailure };

// 바뀜 (npc-fix-3, 기획 검토 2562 라 — D-555 1509): NPC 가문도 표를 던진다(leagueService.ts npcSweep — 성향 규칙식 npcLeague.ts). 투표 기간·정족수는 기술
// 기본값(설정 칸): 첫 표가 들어온 때부터 house_league_vote_period_ms가 지나면 그 투표는 끝나고 표를 모두 지운다(과반이 모이지 않은 채 끝남 — 그 뒤 첫 표가
// 새 투표를 연다). 정족수 = 표를 던진 가문이 든 가문의 house_league_vote_quorum_pm‰ 이상일 때만 뽑힌다. 세는 꼴은 묻는 중이라 지금 [임시] 그대로(든 가문의
// 과반이 한 후보 — 과반이면 정족수 500‰ 이하는 늘 찬다. 칸은 세는 꼴이 바뀔 때(던진 표의 과반 등) 쓴다 — 질문 2562 가·다).

/** 투표 기간·정족수(설정 칸) */
export interface HouseLeagueVoteRules {
  /** 첫 표부터 이 시간(ms)이 지나면 투표가 끝난다. 0이면 끝나지 않는다 */
  readonly periodMs: number;
  /** 표를 던진 가문 ÷ 든 가문(‰)이 이 값 이상이어야 뽑힌다 */
  readonly quorumPm: number;
}

/** 투표가 끝났나: 열린 때(첫 표)가 있고 기간이 0보다 크며 지금이 열린 때 + 기간 이후 */
export function houseLeagueVoteExpired(
  openedAtMs: number | undefined,
  nowMs: number,
  rules: Pick<HouseLeagueVoteRules, "periodMs">,
): boolean {
  const period = Math.max(0, Math.trunc(rules.periodMs));
  return openedAtMs !== undefined && period > 0 && nowMs >= openedAtMs + period;
}

/**
 * 투표(위 바뀜): voter·candidate 모두 든 가문이어야 한다. 표를 넣은 뒤 과반이 모인 후보가 지금 대표가 아니면 elected = 그 가문(부르는 쪽이 대표를 바꾸고
 * 표를 지운다). 지금 대표에게 과반이 모이면 표만 지운다(elected = null, votes 빔). quorumPm(npc-fix-3) = 표를 던진 가문 몫의 아래 끝(‰, 없으면 0)
 */
export function voteHouseLeague(
  league: HouseLeague,
  votes: HouseLeagueVotes,
  voter: number,
  candidate: number,
  quorumPm = 0,
): HouseLeagueVoteResult {
  if (!league.members.includes(voter) || !league.members.includes(candidate))
    return { ok: false, code: "not_member" };
  const next = new Map([...votes].filter(([house]) => league.members.includes(house)));
  next.set(voter, candidate);
  let tally = 0;
  for (const chosen of next.values()) if (chosen === candidate) tally += 1;
  const quorum = next.size * 1000 >= league.members.length * Math.max(0, Math.trunc(quorumPm));
  if (tally * 2 <= league.members.length || !quorum) return { ok: true, votes: next, elected: null };
  return { ok: true, votes: new Map(), elected: candidate === league.representative ? null : candidate };
}

/** 대표를 바꾼다(투표 결과 — 위임과 달리 지금 대표의 동의가 없다). 든 가문이 아니면 그대로 */
export function electHouseLeague(league: HouseLeague, to: number): HouseLeague {
  return league.members.includes(to) ? { ...league, representative: to } : league;
}

// 바뀜 (npc-fix-3, 기획 검토 2568 — 기술 기본값): 사라진 가문(지워진 NPC 가문·해산한 플레이어 가문)은 연맹에서 뺀다. 대표가 사라졌으면 남은 가문 가운데 가장
// 오래 든 가문(든 차례 첫째)이 대표가 된다 [임시 — 대표 승계 꼴은 앞 질문 2504·2568과 함께 묻는 중]. 남은 가문이 없으면 연맹이 끝난다(league = null).

/** 사라진 가문을 뺀다. 바뀐 것이 없으면 그 연맹 그대로, 아무도 안 남으면 null */
export function pruneHouseLeague(league: HouseLeague, alive: (house: number) => boolean): HouseLeague | null {
  const members = league.members.filter(alive);
  if (members.length === league.members.length) return league;
  const [first] = members;
  if (first === undefined) return null;
  return {
    ...league,
    members,
    representative: members.includes(league.representative) ? league.representative : first,
  };
}
