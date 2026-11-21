// 가문 후계자 지정(WebSocket house_heir → house_member_result 한 일 heir_set) — 질문 2491, 사용자 결정 D-588 5 "국가 지도자 = 지배 가문의 가문장. 빈자리는 서열이나
// 미리 지정한 후계자로 자동 계승"(줄기 governance-6). 가문장이 가문원 한 명을 후계자로 정하거나(userId) 푼다(null). 표 house_heirs(가문마다 한 줄).
// 지배 가문의 가문장 자리가 비면 의결 서비스가 이 사람을 먼저 가문장으로 세운다(apps/server/src/governance/succession.ts — 그때도 가문원이어야 한다).
// 소식은 보내지 않는다 [임시]. 감사 기록 faction.house_heir(커밋 뒤).
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import {
  type HouseMemberResult,
  type HouseTxPool,
  inTransaction,
  lockHouse,
  membershipOf,
} from "./members.ts";

export interface HouseHeir {
  set(leaderId: string, targetId: string | null): Promise<HouseMemberResult>;
}

export function createHouseHeir(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
}): HouseHeir {
  return {
    async set(leaderId, targetId) {
      if (targetId === leaderId) return { ok: false, code: "self" };
      const now = o.now();
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, leaderId);
        if (!mine) return { ok: false, code: "not_in_house" };
        if (mine.role !== "leader") return { ok: false, code: "not_leader" };
        const house = await lockHouse(q, mine.factionId);
        if (!house) return { ok: false, code: "not_found" };
        if (targetId === null) {
          await q.query("delete from house_heirs where faction_id = $1", [house.id]);
          return { ok: true, action: "heir_set", factionId: house.id };
        }
        const target = await membershipOf(q, targetId);
        if (target?.factionId !== house.id) return { ok: false, code: "not_found" };
        await q.query(
          `insert into house_heirs (faction_id, user_id, designated_at_ms) values ($1, $2, $3)
           on conflict (faction_id) do update set user_id = excluded.user_id, designated_at_ms = excluded.designated_at_ms`,
          [house.id, targetId, now],
        );
        return { ok: true, action: "heir_set", factionId: house.id };
      });
      if (result.ok && o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: leaderId, ip: null },
          action: "faction.house_heir",
          targetId,
          before: null,
          after: { factionId: result.factionId, heir: targetId },
        });
      return result;
    },
  };
}
