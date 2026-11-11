// 가문 가입(WebSocket house_invite·house_apply·house_answer·house_withdraw·house_leave·house_kick, 프로토콜 23) — 질문 985 다(기획 정리 D-216
// 포인터: 초대 + 신청, 같은 나라 시민만). docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)".
// - 같은 나라 시민만: 가문원은 그 가문 나라(factions.born_of)의 시민이다(D-216 "가문원은 소속 NPC 국가의 시민으로 남는다"). 그래서 같은 나라
//   시야 공유(D-250 — 사이보그 시민권을 본다)와 가문이 어긋나지 않는다. 나라가 달라지면 follow.ts가 가문에서 뺀다(983 가).
// - 초대와 신청이 맞으면(가문장이 이미 신청한 사람을 초대, 이미 초대받은 사람이 신청) 바로 든다.
// - 가문장은 나갈 수 없다(먼저 넘기거나 혼자면 해산한다 — succession.ts, 질문 1003 가). 가문원은 나가고, 가문장은 가문원을 내보낸다.
// - 상한은 설정 칸(rules.ts): 인원(가문장 포함)·가문마다 대기 수·사람마다 신청 수·요청 유효 시간. 지난 요청은 명령마다 지운다.
// - 한 명령 = 한 트랜잭션(그 가문 세력 행을 잠가 같은 가문의 명령을 차례로 한다). 서로 다른 가문이 같은 사람을 동시에 받으면 가문원 표의
//   사용자 열쇠(house_members PK)가 하나만 남긴다(already_in_house). 소식(house_notices)은 같은 트랜잭션, 감사 기록은 커밋 뒤.
import type { HouseMemberAction, HouseMemberResultCode } from "@terra/protocol";
import { parseCyborgName } from "@terra/shared/cyborg";
import type { HouseNoticeKind, HouseRequestKind, HouseRole } from "@terra/shared/house";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { HouseRules } from "./rules.ts";
import type { IdentityQueryable } from "./store.ts";

export type HouseMemberResult =
  | { readonly ok: true; readonly action: HouseMemberAction; readonly factionId: number }
  | { readonly ok: false; readonly code: HouseMemberResultCode };

/** 트랜잭션을 여는 풀(pg Pool과 같은 모양) */
export interface HouseTxPool extends IdentityQueryable {
  connect(): Promise<IdentityQueryable & { release(): void }>;
}

export interface HouseMemberOptions {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  /** 사용자의 나라(사이보그 시민권). 사이보그가 없으면 undefined */
  readonly nationOf: (userId: string) => number | undefined | Promise<number | undefined>;
}

export interface HouseMembers {
  invite(leaderId: string, name: string): Promise<HouseMemberResult>;
  apply(userId: string, factionId: number): Promise<HouseMemberResult>;
  answer(userId: string, requestId: number, accept: boolean): Promise<HouseMemberResult>;
  withdraw(userId: string, requestId: number): Promise<HouseMemberResult>;
  leave(userId: string): Promise<HouseMemberResult>;
  kick(leaderId: string, targetId: string): Promise<HouseMemberResult>;
}

interface AuditNote {
  readonly actor: string;
  readonly action: string;
  readonly target: string | null;
  readonly after: Record<string, unknown>;
}

const fail = (code: HouseMemberResultCode): HouseMemberResult => ({ ok: false, code });
const done = (action: HouseMemberAction, factionId: number): HouseMemberResult => ({
  ok: true,
  action,
  factionId,
});

