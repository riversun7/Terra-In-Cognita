// 국가·도시 블랙리스트(ADR 2026-11-25-house-city-approval-and-blacklist.md):
// - 시장(도시 주인 가문장) 또는 국가 원수(지배 가문장)가 악의적 유저를 나라 블랙리스트에 올리고 내린다.
// - 메모리 표(BlacklistTable)와 원장 WeakMap 고리(blacklistCheckOf / blacklistTableOf)를 통해:
//   1) 같은 나라 공격 신용 벌점(credit/hooks.ts same_nation_attack)을 면제한다(무패널티 PVP 명분).
//   2) 전투 승리 시 블랙리스트 유저를 격파하면 현상금(등록한 도시의 국고 → 승자 지갑, 한 번만)과 국가 명성·가문 기여도를
//      준다(blacklistReward.ts).
// - 현상금 제한(사용자 결정 2026-11-25, ADR 2026-11-25-blacklist-bounty-limits.md): 현상금은 그 도시를 가진 가문의 가문장(시장)만
//   자기 도시 국고에서 걸고(남의 도시·나라 국고로는 걸지 못한다 — not_ruler), 한 건은 설정 칸 house_blacklist_bounty_max로 줄여
//   적으며, 한 번 주면 0이 된다.
// - 도시 상한·의결(사용자 결정 2026-11-25 "정책에서 투표없이 상한 정하고 그 이상은 투표안건", ADR 2026-11-25-blacklist-bounty-vote.md):
//   도시 정책(city_policies.bounty_max)이 그 도시에서 투표 없이 걸 수 있는 한 건 상한을 정한다(설정 칸보다 클 수 없다). 그보다 큰
//   현상금은 나라 의결 안건(blacklist_bounty — governance/service.ts)으로 올리고, 가결되면 createBountyAgenda.apply가 그 금액으로
//   올린다(bounty_agenda_id가 있어 상한으로 자르지 않는다). 다시 등록에 쉬는 시간은 없다.
//   3) 가문 도시 가입 신청·승인 시 가문원 중 블랙리스트 유저가 있으면 차단한다(houseCityJoin.ts).
import type { GovernmentBlacklistRow } from "@terra/shared/government";
import { hasUnstorableText } from "@terra/shared";
import { writeAudit } from "../auth/store.ts";
import { creditBookOf } from "../credit/book.ts";
import type { Database } from "../db/client.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import { cityHome } from "./houseHome.ts";
import { electedNationOf, ruledBy } from "./houseEntryPolicy.ts";
import { type HouseMemberResult, type HouseTxPool, inTransaction, membershipOf } from "./members.ts";
import type { IdentityQueryable } from "./store.ts";

/** 기본 블랙리스트 사냥 명성·기여도 보상 */
export const DEFAULT_BLACKLIST_RENOWN_REWARD = 10;

/** 블랙리스트 항목(메모리 캐시) */
export interface BlacklistEntry {
  readonly id: number;
  readonly nationId: number;
  readonly cityId: number | null;
  /** 등록한 도시를 가진 세력(행 ID — 현상금이 나가는 국고). 도시가 없어졌으면 null(현상금 없음) */
  readonly cityFactionId: number | null;
  readonly userId: string;
  /** 등록한 사람(자기가 건 현상금은 받지 못한다) */
  readonly createdBy: string | null;
  readonly reason: string | null;
  /** 남은 현상금(한 번 주면 0 — claimBounty) */
  readonly bounty: bigint;
  /** 나라 의결로 승인된 현상금인가(줄 때 상한으로 자르지 않는다) */
  readonly byVote: boolean;
  readonly renownReward: number;
  readonly createdAtMs: number;
}

/** 치는 주인 · 대상 주인 → 대상이 공격자 나라의 블랙리스트(무패널티 PVP 대상)인가 */
export type BlacklistCheck = (attackerOwner: number, targetOwner: number) => boolean;

/** 원장에 붙는 블랙리스트 메모리 표 */
export interface BlacklistTable {
  /** 그 나라의 블랙리스트에 올라 있나 */
  isBlacklisted(nationId: number, userId: string): boolean;
  /** 그 유저가 올라 있는 모든 나라의 블랙리스트 항목(전투 보상 지급용) */
  entriesForUser(userId: string): readonly BlacklistEntry[];
  /** 현상금을 줬다: 그 항목의 현상금을 0으로(메모리 바로, DB는 뒤에서 — 다시 주지 않는다) */
  claimBounty(entryId: number): void;
  /** DB에서 다시 읽는다 */
  reload(): Promise<void>;
}

