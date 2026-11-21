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
import { isHouseKey } from "@terra/shared/governance";
import type { UnitTraits } from "@terra/shared/unitTraits";
import {
  type HouseLeague,
  type HouseLeagueFailure,
  type HouseLeagueVoteRules,
  delegateHouseLeague,
  electHouseLeague,
  foundHouseLeague,
  houseLeagueVoteExpired,
  joinHouseLeague,
  leaveHouseLeague,
  pruneHouseLeague,
  voteHouseLeague,
} from "./houseLeague.ts";
import {
  clearVotes,
  deleteMember,
  endLeague,
  insertLeague,
  insertMember,
  livePlayerHouses,
  loadLeagues,
  setRepresentative,
  upsertVote,
} from "./leagueStore.ts";
import { membershipOf } from "./members.ts";
import {
  type NpcLeagueRules,
  npcLeagueChoice,
  npcLeagueLeaves,
  npcLeagueStartsVote,
  npcLeagueVoteFor,
} from "./npcLeague.ts";

type QueryPool = Parameters<typeof loadLeagues>[0] & Parameters<typeof membershipOf>[0];

export type LeagueAction = "found" | "join" | "leave" | "delegate" | "vote";

export type LeagueCommandCode = HouseLeagueFailure | "not_house_head" | "unknown_league" | "invalid_house";

export type LeagueCommandResult =
  | { readonly ok: true; readonly leagueId?: number | undefined }
  | { readonly ok: false; readonly code: LeagueCommandCode };

/** 연맹 하나(조회 — trpc factionIdentity.leagues) */
export interface LeagueView {
  readonly id: number;
  readonly founder: string;
  readonly representative: string;
  readonly members: readonly string[];
  readonly createdAtMs: number;
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
  /** 만들거나 든 수 */
  readonly joined: number;
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
    state ??= loadLeagues(o.pool).then(({ leagues, votes }) => {
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
      return { leagues: out, votes: tallies, opened };
    });
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
      s.leagues.delete(league.id);
      s.votes.delete(league.id);
      s.opened.delete(league.id);
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
        s.leagues.delete(league.id);
        s.votes.delete(league.id);
        s.opened.delete(league.id);
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
  const join = async (leagueId: number, house: number): Promise<LeagueCommandResult> => {
    const s = await load();
    const league = s.leagues.get(leagueId);
    if (!league) return { ok: false, code: "unknown_league" };
    const r = joinHouseLeague(league, house, true);
    if (!r.ok || !r.league) return r.ok ? { ok: false, code: "unknown_league" } : r;
    await insertMember(o.pool, leagueId, leagueHouseKey(house), o.now());
    s.leagues.set(leagueId, r.league);
    return { ok: true, leagueId };
  };

  return {
    command: (userId, input) =>
      serial(async () => {
        const membership = await membershipOf(o.pool, userId);
        if (membership?.role !== "leader") return { ok: false, code: "not_house_head" };
        const me = membership.factionId;
        if (input.action === "found") return found(me);
        const s = await load();
        const leagueId = input.leagueId ?? 0;
        const league = s.leagues.get(leagueId);
        if (!league) return { ok: false, code: "unknown_league" };
        if (input.action === "join") return join(leagueId, me);
        if (input.action === "leave") return leave(s, league, me);
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
        // ④ 들지 않은 NPC 가문: 만들기·들기
        const inLeague = new Set<number>();
        for (const league of s.leagues.values()) for (const member of league.members) inLeague.add(member);
        let joined = 0;
        for (const house of input.houses.toSorted((a, b) => a.houseId - b.houseId)) {
          const num = -house.houseId;
          if (house.houseId <= 0 || inLeague.has(num)) continue;
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
          const r = choice.kind === "found" ? await found(num) : await join(choice.leagueId, num);
          if (r.ok) {
            inLeague.add(num);
            joined += 1;
          }
        }
        return { joined, left, votes, pruned };
      }),
  };
}