/** 한 트랜잭션에서 fn을 돌린다(fn이 실패 결과를 돌려줘도 커밋한다 — 지난 요청 지우기만 남는다) */
export async function inTransaction<T>(
  pool: HouseTxPool,
  fn: (q: IdentityQueryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** 가문 세력 행을 잠그고 나라·이름을 읽는다(없거나 해산했으면 null) */
export async function lockHouse(
  q: IdentityQueryable,
  factionId: number,
): Promise<{ id: number; nation: number | null; name: string } | null> {
  const { rows } = await q.query<{ id: string; born_of: string | null; name: string | null }>(
    `select f.id, f.born_of, p.name from factions f left join faction_profiles p on p.faction_id = f.id
      where f.id = $1 and f.kind = 'player' and f.dissolved_at_ms is null for update of f`,
    [factionId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    nation: row.born_of === null ? null : Number(row.born_of),
    name: row.name ?? `#${row.id}`,
  };
}

export async function membershipOf(
  q: IdentityQueryable,
  userId: string,
): Promise<{ factionId: number; role: HouseRole } | null> {
  const { rows } = await q.query<{ faction_id: string; role: string }>(
    "select faction_id, role from house_members where user_id = $1",
    [userId],
  );
  const row = rows[0];
  return row
    ? { factionId: Number(row.faction_id), role: row.role === "leader" ? "leader" : "member" }
    : null;
}

export async function leaderOf(q: IdentityQueryable, factionId: number): Promise<string | null> {
  const { rows } = await q.query<{ user_id: string }>(
    "select user_id from house_members where faction_id = $1 and role = 'leader'",
    [factionId],
  );
  return rows[0]?.user_id ?? null;
}

export async function cyborgNameOf(q: IdentityQueryable, userId: string): Promise<string | null> {
  const { rows } = await q.query<{ name: string }>("select name from cyborgs where user_id = $1", [userId]);
  return rows[0]?.name ?? null;
}

/** 가문 소식 한 줄을 남긴다 */
export async function notify(
  q: IdentityQueryable,
  input: {
    readonly userId: string;
    readonly factionId: number | null;
    readonly kind: HouseNoticeKind;
    readonly houseName: string;
    readonly other?: string | null | undefined;
    readonly reason?: string | null | undefined;
    readonly count?: number | undefined;
    readonly nowMs: number;
  },
): Promise<void> {
  await q.query(
    `insert into house_notices (user_id, faction_id, kind, house_name, other_name, reason, count, created_at_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.userId,
      input.factionId,
      input.kind,
      input.houseName,
      input.other ?? null,
      input.reason ?? null,
      input.count ?? 0,
      input.nowMs,
    ],
  );
}

const countOf = async (q: IdentityQueryable, text: string, values: unknown[]): Promise<number> =>
  (await q.query<{ n: number }>(text, values)).rows[0]?.n ?? 0;

const memberCount = (q: IdentityQueryable, factionId: number): Promise<number> =>
  countOf(q, "select count(*)::int as n from house_members where faction_id = $1", [factionId]);

const pendingCount = (q: IdentityQueryable, factionId: number): Promise<number> =>
  countOf(q, "select count(*)::int as n from house_requests where faction_id = $1", [factionId]);

const applicationCount = (q: IdentityQueryable, userId: string): Promise<number> =>
  countOf(q, "select count(*)::int as n from house_requests where user_id = $1 and kind = 'apply'", [userId]);

interface RequestRow {
  readonly id: number;
  readonly factionId: number;
  readonly userId: string;
  readonly kind: HouseRequestKind;
}

async function requestBy(q: IdentityQueryable, where: string, values: unknown[]): Promise<RequestRow | null> {
  const { rows } = await q.query<{ id: string; faction_id: string; user_id: string; kind: string }>(
    `select id, faction_id, user_id, kind from house_requests where ${where}`,
    values,
  );
  const row = rows[0];
  return row
    ? {
        id: Number(row.id),
        factionId: Number(row.faction_id),
        userId: row.user_id,
        kind: row.kind === "invite" ? "invite" : "apply",
      }
    : null;
}

const isMemberKeyViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  Reflect.get(error, "code") === "23505" &&
  String(Reflect.get(error, "constraint") ?? "").startsWith("house_members");

/** 그 사람을 가문원으로 넣고 그 사람의 다른 요청(받은 초대·보낸 신청)을 모두 지운다 */
async function join(q: IdentityQueryable, userId: string, factionId: number, now: number): Promise<void> {
  await q.query(
    "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'member', $3)",
    [userId, factionId, now],
  );
  await q.query("delete from house_requests where user_id = $1", [userId]);
}

export function createHouseMembers(o: HouseMemberOptions): HouseMembers {
  /** 명령 하나: 지난 요청을 지우고 fn을 한 트랜잭션에서, 커밋 뒤 감사 기록 */
  const run = async (
    fn: (q: IdentityQueryable, now: number, audits: AuditNote[]) => Promise<HouseMemberResult>,
  ): Promise<HouseMemberResult> => {
    const now = o.now();
    const audits: AuditNote[] = [];
    let result: HouseMemberResult;
    try {
      result = await inTransaction(o.pool, async (q) => {
        await q.query("delete from house_requests where expires_at_ms <= $1", [now]);
        return fn(q, now, audits);
      });
    } catch (error) {
      // 다른 가문이 같은 사람을 먼저 받았다
      if (isMemberKeyViolation(error)) return fail("already_in_house");
      throw error;
    }
    if (o.db && result.ok)
      for (const note of audits)
        await writeAudit(o.db, {
          actor: { kind: "user", id: note.actor, ip: null },
          action: note.action,
          targetId: note.target,
          before: null,
          after: note.after,
        });
    return result;
  };

  const sameNation = async (userId: string, nation: number | null): Promise<boolean> => {
    const mine = await o.nationOf(userId);
    return mine !== undefined && nation !== null && mine === nation;
  };

  return {
    invite(leaderId, rawName) {
      return run(async (q, now, audits) => {
        const mine = await membershipOf(q, leaderId);
        if (mine?.role !== "leader") return fail("not_leader");
        const house = await lockHouse(q, mine.factionId);
        if (!house) return fail("not_found");
        const parsed = parseCyborgName(rawName);
        if (!parsed.ok) return fail("not_found");
        const { rows } = await q.query<{ user_id: string; name: string }>(
          "select user_id, name from cyborgs where name_key = $1",
          [parsed.key],
        );
        const target = rows[0];
        if (!target) return fail("not_found");
        if (target.user_id === leaderId) return fail("self");
        if (!(await sameNation(target.user_id, house.nation))) return fail("other_nation");
        if (await membershipOf(q, target.user_id)) return fail("already_in_house");
        const existing = await requestBy(q, "faction_id = $1 and user_id = $2", [house.id, target.user_id]);
        if (existing?.kind === "invite") return fail("already_requested");
        if ((await memberCount(q, house.id)) >= o.rules().memberMax) return fail("house_full");
        if (existing?.kind === "apply") {
          // 이미 신청한 사람을 초대 = 신청을 받는다
          await join(q, target.user_id, house.id, now);
          await notify(q, {
            userId: target.user_id,
            factionId: house.id,
            kind: "apply_accepted",
            houseName: house.name,
            nowMs: now,
          });
          audits.push({
            actor: leaderId,
            action: "faction.house_join",
            target: target.user_id,
            after: { factionId: house.id, via: "invite_matches_application" },
          });
          return done("joined", house.id);
        }
        if ((await pendingCount(q, house.id)) >= o.rules().pendingMax) return fail("too_many_pending");
        await q.query(
          `insert into house_requests (faction_id, user_id, kind, created_by, created_at_ms, expires_at_ms)
           values ($1, $2, 'invite', $3, $4, $5)`,
          [house.id, target.user_id, leaderId, now, now + o.rules().requestTtlMs],
        );
        audits.push({
          actor: leaderId,
          action: "faction.house_invite",
          target: target.user_id,
          after: { factionId: house.id, name: target.name },
        });
        return done("invited", house.id);
      });
    },

    async apply(userId, factionId) {
      const nation = await o.nationOf(userId);
      if (nation === undefined) return fail("no_cyborg");
      return run(async (q, now, audits) => {
        if (await membershipOf(q, userId)) return fail("already_in_house");
        const house = await lockHouse(q, factionId);
        if (!house) return fail("not_found");
        if (house.nation !== nation) return fail("other_nation");
        const existing = await requestBy(q, "faction_id = $1 and user_id = $2", [house.id, userId]);
        if (existing?.kind === "apply") return fail("already_requested");
        if ((await memberCount(q, house.id)) >= o.rules().memberMax) return fail("house_full");
        if (existing?.kind === "invite") {
          // 이미 초대받은 가문에 신청 = 초대를 받는다
          await join(q, userId, house.id, now);
          const leader = await leaderOf(q, house.id);
          if (leader)
            await notify(q, {
              userId: leader,
              factionId: house.id,
              kind: "invite_accepted",
              houseName: house.name,
              other: await cyborgNameOf(q, userId),
              nowMs: now,
            });
          audits.push({
            actor: userId,
            action: "faction.house_join",
            target: userId,
            after: { factionId: house.id, via: "application_matches_invite" },
          });
          return done("joined", house.id);
        }
        if ((await applicationCount(q, userId)) >= o.rules().applyMax) return fail("too_many_applications");
        if ((await pendingCount(q, house.id)) >= o.rules().pendingMax) return fail("too_many_pending");
        await q.query(
          `insert into house_requests (faction_id, user_id, kind, created_by, created_at_ms, expires_at_ms)
           values ($1, $2, 'apply', $2, $3, $4)`,
          [house.id, userId, now, now + o.rules().requestTtlMs],
        );
        audits.push({ actor: userId, action: "faction.house_apply", target: userId, after: { factionId } });
        return done("applied", house.id);
      });
    },

    answer(userId, requestId, accept) {
      return run(async (q, now, audits) => {
        const request = await requestBy(q, "id = $1", [requestId]);
        if (!request) return fail("not_found");
        const house = await lockHouse(q, request.factionId);
        if (!house) return fail("not_found");
        if (request.kind === "invite") {
          if (request.userId !== userId) return fail("not_found");
        } else {
          const mine = await membershipOf(q, userId);
          if (mine?.factionId !== request.factionId) return fail("not_found");
          if (mine.role !== "leader") return fail("not_leader");
        }
        const leader = await leaderOf(q, house.id);
        const targetName = await cyborgNameOf(q, request.userId);
        if (!accept) {
          await q.query("delete from house_requests where id = $1", [request.id]);
          if (request.kind === "invite" && leader)
            await notify(q, {
              userId: leader,
              factionId: house.id,
              kind: "invite_declined",
              houseName: house.name,
              other: targetName,
              nowMs: now,
            });
          if (request.kind === "apply")
            await notify(q, {
              userId: request.userId,
              factionId: house.id,
              kind: "apply_declined",
              houseName: house.name,
              nowMs: now,
            });
          audits.push({
            actor: userId,
            action: "faction.house_decline",
            target: request.userId,
            after: { factionId: house.id, kind: request.kind },
          });
          return done("declined", house.id);
        }
        // 받기: 그 사이 다른 가문에 들었거나 나라가 바뀌었으면 요청을 지우고 알린다
        if (await membershipOf(q, request.userId)) {
          await q.query("delete from house_requests where id = $1", [request.id]);
          return fail("already_in_house");
        }
        if (!(await sameNation(request.userId, house.nation))) {
          await q.query("delete from house_requests where id = $1", [request.id]);
          return fail("other_nation");
        }
        if ((await memberCount(q, house.id)) >= o.rules().memberMax) return fail("house_full");
        await join(q, request.userId, house.id, now);
        if (request.kind === "invite" && leader)
          await notify(q, {
            userId: leader,
            factionId: house.id,
            kind: "invite_accepted",
            houseName: house.name,
            other: targetName,
            nowMs: now,
          });
        if (request.kind === "apply")
          await notify(q, {
            userId: request.userId,
            factionId: house.id,
            kind: "apply_accepted",
            houseName: house.name,
            nowMs: now,
          });
        audits.push({
          actor: userId,
          action: "faction.house_join",
          target: request.userId,
          after: { factionId: house.id, via: request.kind },
        });
        return done("joined", house.id);
      });
    },

    withdraw(userId, requestId) {
      return run(async (q, _now, audits) => {
        const request = await requestBy(q, "id = $1", [requestId]);
        if (!request) return fail("not_found");
        if (request.kind === "apply") {
          if (request.userId !== userId) return fail("not_found");
        } else {
          const mine = await membershipOf(q, userId);
          if (mine?.factionId !== request.factionId) return fail("not_found");
          if (mine.role !== "leader") return fail("not_leader");
        }
        await q.query("delete from house_requests where id = $1", [request.id]);
        audits.push({
          actor: userId,
          action: "faction.house_withdraw",
          target: request.userId,
          after: { factionId: request.factionId, kind: request.kind },
        });
        return done("withdrawn", request.factionId);
      });
    },

    leave(userId) {
      return run(async (q, now, audits) => {
        const mine = await membershipOf(q, userId);
        if (!mine) return fail("not_in_house");
        if (mine.role === "leader") return fail("leader_cannot_leave");
        const house = await lockHouse(q, mine.factionId);
        if (!house) return fail("not_found");
        await q.query("delete from house_members where user_id = $1 and faction_id = $2", [userId, house.id]);
        const leader = await leaderOf(q, house.id);
        if (leader)
          await notify(q, {
            userId: leader,
            factionId: house.id,
            kind: "member_left",
            houseName: house.name,
            other: await cyborgNameOf(q, userId),
            nowMs: now,
          });
        audits.push({
          actor: userId,
          action: "faction.house_leave",
          target: userId,
          after: { factionId: house.id },
        });
        return done("left", house.id);
      });
    },

    kick(leaderId, targetId) {
      return run(async (q, now, audits) => {
        if (targetId === leaderId) return fail("self");
        const mine = await membershipOf(q, leaderId);
        if (mine?.role !== "leader") return fail("not_leader");
        const house = await lockHouse(q, mine.factionId);
        if (!house) return fail("not_found");
        const target = await membershipOf(q, targetId);
        if (target?.factionId !== house.id) return fail("not_found");
        await q.query("delete from house_members where user_id = $1 and faction_id = $2", [
          targetId,
          house.id,
        ]);
        await notify(q, {
          userId: targetId,
          factionId: house.id,
          kind: "kicked",
          houseName: house.name,
          nowMs: now,
        });
        audits.push({
          actor: leaderId,
          action: "faction.house_kick",
          target: targetId,
          after: { factionId: house.id },
        });
        return done("kicked", house.id);
      });
    },
  };
}