const checks = new WeakMap<object, BlacklistCheck>();
const tables = new WeakMap<object, BlacklistTable>();

/** 원장에 붙은 블랙리스트 PVP 면제 고리(없으면 undefined) */
export const blacklistCheckOf = (ledger: object): BlacklistCheck | undefined => checks.get(ledger);

/** 원장에 블랙리스트 PVP 면제 고리를 붙인다(시험·attachBlacklist) */
export function setBlacklistCheck(ledger: object, check: BlacklistCheck): void {
  checks.set(ledger, check);
}

/** 원장에 붙은 블랙리스트 메모리 표(없으면 undefined) */
export const blacklistTableOf = (ledger: object): BlacklistTable | undefined => tables.get(ledger);

/** 원장에 블랙리스트 메모리 표와 PVP 면제 고리를 붙인다(이미 있으면 그대로 돌려준다) */
export function attachBlacklist(parts: {
  readonly pool: QueryPool;
  readonly ledger: object;
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "userId" | "factionId">>;
  readonly log?: { error(obj: object, message: string): void } | undefined;
}): BlacklistTable {
  const existing = tables.get(parts.ledger);
  if (existing) return existing;
  let byUser = new Map<string, BlacklistEntry[]>();
  // 이미 준 항목(다시 읽기가 DB 갱신보다 먼저 와도 다시 주지 않는다 — 등록을 새로 하면 created_at_ms가 달라져 풀린다)
  const claimed = new Map<number, number>();
  const table: BlacklistTable = {
    isBlacklisted(nationId, userId) {
      const list = byUser.get(userId);
      return list ? list.some((entry) => entry.nationId === nationId) : false;
    },
    entriesForUser(userId) {
      return byUser.get(userId) ?? [];
    },
    claimBounty(entryId) {
      for (const [userId, list] of byUser) {
        const at = list.findIndex((entry) => entry.id === entryId);
        const entry = list[at];
        if (!entry) continue;
        claimed.set(entryId, entry.createdAtMs);
        byUser.set(
          userId,
          list.map((each, index) => (index === at ? { ...each, bounty: 0n } : each)),
        );
        // 같은 등록(created_at_ms)일 때만 0으로 — 그 사이 새로 등록한 현상금은 건드리지 않는다
        void parts.pool
          .query("update nation_blacklist set bounty = 0 where id = $1 and created_at_ms = $2", [
            entryId,
            entry.createdAtMs,
          ])
          .catch((error: unknown) =>
            parts.log?.error({ err: error }, "blacklist bounty claim update failed"),
          );
        return;
      }
    },
    async reload() {
      const { rows } = await parts.pool.query(
        `select b.id, b.nation_id, b.city_id, c.faction_id as city_faction_id, b.user_id, b.created_by, b.reason,
                b.bounty::text as bounty, b.renown_reward, b.created_at_ms, b.bounty_agenda_id
           from nation_blacklist b left join world_cities c on c.id = b.city_id
          order by b.nation_id, b.id`,
      );
      const next = new Map<string, BlacklistEntry[]>();
      for (const row of rows) {
        const userId = String(row.user_id);
        const id = Number(row.id);
        const createdAtMs = Number(row.created_at_ms);
        const paid = claimed.get(id) === createdAtMs;
        if (!paid) claimed.delete(id);
        const entry: BlacklistEntry = {
          id,
          nationId: Number(row.nation_id),
          cityId: row.city_id === null || row.city_id === undefined ? null : Number(row.city_id),
          cityFactionId:
            row.city_faction_id === null || row.city_faction_id === undefined
              ? null
              : Number(row.city_faction_id),
          userId,
          createdBy: typeof row.created_by === "string" ? row.created_by : null,
          reason: typeof row.reason === "string" ? row.reason : null,
          bounty:
            !paid &&
            (typeof row.bounty === "string" ||
              typeof row.bounty === "number" ||
              typeof row.bounty === "bigint")
              ? BigInt(row.bounty)
              : 0n,
          byVote: row.bounty_agenda_id !== null && row.bounty_agenda_id !== undefined,
          renownReward: Number(row.renown_reward ?? DEFAULT_BLACKLIST_RENOWN_REWARD),
          createdAtMs,
        };
        const list = next.get(userId);
        if (list) list.push(entry);
        else next.set(userId, [entry]);
      }
      byUser = next;
    },
  };
  tables.set(parts.ledger, table);
  // 같은 나라 공격 신용 벌점 면제: 대상이 공격자 나라(신용 장부 소속 나라)의 블랙리스트 유저면 PVP 명분 인정
  checks.set(parts.ledger, (attackerOwner, targetOwner) => {
    const targetUser = parts.owners.get(targetOwner)?.userId;
    if (!targetUser) return false;
    // 신용 장부의 나라는 국고 주인 ID(credit/standing.ts creditBelongs)이고 블랙리스트 표의 나라는 세력 행 ID라, 국고 주인의
    // 세력 행으로 바꿔서 본다
    const nationOwner = creditBookOf(parts.ledger)?.standingOf(attackerOwner)?.nationId;
    const nation = nationOwner === undefined ? undefined : parts.owners.get(nationOwner)?.factionId;
    if (nation === undefined || nation === null) return false;
    return table.isBlacklisted(nation, targetUser);
  });
  return table;
}

