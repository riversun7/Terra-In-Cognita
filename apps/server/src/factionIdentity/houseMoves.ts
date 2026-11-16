// 가문 소속 도시 옮기기 — 기획 D-570(질문 1845·1846 답, 사용자 원문 "가문은 모두 함께이동되며, 가문장이 미리 공고하고 원치않은 가문세력원은
// 탈퇴한다. 해당 국가나 도시의 정책에 따름. 지원금이 있을지 가입비가 있을지 등."), docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, D-570)".
// - 공고(houseHome.ts set): 가문장이 새 소속 도시를 고르면 house_homes.pending_city_id·pending_at_ms(지금 + 설정 칸 house_home_notice_ms)에 적고
//   가문원에게 소식 home_announced. 그 사이 원치 않는 가문원은 탈퇴한다(가문을 나가면 나라·내 도시는 그대로 — 질문 1841). 공고 기간이 0이면 바로 옮긴다.
// - 옮기기(이 파일 applyDue — 1분마다, attach.ts): 시각이 지난 공고마다 한 트랜잭션으로 소속 도시·가문 나라(born_of)를 바꾸고 공고를 비운 뒤 가문원
//   모두에게 home_changed. 가문원 시민권·내 도시는 가문 표 다시 읽기(world/houseTies.ts)가 새 나라·도시로 맞춘다(가문 단위로만 이동 — 가문원
//   개인 귀화는 그대로 막는다, citizenship in_house). 그 사이 가문이 도시를 얻었거나(has_city) 새 도시가 폐허가 됐으면(unknown_city) 옮기지 않고
//   공고를 거둔다(home_cancelled, reason = 까닭).
// - 들어가는 나라의 정책(factions.house_entry_fee, 부호 있는 최소 단위 — + 가입비 / − 지원금, null = 0): 옮긴 뒤 가문원마다(가문장 포함) 원장 거래
//   house_entry 하나. 가입비는 가문원 → 그 나라 국고, 지원금은 국고 → 가문원. 시험 화폐(귀화 D-526과 같은 자산). [임시 질문 2017] 가입비가 잔고보다
//   크면 있는 만큼, 지원금은 국고에 있는 만큼(새 화폐를 만들지 않는다 — 귀화 질문 845와 같다). 정책을 정하는 화면·명령은 아직 없다(기본 0, 질문 2018).
//   같은 나라 안에서 도시만 바꾸면 매기지 않는다(나라가 그대로).
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import {
  type HouseMovePersistence,
  chargeHouseEntry,
  houseEntryTermsOf,
  moveHouseHome,
} from "./houseEntry.ts";
import { cityHome, houseHasCity } from "./houseHome.ts";
import { type HouseTxPool, cyborgNameOf, inTransaction, lockHouse, notify } from "./members.ts";

export interface HouseMovesOptions {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  /** 세계 저장 층(원장·가문 표). 없으면 값 없이 옮긴다 */
  readonly persistence?: (() => (HouseMovePersistence & object) | undefined) | undefined;
}

export interface HouseMoves {
  /** 시각이 지난 공고를 옮긴다(또는 거둔다). 옮긴 가문 수 */
  applyDue(): Promise<number>;
}

type DueOutcome =
  | {
      readonly kind: "moved";
      readonly users: string[];
      readonly cityId: number;
      readonly nationId: number;
      readonly before: number | null;
      readonly leaderId: string | null;
    }
  | { readonly kind: "cancelled" | "skip" };

export function createHouseMoves(o: HouseMovesOptions): HouseMoves {
  /** 공고 하나를 옮기거나 거둔다(한 트랜잭션) */
  const applyOne = (houseId: number, nowMs: number) =>
    inTransaction(o.pool, async (q): Promise<DueOutcome> => {
      const house = await lockHouse(q, houseId);
      if (!house) return { kind: "skip" };
      const { rows } = await q.query<{ pending_city_id: string | null; pending_at_ms: string | null }>(
        "select pending_city_id, pending_at_ms from house_homes where faction_id = $1 for update",
        [houseId],
      );
      const row = rows[0];
      if (!row || row.pending_city_id === null || Number(row.pending_at_ms) > nowMs) return { kind: "skip" };
      const target = await cityHome(q, Number(row.pending_city_id), o.presets?.() ?? []);
      const reason = (await houseHasCity(q, houseId)) ? "has_city" : target ? null : "unknown_city";
      if (reason !== null || !target) {
        await q.query(
          "update house_homes set pending_city_id = null, pending_at_ms = null where faction_id = $1",
          [houseId],
        );
        const members = await q.query<{ user_id: string }>(
          "select user_id from house_members where faction_id = $1",
          [houseId],
        );
        for (const member of members.rows)
          await notify(q, {
            userId: member.user_id,
            factionId: houseId,
            kind: "home_cancelled",
            houseName: house.name,
            reason,
            nowMs,
          });
        return { kind: "cancelled" };
      }
      const leader = await q.query<{ user_id: string }>(
        "select user_id from house_members where faction_id = $1 and role = 'leader'",
        [houseId],
      );
      const leaderId = leader.rows[0]?.user_id;
      const users = await moveHouseHome(q, {
        house,
        city: target,
        leaderName: leaderId === undefined ? null : await cyborgNameOf(q, leaderId),
        skip: null,
        nowMs,
      });
      return {
        kind: "moved",
        users,
        cityId: target.id,
        nationId: target.nationId,
        before: house.nation,
        leaderId: leaderId ?? null,
      };
    });

  return {
    async applyDue() {
      const nowMs = o.now();
      const { rows } = await o.pool.query<{ faction_id: string }>(
        "select faction_id from house_homes where pending_at_ms is not null and pending_at_ms <= $1 order by faction_id",
        [nowMs],
      );
      let moved = 0;
      for (const row of rows) {
        const houseId = Number(row.faction_id);
        const outcome = await applyOne(houseId, nowMs);
        if (outcome.kind !== "moved") continue;
        moved += 1;
        // 나라가 바뀌면 들어가는 나라의 정책(가입비·지원금)
        const terms =
          outcome.before === outcome.nationId ? 0n : await houseEntryTermsOf(o.pool, outcome.nationId);
        const charged = await chargeHouseEntry(o.persistence?.(), {
          houseId,
          nationId: outcome.nationId,
          terms,
          userIds: outcome.users,
          nowMs,
        });
        if (o.db)
          await writeAudit(o.db, {
            actor: { kind: "system", id: null, ip: null },
            action: "faction.house_home",
            // 대상 = 가문장(감사 기록 대상 칸은 계정 UUID)
            targetId: outcome.leaderId,
            before: null,
            after: {
              factionId: houseId,
              beforeNation: outcome.before,
              city: outcome.cityId,
              nation: outcome.nationId,
              announced: true,
              paid: charged.paid.toString(),
              granted: charged.granted.toString(),
            },
          });
      }
      if (moved > 0) await houseTiesOf(o.persistence?.())?.reload();
      return moved;
    },
  };
}
