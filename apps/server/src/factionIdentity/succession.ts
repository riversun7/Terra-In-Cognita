// 가문장 넘기기·해산(WebSocket house_handover·house_dissolve, 프로토콜 24) — 질문 1003 가(기획 정리 D-216 포인터: 넘기기 + 혼자 남은
// 가문장의 해산). docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 1001~1006 답)".
// - 넘기기: 가문장이 가문원 한 명을 고르면 바로 넘어간다(받는 사람의 동의는 기획에 없다 — [임시] 바로 넘기고 소식, 질문 1036). 가문 정체성 줄
//   (faction_identities — 열쇠가 아직 계정 user_id다)도 새 가문장에게 옮긴다: 정체성을 고칠 수 있는 사람 = 가문장. 새 가문장이 따로 저장해 둔
//   창설 전 초안은 지운다(계정마다 정체성 줄 하나 — 가문원은 창설할 수 없어 쓸 데가 없다, [임시]). 마크 내린 횟수·올리기 막힘·이름 되돌린 횟수는
//   가문 줄을 따라간다(가문의 이력이라 — 넘겨서 풀리지 않게).
// - 해산: 혼자 남은 가문장만(not_alone). 도시를 가진 가문(소유 주체가 있는 가문 — 국고·도시·지분)은 해산하지 못한다(has_city, [임시] 질문 1037).
//   세력 행에 dissolved_at_ms, 가문원·요청·신고 줄을 지우고 세력 정체성(faction_profiles)을 지워 이름·약어를 푼다. 정체성 줄은 남겨 초안으로
//   돌린다(가문을 떼고 이름·약어를 "가문 #ID"·자리 약어로 — 고유 제약에서 이름·약어를 푼다, 색·마크·이력은 남는다 — 다시 창설할 때 이름만
//   새로 정한다). 소식은 남긴다(가문 칸은 set null이 아니라 그대로 — 세력 행은 지우지 않는다).
// - 한 명령 = 한 트랜잭션(가문 세력 행 잠금). 감사 기록은 커밋 뒤: faction.house_handover·faction.house_dissolve.
import { houseResetName, houseResetShort } from "@terra/shared/house";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { RENAME_FREE } from "./house.ts";
import {
  type HouseMemberResult,
  type HouseTxPool,
  cyborgNameOf,
  inTransaction,
  lockHouse,
  membershipOf,
  notify,
} from "./members.ts";
import type { IdentityQueryable } from "./store.ts";

export interface HouseSuccession {
  handover(leaderId: string, targetId: string): Promise<HouseMemberResult>;
  dissolve(leaderId: string): Promise<HouseMemberResult>;
}

/** 빈칸을 빼고 소문자로(정체성 이름 열쇠 — services.ts squash와 같다) */
const squash = (text: string): string => text.replaceAll(/\s+/gu, "").toLowerCase();

/** 해산한 가문의 정체성 줄에 둘 약어: "H<36진수>"부터 앞 글자를 바꿔 가며 아무도 쓰지 않는 것(2~5자) */
async function freeShortOf(q: IdentityQueryable, factionId: number): Promise<string> {
  const base = houseResetShort(factionId).slice(1);
  for (const head of ["H", "X", "Z", "Q", "J", "V"]) {
    const short = `${head}${base}`.slice(0, 5);
    const { rows } = await q.query<{ taken: boolean }>(
      `select exists(select 1 from faction_identities where lower(short_name) = lower($1) and faction_id is distinct from $2)
           or exists(select 1 from faction_profiles where lower(short_name) = lower($1) and faction_id <> $2) as taken`,
      [short, factionId],
    );
    if (rows[0]?.taken !== true) return short;
  }
  // 모두 겹치면 숫자 꼬리(36^4 아래 가문 ID에서는 오지 않는다)
  return `H${String(factionId % 10_000)}`.slice(0, 5);
}