/** 나라 블랙리스트 목록(정부 판 공개 표시용) */
export async function listNationBlacklist(
  q: IdentityQueryable,
  nationId: number,
): Promise<GovernmentBlacklistRow[]> {
  const { rows } = await q.query<{
    id: string;
    user_id: string;
    cyborg_name: string | null;
    reason: string | null;
    bounty: string;
    renown_reward: number;
    created_at_ms: string;
    bounty_agenda_id: string | null;
  }>(
    `select b.id, b.user_id, c.name as cyborg_name, b.reason, b.bounty::text as bounty,
            b.renown_reward, b.created_at_ms, b.bounty_agenda_id
       from nation_blacklist b
       left join cyborgs c on c.user_id = b.user_id
      where b.nation_id = $1
      order by b.created_at_ms desc, b.id desc
      limit 100`,
    [nationId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    userId: row.user_id,
    cyborgName: row.cyborg_name,
    reason: row.reason,
    bounty: row.bounty,
    renownReward: row.renown_reward,
    createdAtMs: Number(row.created_at_ms),
    ...(row.bounty_agenda_id === null ? {} : { byVote: true }),
  }));
}

/** 그 도시에서 투표 없이 걸 수 있는 현상금 한 건 상한: 도시 정책 값(없으면 설정 칸), 설정 칸보다 클 수 없다 */
export function effectiveBountyMax(cap: bigint, own: bigint | null): bigint {
  const max = cap > 0n ? cap : 0n;
  if (own === null) return max;
  return own < 0n ? 0n : own < max ? own : max;
}

/** 도시 정책에 저장한 현상금 상한(없으면 null) */
export async function readCityBountyMax(q: IdentityQueryable, cityId: number): Promise<bigint | null> {
  const { rows } = await q.query<{ bounty_max: string | null }>(
    "select bounty_max::text as bounty_max from city_policies where city_id = $1",
    [cityId],
  );
  const raw = rows[0]?.bounty_max;
  return raw === null || raw === undefined ? null : BigInt(raw);
}

export interface NationBlacklistRequest {
  readonly action: "add" | "remove";
  readonly cityId: number;
  readonly targetName?: string | undefined;
  readonly targetUserId?: string | undefined;
  readonly bounty?: string | undefined;
  readonly reason?: string | undefined;
}

export interface NationBlacklistService {
  handle(actorId: string, request: NationBlacklistRequest): Promise<HouseMemberResult>;
}

const fail = (code: Extract<HouseMemberResult, { ok: false }>["code"]): HouseMemberResult => ({
  ok: false,
  code,
});

/** 도시 주인 가문장(시장) 또는 그 도시 나라의 지도자(독립 나라·선출 지배 가문장)인가 */
export async function isCityOrNationRuler(
  q: IdentityQueryable,
  houseId: number,
  cityId: number,
  nationId: number,
): Promise<boolean> {
  const ruled = await ruledBy(q, houseId);
  if (ruled.cities.has(cityId)) return true;
  if (ruled.nation && houseId === nationId) return true;
  const elected = await electedNationOf(q, houseId);
  return elected === nationId;
}

