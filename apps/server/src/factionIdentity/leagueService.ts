// 가문 연맹 저장·명령(npc-invest-2 — 기획 답 D-587 4·5·6, 질문 2502 "NPC 가문도 플레이어처럼"·2503 "위임이나 투표 등"). docs/adr/2026-11-21-npc-needs-drives.md
// "바뀜 (npc-invest-2)". 규칙은 houseLeague.ts(순수 함수), 표는 leagueStore.ts, NPC 판단은 npcLeague.ts.
// - 가문 열쇠: 플레이어 가문 p:<세력 행>, NPC 가문 n:<npc_city_houses ID>. 순수 함수에는 수로 넣는다(p:N → N, n:N → −N).
// - 플레이어 명령(house_league): 플레이어 가문장만(house_members role leader). 만들기·들기(그 가문이 스스로 고름 = 동의, 2462 다)·나가기·위임·투표.
//   [임시 — 들기 절차는 사용자에게 묻는 중(질문 2561)]: 초대·신청·대표 승인 없이 가문장이 고르면 바로 든다(지금 순수 함수 그대로). 한 가문이 드는 연맹 수 상한
//   없음(2504 지금대로).
// - NPC 가문(npcSweep — attach.ts 타이머가 한 시간마다): 아직 연맹에 들지 않은 NPC 가문(가문 ID 차례)이 가문장 성향으로 만들기·들기를 고른다(npcLeague.ts).
//   NPC 가문은 연맹 하나만 든다. 나가기·표는 아래 바뀜 (npc-fix-3).
// - 연맹은 나라·도시를 보지 않는다(2461 나). 효과(우호 기능)는 아직 없다(질문 2501).
// 메모리 표가 기준이다(켤 때 한 번 읽는다). 명령은 차례대로 하나씩(serial) — DB를 쓴 뒤 메모리를 바꾼다.
// 바뀜 (npc-fix-3, 기획 검토 2562 라·2563 다·2568): npcSweep이 차례로 ① 사라진 가문 빼기(지워진 NPC 가문·해산한 플레이어 가문 — 대표였으면 가장 오래 든 가문,
// 아무도 안 남으면 연맹 끝, houseLeague.ts pruneHouseLeague) ② 기간이 지난 투표 끝내기 ③ 든 NPC 가문의 나가기·표(npcLeague.ts — 나가기 → 열린 투표에 표 →
// 문턱 아래면 투표 열기) ④ 들지 않은 NPC 가문의 만들기·들기를 한다. 표는 플레이어 명령과 같은 함수(castVote — 기간·정족수, houseLeague.ts)를 거친다.
// 바뀜 (league-2, 사용자 결정 D-590 — 질문 2501 다·2502 다·2503 가·2504 나): docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (league-2, D-590)".
// - 들기 절차(2502 다): join = 받은 초대가 있으면 듦, 없으면 신청(pending). invite(대표 → 가문, 그 가문이 신청했으면 바로 듦)·approve(대표가 신청을 받음)·
//   decline(대표: 그 가문의 초대·신청 지움 / 가문장: 자기 것 지움). 옛 [임시] "고르면 바로 듦"을 대신한다. 표 house_league_requests.
// - (조항 카드 2501 다 — league-3에서 없앰, 아래)
// - 대표가 나가면 가장 오래 든 가문이 대표(2504 나 — 표를 지운다). 투표는 가문 1표 과반 그대로(2503 가).
// - NPC(npcSweep 차례): ① 빼기 ② 투표 끝내기 ③ 든 NPC 가문 나가기·표 ④ 들지 않은 NPC 가문 만들기·신청 ⑤ 초대받은 NPC 가문 수락·거절 ⑥ NPC 대표의 신청
//   승인·거절과 초대 하나(npcLeague.ts — 성향 규칙식 [임시], 질문 2644).
// 바뀜 (league-3, 사용자 결정 D-593 "연맹은 친목이라고 그런거 아니라고" — D-590 1을 대신한다): 연맹은 친목 모임일 뿐이다. 조항 카드(clause_on·clause_off, 표
//   house_league_clauses, 집행 조회 ties)를 없앴다. 옛 판(66) 기기가 카드 행동을 보내면 invalid_clause로 답한다(메시지 모양은 그대로). 표 house_league_clauses는
//   올라간 마이그레이션이라 지우지 않고 쓰지 않는다(연맹이 끝나면 외래 키 cascade로 줄이 지워진다).
import { isHouseKey } from "@terra/shared/governance";
import type { UnitTraits } from "@terra/shared/unitTraits";
import {
  type HouseLeague,
  type HouseLeagueFailure,
  type HouseLeagueRequestResult,
  type HouseLeagueVoteRules,
  applyHouseLeague,
  approveHouseLeague,
  declineHouseLeague,
  delegateHouseLeague,
  electHouseLeague,
  foundHouseLeague,
  houseLeagueVoteExpired,
  inviteHouseLeague,
  leaveHouseLeague,
  pruneHouseLeague,
  voteHouseLeague,
} from "./houseLeague.ts";
import {
  clearVotes,
  deleteMember,
  deleteRequest,
  endLeague,
  insertLeague,
  insertMember,
  livePlayerHouses,
  loadLeagueExtras,
  loadLeagues,
  setRepresentative,
  upsertRequest,
  upsertVote,
} from "./leagueStore.ts";
import { membershipOf } from "./members.ts";
import {
  type NpcLeagueRules,
  npcLeagueAccepts,
  npcLeagueApproves,
  npcLeagueChoice,
  npcLeagueInviteTarget,
  npcLeagueLeaves,
  npcLeagueStartsVote,
  npcLeagueVoteFor,
} from "./npcLeague.ts";

