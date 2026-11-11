// 귀화 때 가문 나라 맞추기 — 질문 983 가(기획 정리 D-216 포인터: 가문은 창설자를 따라 새 나라로 옮긴다). docs/adr/2026-11-11-faction-identity.md
// "바뀜 (2026-11-11, 981~986 답)".
// - 가문장이 귀화하면 가문 나라(factions.born_of)가 가문장의 새 나라로 바뀐다. 가문원은 그 가문 나라의 시민이어야 하므로(D-216 "가문원은
//   소속 NPC 국가의 시민으로 남는다") 옛 나라 시민인 가문원은 가문에서 빠지고 소식(nation_left)을 받는다 [임시 — 기획 글이 정하지 않아
//   기술 기본안, 질문 1001]. 가문장은 빠진 수를 소식(house_moved)으로 받는다. 대기 중인 초대·신청은 옛 나라 기준이라 모두 지운다.
// - 가문원이 귀화하면 그 사람만 가문에서 빠진다(nation_left, 가문장에게 member_left).
// - 나라가 같으면 아무것도 하지 않는다(여러 번 불러도 같다). 그래서 서버를 켤 때 모든 가문원에게 한 번 돌려 귀화 직후 서버가 꺼져 놓친 것을
//   맞춘다(attach.ts).
// - 같은 나라 시야 공유(D-250, world/nationVision.ts)는 사이보그 시민권을 보므로 이 처리와 상관없이 맞다. 가문은 소유 주체가 없어 시야 묶음에
//   들지 않는다. 그래서 이 처리 뒤에도 "가문원 = 그 나라 시민"이 지켜져 가문원끼리는 늘 같은 나라 시야를 본다.
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import {
  type HouseTxPool,
  cyborgNameOf,
  inTransaction,
  leaderOf,
  lockHouse,
  membershipOf,
  notify,
} from "./members.ts";

export interface HouseFollowOptions {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
  readonly nationOf: (userId: string) => number | undefined | Promise<number | undefined>;
}

export interface HouseFollowResult {
  /** 가문이 새 나라로 옮겼으면 그 나라 */
  readonly movedTo: number | null;
  /** 가문에서 빠진 사용자(가문장이 옮겨 빠진 가문원, 또는 귀화한 가문원 자신) */
  readonly removed: readonly string[];
}

const NONE: HouseFollowResult = { movedTo: null, removed: [] };

/** 사용자 한 명의 가문 나라를 맞춘다(귀화 뒤에 부른다) */
export async function followNation(o: HouseFollowOptions, userId: string): Promise<HouseFollowResult> {
  const nation = await o.nationOf(userId);
  if (nation === undefined) return NONE;
  const now = o.now();
  const audit: { action: string; before: object; after: object }[] = [];
  const result = await inTransaction(o.pool, async (q): Promise<HouseFollowResult> => {
    // 다른 나라 가문에 걸어 둔 요청(받은 초대·보낸 신청)은 쓸모가 없다
    await q.query(
      `delete from house_requests r using factions f
        where r.user_id = $1 and f.id = r.faction_id and f.born_of is distinct from $2::bigint`,
      [userId, nation],
    );
    const mine = await membershipOf(q, userId);
    if (!mine) return NONE;
    const house = await lockHouse(q, mine.factionId);
    if (!house || house.nation === nation) return NONE;
    if (mine.role === "member") {
      await q.query("delete from house_members where user_id = $1 and faction_id = $2", [userId, house.id]);
      await notify(q, {
        userId,
        factionId: house.id,
        kind: "nation_left",
        houseName: house.name,
        nowMs: now,
      });
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
      audit.push({
        action: "faction.house_leave",
        before: { factionId: house.id, nationId: house.nation },
        after: { factionId: null, nationId: nation, reason: "nationality_change" },
      });
      return { movedTo: null, removed: [userId] };
    }
    // 가문장: 가문이 따라간다
    await q.query("update factions set born_of = $2 where id = $1", [house.id, nation]);
    await q.query("delete from house_requests where faction_id = $1", [house.id]);
    const { rows } = await q.query<{ user_id: string }>(
      "select user_id from house_members where faction_id = $1 and role = 'member' order by joined_at_ms, user_id",
      [house.id],
    );
    const removed: string[] = [];
    for (const row of rows) {
      if ((await o.nationOf(row.user_id)) === nation) continue;
      await q.query("delete from house_members where user_id = $1 and faction_id = $2", [
        row.user_id,
        house.id,
      ]);
      await notify(q, {
        userId: row.user_id,
        factionId: house.id,
        kind: "nation_left",
        houseName: house.name,
        nowMs: now,
      });
      removed.push(row.user_id);
    }
    await notify(q, {
      userId,
      factionId: house.id,
      kind: "house_moved",
      houseName: house.name,
      count: removed.length,
      nowMs: now,
    });
    audit.push({
      action: "faction.house_follow",
      before: { factionId: house.id, nationId: house.nation },
      after: { factionId: house.id, nationId: nation, removed },
    });
    return { movedTo: nation, removed };
  });
  if (o.db)
    for (const entry of audit)
      await writeAudit(o.db, {
        actor: { kind: "user", id: userId, ip: null },
        action: entry.action,
        targetId: userId,
        before: entry.before,
        after: entry.after,
      });
  return result;
}

/** 서버를 켤 때: 모든 가문원의 나라를 맞춘다(가문장 먼저 — 가문이 옮긴 뒤 가문원을 본다). 바뀐 가문원 수 */
export async function followAllHouses(o: HouseFollowOptions): Promise<number> {
  const { rows } = await o.pool.query<{ user_id: string }>(
    "select user_id from house_members order by role = 'leader' desc, faction_id, joined_at_ms, user_id",
  );
  let changed = 0;
  for (const row of rows) {
    const result = await followNation(o, row.user_id);
    if (result.movedTo !== null || result.removed.length > 0) changed += 1;
  }
  return changed;
}