export function createHouseSuccession(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
}): HouseSuccession {
  const audit = async (actor: string, action: string, after: Record<string, unknown>): Promise<void> => {
    if (o.db)
      await writeAudit(o.db, {
        actor: { kind: "user", id: actor, ip: null },
        action,
        targetId: actor,
        before: null,
        after,
      });
  };

  return {
    async handover(leaderId, targetId) {
      if (leaderId === targetId) return { ok: false, code: "self" };
      const now = o.now();
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, leaderId);
        if (mine?.role !== "leader") return { ok: false, code: "not_leader" };
        const house = await lockHouse(q, mine.factionId);
        if (!house) return { ok: false, code: "not_found" };
        const target = await membershipOf(q, targetId);
        if (target?.factionId !== house.id) return { ok: false, code: "not_found" };
        await q.query("update house_members set role = 'member' where user_id = $1 and faction_id = $2", [
          leaderId,
          house.id,
        ]);
        await q.query("update house_members set role = 'leader' where user_id = $1 and faction_id = $2", [
          targetId,
          house.id,
        ]);
        // 가문 정체성 줄을 새 가문장에게(그 사람의 창설 전 초안은 지운다 — 계정마다 한 줄)
        await q.query("delete from faction_identities where user_id = $1 and faction_id is null", [targetId]);
        await q.query(
          "update faction_identities set user_id = $1, updated_at_ms = $3 where faction_id = $2",
          [targetId, house.id, now],
        );
        const oldName = await cyborgNameOf(q, leaderId);
        const newName = await cyborgNameOf(q, targetId);
        await notify(q, {
          userId: targetId,
          factionId: house.id,
          kind: "leader_given",
          houseName: house.name,
          other: oldName,
          nowMs: now,
        });
        const { rows } = await q.query<{ user_id: string }>(
          "select user_id from house_members where faction_id = $1 and user_id <> $2 and user_id <> $3",
          [house.id, leaderId, targetId],
        );
        for (const row of rows)
          await notify(q, {
            userId: row.user_id,
            factionId: house.id,
            kind: "leader_changed",
            houseName: house.name,
            other: newName,
            nowMs: now,
          });
        return { ok: true, action: "handed_over", factionId: house.id };
      });
      if (result.ok)
        await audit(leaderId, "faction.house_handover", { factionId: result.factionId, to: targetId });
      return result;
    },

    async dissolve(leaderId) {
      const now = o.now();
      let before: { name: string; shortName: string } | null = null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, leaderId);
        if (!mine) return { ok: false, code: "not_in_house" };
        if (mine.role !== "leader") return { ok: false, code: "not_leader" };
        const house = await lockHouse(q, mine.factionId);
        if (!house) return { ok: false, code: "not_found" };
        const { rows } = await q.query<{ members: number; owned: boolean }>(
          `select (select count(*)::int from house_members where faction_id = $1) as members,
                  exists(select 1 from world_owners where faction_id = $1) as owned`,
          [house.id],
        );
        if (rows[0]?.owned === true) return { ok: false, code: "has_city" };
        if ((rows[0]?.members ?? 0) > 1) return { ok: false, code: "not_alone" };
        const ident = await q.query<{ name: string; short_name: string }>(
          "select name, short_name from faction_identities where faction_id = $1 for update",
          [house.id],
        );
        before = ident.rows[0] ? { name: ident.rows[0].name, shortName: ident.rows[0].short_name } : null;
        // 이름·약어를 풀고(정체성 표 고유 제약) 초안으로 돌린다
        const placeholder = houseResetName(house.id);
        const short = await freeShortOf(q, house.id);
        await q.query(
          `update faction_identities set faction_id = null, founded_at_ms = null, name = $2, name_key = $3,
             short_name = $4, name_changed_at_ms = $5, updated_at_ms = $6 where faction_id = $1`,
          [house.id, placeholder, squash(placeholder), short, RENAME_FREE, now],
        );
        await q.query("delete from faction_profiles where faction_id = $1", [house.id]);
        await q.query("delete from house_requests where faction_id = $1", [house.id]);
        await q.query("delete from house_reports where faction_id = $1", [house.id]);
        await q.query("delete from house_members where faction_id = $1", [house.id]);
        await q.query("update factions set dissolved_at_ms = $2 where id = $1", [house.id, now]);
        return { ok: true, action: "dissolved", factionId: house.id };
      });
      if (result.ok) await audit(leaderId, "faction.house_dissolve", { factionId: result.factionId, before });
      return result;
    },
  };
}