type QueryPool = Parameters<typeof loadLeagues>[0] & Parameters<typeof membershipOf>[0];

export type LeagueAction =
  | "found"
  | "join"
  | "leave"
  | "delegate"
  | "vote"
  | "invite"
  | "approve"
  | "decline"
  | "clause_on"
  | "clause_off";

export type LeagueCommandCode = HouseLeagueFailure | "not_house_head" | "unknown_league" | "invalid_house";

export type LeagueCommandResult =
  | {
      readonly ok: true;
      readonly leagueId?: number | undefined;
      /** 초대·신청만 남겼다(league-2) */
      readonly pending?: true | undefined;
    }
  | { readonly ok: false; readonly code: LeagueCommandCode };

/** 연맹 하나(조회 — trpc factionIdentity.leagues) */
export interface LeagueView {
  readonly id: number;
  readonly founder: string;
  readonly representative: string;
  readonly members: readonly string[];
  readonly createdAtMs: number;
  /** 초대·신청(league-2, 넣은 차례) */
  readonly requests: readonly { readonly house: string; readonly kind: "invite" | "apply" }[];
  /** 열린 대표 투표의 표(투표한 가문 → 찍은 가문) */
  readonly votes: readonly { readonly voter: string; readonly candidate: string }[];
}

/** NPC 가문 하나(판단 입력 — 가문장 7축 성향) */
export interface NpcLeagueHouse {
  readonly houseId: number;
  readonly traits: UnitTraits;
}

/** NPC 가문 판단 한 번의 입력(npc-fix-3) */
export interface NpcLeagueSweep {
  /** 성향을 아는 NPC 가문(판단하는 가문) */
  readonly houses: readonly NpcLeagueHouse[];
  /** 지금 있는 NPC 가문 ID 전부(사라진 가문 빼기). 없으면 NPC 가문은 빼지 않는다(세계를 모를 때) */
  readonly liveNpcHouses?: ReadonlySet<number> | undefined;
}

/** NPC 가문 판단 한 번의 결과 */
export interface NpcLeagueSweepResult {
  /** 만들거나 든 수(신청을 받아 듦·초대를 받아 듦 포함 — league-2) */
  readonly joined: number;
  /** 새로 남긴 신청·초대 수(league-2) */
  readonly requested: number;
  readonly left: number;
  readonly votes: number;
  /** 빼낸 사라진 가문 수 */
  readonly pruned: number;
}