/** 대상 사용자 ID를 찾는다(targetUserId 우선, 없으면 사이보그 이름으로 조회) */
async function resolveTargetUser(
  q: IdentityQueryable,
  input: { readonly targetUserId?: string | undefined; readonly targetName?: string | undefined },
): Promise<string | null> {
  if (input.targetUserId) {
    const { rows } = await q.query<{ user_id: string }>(
      "select user_id from cyborgs where user_id = $1 limit 1",
      [input.targetUserId],
    );
    return rows[0]?.user_id ?? null;
  }
  const trimmed = input.targetName?.trim() ?? "";
  if (trimmed.length === 0) return null;
  const { rows } = await q.query<{ user_id: string }>(
    "select user_id from cyborgs where lower(name) = lower($1) limit 1",
    [trimmed],
  );
  return rows[0]?.user_id ?? null;
}

export function createNationBlacklistService(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
  /** 현상금 한 건 상한(최소 단위 — 설정 칸 house_blacklist_bounty_max, 부를 때마다 읽는다). 없으면 현상금을 걸 수 없다(0) */
  readonly bountyMax?: (() => bigint) | undefined;
  readonly afterChange?: (() => Promise<void>) | undefined;
}): NationBlacklistService {
  return {
    async handle(actorId, request) {
      const reasonRaw = request.reason?.trim();
      if (reasonRaw && hasUnstorableText({ reason: reasonRaw })) return fail("not_found");
      const reason = reasonRaw && reasonRaw.length > 0 ? reasonRaw.slice(0, 200) : null;
      const asked = request.bounty !== undefined ? BigInt(request.bounty) : 0n;
      let audit: Record<string, unknown> | null = null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, actorId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const city = await cityHome(q, request.cityId);
        if (!city) return fail("unknown_city");
        if (!(await isCityOrNationRuler(q, mine.factionId, city.id, city.nationId))) return fail("not_ruler");
        const targetId = await resolveTargetUser(q, request);
        if (!targetId) return fail("not_found");
        if (request.action === "add") {
          if (targetId === actorId) return fail("self");
          // 현상금은 그 도시를 가진 가문의 가문장만 자기 도시 국고에서 건다(나라 지도자가 남의 도시·나라 국고로 걸지 못한다),
          // 한 건은 상한으로 줄여 적는다(사용자 결정 2026-11-25)
          if (asked > 0n && !(await ruledBy(q, mine.factionId)).cities.has(city.id)) return fail("not_ruler");
          // 도시 상한(도시 정책, 없으면 설정 칸)을 넘는 값은 줄여 적는다 — 더 큰 현상금은 나라 의결 안건으로 올린다
          const max = effectiveBountyMax(o.bountyMax?.() ?? 0n, await readCityBountyMax(q, city.id));
          const bounty = asked > max ? max : asked;
          const now = o.now();
          await q.query(
            `insert into nation_blacklist
               (nation_id, city_id, user_id, reason, bounty, renown_reward, created_by, created_at_ms)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             on conflict (nation_id, user_id) do update
               set city_id = excluded.city_id,
                   reason = excluded.reason,
                   bounty = excluded.bounty,
                   renown_reward = excluded.renown_reward,
                   created_by = excluded.created_by,
                   created_at_ms = excluded.created_at_ms,
                   bounty_agenda_id = null`,
            [
              city.nationId,
              city.id,
              targetId,
              reason,
              bounty.toString(),
              DEFAULT_BLACKLIST_RENOWN_REWARD,
              actorId,
              now,
            ],
          );
          audit = {
            action: "add",
            nationId: city.nationId,
            cityId: city.id,
            targetUserId: targetId,
            bounty: bounty.toString(),
            reason,
          };
          return { ok: true, action: "blacklist_added", factionId: mine.factionId };
        }
        const removed = await q.query<{ id: string }>(
          "delete from nation_blacklist where nation_id = $1 and user_id = $2 returning id",
          [city.nationId, targetId],
        );
        if (removed.rows.length === 0) return fail("not_found");
        audit = {
          action: "remove",
          nationId: city.nationId,
          cityId: city.id,
          targetUserId: targetId,
        };
        return { ok: true, action: "blacklist_removed", factionId: mine.factionId };
      });
      if (result.ok) await o.afterChange?.();
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: actorId, ip: null },
          action: "faction.nation_blacklist",
          targetId: actorId,
          before: null,
          after: audit,
        });
      }
      return result;
    },
  };
}

