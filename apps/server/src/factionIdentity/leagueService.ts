// 가문 연맹 저장·명령(npc-invest-2 — 기획 답 D-587 4·5·6, 질문 2502 "NPC 가문도 플레이어처럼"·2503 "위임이나 투표 등"). docs/adr/2026-11-21-npc-needs-drives.md
// "바뀜 (npc-invest-2)". 규칙은 houseLeague.ts(순수 함수), 표는 leagueStore.ts, NPC 판단은 npcLeague.ts.
// - 가문 열쇠: 플레이어 가문 p:<세력 행>, NPC 가문 n:<npc_city_houses ID>. 순수 함수에는 수로 넣는다(p:N → N, n:N → −N).
// - 플레이어 명령(house_league): 플레이어 가문장만(house_members role leader). 만들기·들기(그 가문이 스스로 고름 = 동의, 2462 다)·나가기·위임·투표.
//   [임시 — 들기 절차는 사용자에게 묻는 중(질문 2561)]: 초대·신청·대표 승인 없이 가문장이 고르면 바로 든다(지금 순수 함수 그대로). 한 가문이 드는 연맹 수 상한
//   없음(2504 지금대로).
// - NPC 가문(npcSweep — attach.ts 타이머가 한 시간마다): 아직 연맹에 들지 않은 NPC 가문(가문 ID 차례)이 가문장 성향으로 만들기·들기를 고른다(npcLeague.ts).
//   NPC 가문은 연맹 하나만 들고 나가지 않으며, 표를 던지지 않는다(질문 2562 [임시]).
// - 연맹은 나라·도시를 보지 않는다(2461 나). 효과(우호 기능)는 아직 없다(질문 2501).
// 메모리 표가 기준이다(켤 때 한 번 읽는다). 명령은 차례대로 하나씩(serial) — DB를 쓴 뒤 메모리를 바꾼다.
import { isHouseKey } from "@terra/shared/governance";
import {
  type HouseLeague,
  type HouseLeagueFailure,
  delegateHouseLeague,
  electHouseLeague,
  foundHouseLeague,
  joinHouseLeague,
  leaveHouseLeague,
  voteHouseLeague,
} from "./houseLeague.ts";
import {
  clearVotes,
  deleteMember,
  endLeague,
  insertLeague,
  insertMember,
  loadLeagues,
  setRepresentative,
  upsertVote,
} from "./leagueStore.ts";
import { membershipOf } from "./members.ts";
import { type NpcLeagueRules, npcLeagueChoice } from "./npcLeague.ts";

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

/** NPC 가문 하나(판단 입력) */
export interface NpcLeagueHouse {
  readonly houseId: number;
  readonly traits: {
    readonly openness: number;
    readonly communalism: number;
    readonly autonomy: number;
    readonly boldness: number;
  };
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
  /** NPC 가문 판단(위 머리 주석). 만들거나 든 수 */
  npcSweep(houses: readonly NpcLeagueHouse[], rules: NpcLeagueRules): Promise<number>;
}

/** 가문 열쇠 → 순수 함수의 수(p:N → N, n:N → −N) */
export const leagueHouseNum = (key: string): number =>
  key.startsWith("n:") ? -Number(key.slice(2)) : Number(key.slice(2));
/** 수 → 가문 열쇠 */
export const leagueHouseKey = (num: number): string => (num < 0 ? `n:${-num}` : `p:${num}`);

export function createHouseLeagueService(o: {
  readonly pool: QueryPool;
  readonly now: () => number;
}): HouseLeagueService {
  let state:
    | Promise<{ leagues: Map<number, HouseLeague>; votes: Map<number, Map<number, number>> }>
    | undefined;
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
      for (const vote of votes) {
        const map = tallies.get(vote.leagueId) ?? new Map<number, number>();
        map.set(leagueHouseNum(vote.voterKey), leagueHouseNum(vote.candidateKey));
        tallies.set(vote.leagueId, map);
      }
      return { leagues: out, votes: tallies };
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
        if (input.action === "leave") {
          const r = leaveHouseLeague(league, me);
          if (!r.ok) return r;
          if (r.league) {
            await deleteMember(o.pool, leagueId, leagueHouseKey(me));
            s.leagues.set(leagueId, r.league);
            s.votes.get(leagueId)?.delete(me);
          } else {
            await endLeague(o.pool, leagueId, o.now());
            s.leagues.delete(leagueId);
            s.votes.delete(leagueId);
          }
          return { ok: true, leagueId };
        }
        const target = input.house;
        if (target === undefined || !isHouseKey(target)) return { ok: false, code: "invalid_house" };
        const to = leagueHouseNum(target);
        if (input.action === "delegate") {
          const r = delegateHouseLeague(league, me, to);
          if (!r.ok || !r.league) return r.ok ? { ok: false, code: "unknown_league" } : r;
          await setRepresentative(o.pool, leagueId, target);
          s.leagues.set(leagueId, r.league);
          s.votes.delete(leagueId);
          return { ok: true, leagueId };
        }
        const r = voteHouseLeague(league, s.votes.get(leagueId) ?? new Map(), me, to);
        if (!r.ok) return r;
        if (r.elected !== null) {
          await setRepresentative(o.pool, leagueId, leagueHouseKey(r.elected));
          s.leagues.set(leagueId, electHouseLeague(league, r.elected));
        } else if (r.votes.size === 0) await clearVotes(o.pool, leagueId);
        else await upsertVote(o.pool, leagueId, leagueHouseKey(me), target, o.now());
        s.votes.set(leagueId, new Map(r.votes));
        return { ok: true, leagueId };
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
    npcSweep: (houses, rules) =>
      serial(async () => {
        const s = await load();
        const inLeague = new Set<number>();
        for (const league of s.leagues.values()) for (const member of league.members) inLeague.add(member);
        let acted = 0;
        for (const house of houses.toSorted((a, b) => a.houseId - b.houseId)) {
          const num = -house.houseId;
          if (house.houseId <= 0 || inLeague.has(num)) continue;
          const choice = npcLeagueChoice(
            house.traits,
            [...s.leagues.values()].map((league) => ({ id: league.id, members: league.members.length })),
            rules,
          );
          if (!choice) continue;
          const r = choice.kind === "found" ? await found(num) : await join(choice.leagueId, num);
          if (r.ok) {
            inLeague.add(num);
            acted += 1;
          }
        }
        return acted;
      }),
  };
}