export interface HouseLeagueService {
  command(
    userId: string,
    input: {
      readonly action: LeagueAction;
      readonly leagueId?: number | undefined;
      readonly house?: string | undefined;
      /** 옛 조항 카드(clause_on·clause_off — league-2, league-3에서 없앰: 받아도 invalid_clause) */
      readonly clause?: string | undefined;
    },
  ): Promise<LeagueCommandResult>;
  list(): Promise<readonly LeagueView[]>;
  /** NPC 가문 판단(위 머리 주석 — 사라진 가문 빼기·투표 끝내기·나가기·표·만들기·들기) */
  npcSweep(input: NpcLeagueSweep, rules: NpcLeagueRules): Promise<NpcLeagueSweepResult>;
}

/** 가문 열쇠 → 순수 함수의 수(p:N → N, n:N → −N) */
export const leagueHouseNum = (key: string): number =>
  key.startsWith("n:") ? -Number(key.slice(2)) : Number(key.slice(2));
/** 수 → 가문 열쇠 */
export const leagueHouseKey = (num: number): string => (num < 0 ? `n:${-num}` : `p:${num}`);

/** 투표 기간·정족수 기본값(설정 칸이 없을 때 — 3일, 500‰) */
const DEFAULT_VOTE_RULES: HouseLeagueVoteRules = { periodMs: 259_200_000, quorumPm: 500 };

interface LeagueState {
  leagues: Map<number, HouseLeague>;
  votes: Map<number, Map<number, number>>;
  /** 연맹 → 열린 투표의 첫 표 시각(npc-fix-3 — 투표 기간) */
  opened: Map<number, number>;
  /** 연맹 → 초대·신청(league-2) */
  requests: Map<number, Map<number, "invite" | "apply">>;
}