/** 현상금 승인 안건의 내용(나라 의결 안건 payload에 들어간다) */
export interface BountyAgendaTerms {
  readonly cityId: number;
  readonly bountyUserId: string;
  /** 현상금(최소 단위 10진 글자, 1 이상) */
  readonly bounty: string;
  readonly bountyReason?: string;
}

/** 나라 의결의 현상금 안건 고리(governance/service.ts가 부른다 — ADR 2026-11-25-blacklist-bounty-vote.md) */
export interface BountyAgendaPort {
  /**
   * 안건을 올릴 수 있나: 그 도시가 그 나라 도시이고, 올리는 사람이 그 도시에 블랙리스트를 올릴 수 있는 가문장(시장·나라 지도자)이며,
   * 대상이 있는 사용자(자기 자신 아님)이고 금액이 1 이상이어야 한다. 틀리면 결과 코드
   */
  check(input: {
    readonly nationId: number;
    readonly proposerId: string;
    readonly cityId?: number | undefined;
    /** 대상 사이보그 이름(블랙리스트 등록과 같은 찾기) */
    readonly targetName?: string | undefined;
    readonly bounty?: string | undefined;
    readonly reason?: string | undefined;
  }): Promise<BountyAgendaTerms | "unknown_target" | "invalid_choice" | "not_eligible">;
  /** 가결된 현상금을 블랙리스트에 올린다(그 금액 그대로 — 상한으로 자르지 않는다). 도시·대상이 사라졌으면 false */
  apply(input: {
    readonly nationId: number;
    readonly agendaId: number;
    readonly proposerId: string | null;
    readonly terms: BountyAgendaTerms;
    readonly nowMs: number;
  }): Promise<boolean>;
}

export function createBountyAgenda(o: {
  readonly pool: HouseTxPool;
  readonly afterChange?: (() => Promise<void>) | undefined;
}): BountyAgendaPort {
  return {
    async check(input) {
      if (input.cityId === undefined || input.targetName === undefined || input.bounty === undefined)
        return "invalid_choice";
      if (!/^[1-9][0-9]{0,17}$/.test(input.bounty)) return "invalid_choice";
      const reason = input.reason?.trim() ?? "";
      if (reason.length > 0 && hasUnstorableText({ reason })) return "invalid_choice";
      const cityId = input.cityId;
      const targetName = input.targetName;
      return inTransaction(o.pool, async (q) => {
        const city = await cityHome(q, cityId);
        if (!city || city.nationId !== input.nationId) return "unknown_target";
        const mine = await membershipOf(q, input.proposerId);
        if (!mine || mine.role !== "leader") return "not_eligible";
        if (!(await isCityOrNationRuler(q, mine.factionId, city.id, city.nationId))) return "not_eligible";
        const target = await resolveTargetUser(q, { targetName });
        if (!target || target === input.proposerId) return "unknown_target";
        return {
          cityId: city.id,
          bountyUserId: target,
          bounty: input.bounty ?? "0",
          ...(reason.length > 0 ? { bountyReason: reason.slice(0, 200) } : {}),
        };
      });
    },
    async apply(input) {
      const done = await inTransaction(o.pool, async (q) => {
        const city = await cityHome(q, input.terms.cityId);
        if (!city || city.nationId !== input.nationId) return false;
        const target = await resolveTargetUser(q, { targetUserId: input.terms.bountyUserId });
        if (!target) return false;
        await q.query(
          `insert into nation_blacklist
             (nation_id, city_id, user_id, reason, bounty, renown_reward, created_by, created_at_ms, bounty_agenda_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (nation_id, user_id) do update
             set city_id = excluded.city_id,
                 reason = coalesce(excluded.reason, nation_blacklist.reason),
                 bounty = excluded.bounty,
                 created_by = excluded.created_by,
                 created_at_ms = excluded.created_at_ms,
                 bounty_agenda_id = excluded.bounty_agenda_id`,
          [
            city.nationId,
            city.id,
            target,
            input.terms.bountyReason ?? null,
            input.terms.bounty,
            DEFAULT_BLACKLIST_RENOWN_REWARD,
            input.proposerId,
            input.nowMs,
            input.agendaId,
          ],
        );
        return true;
      });
      if (done) await o.afterChange?.();
      return done;
    },
  };
}