export function createHouseLeagueService(o: {
  readonly pool: QueryPool;
  readonly now: () => number;
  /** 투표 기간·정족수(npc-fix-3 — 설정 칸). 없으면 기본값 */
  readonly voteRules?: (() => HouseLeagueVoteRules) | undefined;
}): HouseLeagueService {
  const voteRules = () => o.voteRules?.() ?? DEFAULT_VOTE_RULES;
  let state: Promise<LeagueState> | undefined;
  const load = () => {
    state ??= Promise.all([loadLeagues(o.pool), loadLeagueExtras(o.pool)]).then(
      ([{ leagues, votes }, extras]) => {
        const out = new Map<number, HouseLeague>();
        for (const row of leagues)
          out.set(row.id, {
            id: row.id,
            founder: leagueHouseNum(row.founderKey),
            representative: leagueHouseNum(row.representativeKey),
            members: row.members.map(leagueHouseNum),
            createdAtMs: row.createdAtMs,
          });
        const tallies = new Map<number, Map<number, number>>();
        const opened = new Map<number, number>();
        for (const vote of votes) {
          const map = tallies.get(vote.leagueId) ?? new Map<number, number>();
          map.set(leagueHouseNum(vote.voterKey), leagueHouseNum(vote.candidateKey));
          tallies.set(vote.leagueId, map);
          const first = opened.get(vote.leagueId);
          if (first === undefined || vote.atMs < first) opened.set(vote.leagueId, vote.atMs);
        }
        const requests = new Map<number, Map<number, "invite" | "apply">>();
        for (const row of extras.requests) {
          const map = requests.get(row.leagueId) ?? new Map<number, "invite" | "apply">();
          map.set(leagueHouseNum(row.houseKey), row.kind);
          requests.set(row.leagueId, map);
        }
        const next: LeagueState = { leagues: out, votes: tallies, opened, requests };
        return next;
      },
    );
    // 읽기가 실패하면 다음에 다시 읽는다
    state.catch(() => {
      state = undefined;
    });
    return state;
  };
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };

  const found = async (house: number): Promise<LeagueCommandResult> => {
    const s = await load();
    const nowMs = o.now();
    const id = await insertLeague(o.pool, leagueHouseKey(house), nowMs);
    s.leagues.set(id, foundHouseLeague(id, house, nowMs));
    return { ok: true, leagueId: id };
  };
  /** 연맹이 끝났다(메모리) */
  const forget = (s: LeagueState, leagueId: number) => {
    s.leagues.delete(leagueId);
    s.votes.delete(leagueId);
    s.opened.delete(leagueId);
    s.requests.delete(leagueId);
  };
  /** 들기 절차 결과를 표·메모리에 옮긴다(league-2). 들었으면 pending 없음, 초대·신청만이면 pending */
  const settleRequest = async (
    s: LeagueState,
    leagueId: number,
    house: number,
    r: HouseLeagueRequestResult,
  ): Promise<LeagueCommandResult> => {
    if (!r.ok) return r;
    const key = leagueHouseKey(house);
    const kind = r.requests.get(house);
    if (r.joined !== null) {
      await insertMember(o.pool, leagueId, key, o.now());
      await deleteRequest(o.pool, leagueId, key);
      s.leagues.set(leagueId, r.league);
    } else if (kind === undefined) await deleteRequest(o.pool, leagueId, key);
    else await upsertRequest(o.pool, leagueId, key, kind, o.now());
    if (r.requests.size === 0) s.requests.delete(leagueId);
    else s.requests.set(leagueId, new Map(r.requests));
    return r.joined === null && kind !== undefined
      ? { ok: true, leagueId, pending: true }
      : { ok: true, leagueId };
  };
  const requestsOf = (s: LeagueState, leagueId: number) =>
    s.requests.get(leagueId) ?? new Map<number, "invite" | "apply">();
  /** 기간이 지난 투표를 끝낸다(표를 지움). 끝냈으면 true */
  const expire = async (s: LeagueState, leagueId: number): Promise<boolean> => {
    if (!houseLeagueVoteExpired(s.opened.get(leagueId), o.now(), voteRules())) return false;
    await clearVotes(o.pool, leagueId);
    s.votes.delete(leagueId);
    s.opened.delete(leagueId);
    return true;
  };
  /** 표 하나(플레이어 명령·NPC 판단 같은 길 — 기간·정족수, houseLeague.ts voteHouseLeague) */
  const castVote = async (
    s: LeagueState,
    league: HouseLeague,
    voter: number,
    candidate: number,
  ): Promise<LeagueCommandResult> => {
    await expire(s, league.id);
    const r = voteHouseLeague(
      league,
      s.votes.get(league.id) ?? new Map(),
      voter,
      candidate,
      voteRules().quorumPm,
    );
    if (!r.ok) return r;
    if (r.elected !== null) {
      await setRepresentative(o.pool, league.id, leagueHouseKey(r.elected));
      s.leagues.set(league.id, electHouseLeague(league, r.elected));
    } else if (r.votes.size === 0) await clearVotes(o.pool, league.id);
    else await upsertVote(o.pool, league.id, leagueHouseKey(voter), leagueHouseKey(candidate), o.now());
    if (r.votes.size === 0) {
      s.votes.delete(league.id);
      s.opened.delete(league.id);
    } else {
      s.votes.set(league.id, new Map(r.votes));
      if (!s.opened.has(league.id)) s.opened.set(league.id, o.now());
    }
    return { ok: true, leagueId: league.id };
  };
  /** 가문이 나간다(플레이어 명령·NPC 판단 같은 길) */
  const leave = async (s: LeagueState, league: HouseLeague, house: number): Promise<LeagueCommandResult> => {
    const r = leaveHouseLeague(league, house);
    if (!r.ok) return r;
    if (r.league) {
      await deleteMember(o.pool, league.id, leagueHouseKey(house));
      s.leagues.set(league.id, r.league);
      if (r.league.representative !== league.representative) {
        // 대표가 나갔다(D-590 2504 나): 가장 오래 든 가문이 대표, 표를 모두 지운다(위임·투표와 같게)
        await setRepresentative(o.pool, league.id, leagueHouseKey(r.league.representative));
        s.votes.delete(league.id);
        s.opened.delete(league.id);
        return { ok: true, leagueId: league.id };
      }
      s.votes.get(league.id)?.delete(house);
      // 그 가문을 찍은 표도 지운다(deleteMember와 같게)
      for (const [voter, chosen] of s.votes.get(league.id) ?? [])
        if (chosen === house) s.votes.get(league.id)?.delete(voter);
      if ((s.votes.get(league.id)?.size ?? 0) === 0) {
        s.votes.delete(league.id);
        s.opened.delete(league.id);
      }
    } else {
      await endLeague(o.pool, league.id, o.now());
      forget(s, league.id);
    }
    return { ok: true, leagueId: league.id };
  };
  /** 사라진 가문 빼기(2568 — houseLeague.ts pruneHouseLeague). 빼낸 가문 수 */
  const prune = async (s: LeagueState, liveNpc: ReadonlySet<number> | undefined): Promise<number> => {
    const players = new Set<number>();
    for (const league of s.leagues.values())
      for (const member of league.members) if (member > 0) players.add(member);
    const livePlayers = await livePlayerHouses(o.pool, [...players]);
    const alive = (house: number) => (house > 0 ? livePlayers.has(house) : !liveNpc || liveNpc.has(-house));
    let pruned = 0;
    for (const league of [...s.leagues.values()].toSorted((a, b) => a.id - b.id)) {
      const next = pruneHouseLeague(league, alive);
      if (next === league) continue;
      const gone = league.members.filter((member) => !alive(member));
      pruned += gone.length;
      if (next === null) {
        await endLeague(o.pool, league.id, o.now());
        forget(s, league.id);
        continue;
      }
      for (const member of gone) await deleteMember(o.pool, league.id, leagueHouseKey(member));
      const votes = s.votes.get(league.id);
      for (const [voter, chosen] of votes ?? []) if (!alive(voter) || !alive(chosen)) votes?.delete(voter);
      if (next.representative !== league.representative) {
        // 대표가 바뀌면 표를 모두 지운다(위임·투표와 같게)
        await setRepresentative(o.pool, league.id, leagueHouseKey(next.representative));
        s.votes.delete(league.id);
        s.opened.delete(league.id);
      } else if ((votes?.size ?? 0) === 0) {
        s.votes.delete(league.id);
        s.opened.delete(league.id);
      }
      s.leagues.set(league.id, next);
    }
    return pruned;
  };
  /** 가문장이 신청한다(받은 초대가 있으면 듦 — league-2 2502 다) */
  const apply = async (leagueId: number, house: number): Promise<LeagueCommandResult> => {
    const s = await load();
    const league = s.leagues.get(leagueId);
    if (!league) return { ok: false, code: "unknown_league" };
    return settleRequest(s, leagueId, house, applyHouseLeague(league, requestsOf(s, leagueId), house));
  };
  /** 대표 명령(league-2): 초대·승인·거절 */
  const repCommand = async (
    s: LeagueState,
    league: HouseLeague,
    me: number,
    input: {
      readonly action: LeagueAction;
      readonly house?: string | undefined;
    },
  ): Promise<LeagueCommandResult> => {
    const target = input.house;
    if (input.action === "decline" && target === undefined)
      return settleRequest(s, league.id, me, declineHouseLeague(league, requestsOf(s, league.id), me));
    if (target === undefined || !isHouseKey(target)) return { ok: false, code: "invalid_house" };
    const to = leagueHouseNum(target);
    const requests = requestsOf(s, league.id);
    if (input.action === "invite")
      return settleRequest(s, league.id, to, inviteHouseLeague(league, requests, me, to));
    if (input.action === "approve")
      return settleRequest(s, league.id, to, approveHouseLeague(league, requests, me, to));
    return settleRequest(s, league.id, to, declineHouseLeague(league, requests, me, to));
  };

  return {
    command: (userId, input) =>
      serial(async () => {
        const membership = await membershipOf(o.pool, userId);
        if (membership?.role !== "leader") return { ok: false, code: "not_house_head" };
        const me = membership.factionId;
        // 옛 조항 카드 행동(league-3 D-593에서 없앰) — 옛 판 기기에 같은 답 꼴
        if (input.action === "clause_on" || input.action === "clause_off")
          return { ok: false, code: "invalid_clause" };
        if (input.action === "found") return found(me);
        const s = await load();
        const leagueId = input.leagueId ?? 0;
        const league = s.leagues.get(leagueId);
        if (!league) return { ok: false, code: "unknown_league" };
        if (input.action === "join") return apply(leagueId, me);
        if (input.action === "leave") return leave(s, league, me);
        if (input.action === "invite" || input.action === "approve" || input.action === "decline")
          return repCommand(s, league, me, input);
        const target = input.house;
        if (target === undefined || !isHouseKey(target)) return { ok: false, code: "invalid_house" };
        const to = leagueHouseNum(target);
        if (input.action === "delegate") {
          const r = delegateHouseLeague(league, me, to);
          if (!r.ok || !r.league) return r.ok ? { ok: false, code: "unknown_league" } : r;
          await setRepresentative(o.pool, leagueId, target);
          s.leagues.set(leagueId, r.league);
          s.votes.delete(leagueId);
          s.opened.delete(leagueId);
          return { ok: true, leagueId };
        }
        return castVote(s, league, me, to);
      }),
    list: async () => {
      const s = await load();
      return [...s.leagues.values()]
        .toSorted((a, b) => a.id - b.id)
        .map((league) => ({
          id: league.id,
          founder: leagueHouseKey(league.founder),
          representative: leagueHouseKey(league.representative),
          members: league.members.map(leagueHouseKey),
          createdAtMs: league.createdAtMs,
          requests: [...(s.requests.get(league.id) ?? [])].map(([house, kind]) => ({
            house: leagueHouseKey(house),
            kind,
          })),
          votes: [...(s.votes.get(league.id) ?? [])].map(([voter, candidate]) => ({
            voter: leagueHouseKey(voter),
            candidate: leagueHouseKey(candidate),
          })),
        }));
    },
    npcSweep: (input, rules) =>
      serial(async () => {
        const s = await load();
        // ① 사라진 가문 빼기 ② 기간이 지난 투표 끝내기
        const pruned = await prune(s, input.liveNpcHouses);
        for (const leagueId of [...s.opened.keys()].toSorted((a, b) => a - b)) await expire(s, leagueId);
        const traitsOf = new Map<number, UnitTraits>();
        for (const house of input.houses) if (house.houseId > 0) traitsOf.set(-house.houseId, house.traits);
        // ③ 든 NPC 가문: 나가기 → 열린 투표에 표 → 문턱 아래면 투표 열기(연맹 ID 차례, 그 안은 든 차례)
        let left = 0;
        let votes = 0;
        for (const leagueId of [...s.leagues.keys()].toSorted((a, b) => a - b)) {
          for (const house of s.leagues.get(leagueId)?.members ?? []) {
            const league = s.leagues.get(leagueId);
            const traits = traitsOf.get(house);
            if (!league || !traits || !league.members.includes(house)) continue;
            const isRep = house === league.representative;
            const repTraits = traitsOf.get(league.representative);
            if (npcLeagueLeaves(traits, repTraits, isRep, rules)) {
              if ((await leave(s, league, house)).ok) left += 1;
              continue;
            }
            const open = (s.votes.get(leagueId)?.size ?? 0) > 0;
            if (
              open ? s.votes.get(leagueId)?.has(house) : !npcLeagueStartsVote(traits, repTraits, isRep, rules)
            )
              continue;
            const candidate = npcLeagueVoteFor(
              { house, traits },
              league.members.map((member) => ({ house: member, traits: traitsOf.get(member) })),
              league.representative,
            );
            // 투표를 여는데 가장 가까운 가문이 지금 대표면 열지 않는다(바꿀 것이 없다)
            if (candidate === undefined || (!open && candidate === league.representative)) continue;
            if ((await castVote(s, league, house, candidate)).ok) votes += 1;
          }
        }
        // ④ 들지 않은 NPC 가문: 만들기·신청(보낸 신청이 있으면 기다린다 — league-2)
        const inLeague = new Set<number>();
        for (const league of s.leagues.values()) for (const member of league.members) inLeague.add(member);
        const applied = new Set<number>();
        for (const map of s.requests.values())
          for (const [house, kind] of map) if (kind === "apply") applied.add(house);
        let joined = 0;
        let requested = 0;
        for (const house of input.houses.toSorted((a, b) => a.houseId - b.houseId)) {
          const num = -house.houseId;
          if (house.houseId <= 0 || inLeague.has(num) || applied.has(num)) continue;
          const choice = npcLeagueChoice(
            house.traits,
            [...s.leagues.values()].map((league) => ({
              id: league.id,
              members: league.members.length,
              representative: traitsOf.get(league.representative),
            })),
            rules,
          );
          if (!choice) continue;
          const r = choice.kind === "found" ? await found(num) : await apply(choice.leagueId, num);
          if (!r.ok) continue;
          if (r.pending) {
            applied.add(num);
            requested += 1;
          } else {
            inLeague.add(num);
            joined += 1;
          }
        }
        // ⑤ 초대받은 NPC 가문: 수락·거절(연맹 ID 차례 — 이미 다른 연맹에 들었어도 받는다, 연맹 수 상한 없음)
        for (const leagueId of [...s.requests.keys()].toSorted((a, b) => a - b)) {
          // settleRequest는 표를 새 Map으로 바꾼다(돌고 있는 Map은 그대로)
          for (const [house, kind] of s.requests.get(leagueId) ?? []) {
            const league = s.leagues.get(leagueId);
            const traits = traitsOf.get(house);
            if (!league || !traits || kind !== "invite") continue;
            const r = npcLeagueAccepts(traits, traitsOf.get(league.representative), rules)
              ? await apply(leagueId, house)
              : await settleRequest(
                  s,
                  leagueId,
                  house,
                  declineHouseLeague(league, requestsOf(s, leagueId), house),
                );
            if (r.ok && !r.pending && league.members.length < (s.leagues.get(leagueId)?.members.length ?? 0))
              joined += 1;
          }
        }
        // ⑥ NPC 대표: 신청 받기·거절, 그다음 초대 하나(아직 어느 연맹에도 들지 않았고 이 연맹에 초대·신청이 없는 NPC 가문)
        for (const leagueId of [...s.leagues.keys()].toSorted((a, b) => a - b)) {
          const first = s.leagues.get(leagueId);
          const repTraits = first ? traitsOf.get(first.representative) : undefined;
          if (!first || !repTraits) continue;
          for (const [house, kind] of requestsOf(s, leagueId)) {
            const league = s.leagues.get(leagueId);
            if (!league || kind !== "apply") continue;
            const requests = requestsOf(s, leagueId);
            const r = npcLeagueApproves(repTraits, traitsOf.get(house), rules)
              ? await settleRequest(
                  s,
                  leagueId,
                  house,
                  approveHouseLeague(league, requests, league.representative, house),
                )
              : await settleRequest(
                  s,
                  leagueId,
                  house,
                  declineHouseLeague(league, requests, league.representative, house),
                );
            if (r.ok && (s.leagues.get(leagueId)?.members.length ?? 0) > league.members.length) joined += 1;
          }
          const league = s.leagues.get(leagueId);
          if (!league) continue;
          const busy = requestsOf(s, leagueId);
          const anyLeague = new Set<number>();
          for (const other of s.leagues.values()) for (const member of other.members) anyLeague.add(member);
          const target = npcLeagueInviteTarget(
            repTraits,
            input.houses
              .filter((h) => h.houseId > 0 && !anyLeague.has(-h.houseId) && !busy.has(-h.houseId))
              .toSorted((a, b) => a.houseId - b.houseId)
              .map((h) => ({ house: -h.houseId, traits: h.traits })),
            rules,
          );
          if (target === undefined) continue;
          const r = await settleRequest(
            s,
            leagueId,
            target,
            inviteHouseLeague(league, busy, league.representative, target),
          );
          if (r.ok && r.pending) requested += 1;
        }
        return { joined, requested, left, votes, pruned };
      }),
  };
}
