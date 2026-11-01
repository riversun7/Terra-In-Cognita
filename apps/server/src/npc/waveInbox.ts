// 처리할 일 "웨이브가 다가옵니다"(wave_incoming) 제공 함수 — docs/adr/2026-11-01-gardener-r5b.md 5절, D-196 "생성 때 관계자에게 알림"
// 관계자 = 그 도시가 사이보그의 시작 도시인 계정 + 그 도시 주인 세력에 든 계정. 진군 중(marching) 웨이브만, 마감 = 도착 시각.
// 요청 때 DB에서 읽는다(서버가 들고 있지 않는다, 처리함 등록부 원칙). 푸시는 W6(분류별 푸시)이 붙인다.
import type { InboxEntry, InboxProvider } from "../inbox/types.ts";
import type { QueryPool } from "../world/persist/load.ts";

export function createWaveInboxProvider(pool: QueryPool): InboxProvider {
  return {
    kind: "wave_incoming",
    async collect(account, now) {
      const found = await pool.query(
        `select w.id, w.created_at_ms, w.arrive_at_ms from gardener_waves w
         where w.state = 'marching' and w.arrive_at_ms > $2 and w.city_id in (
           select c.start_city_id from cyborgs c where c.user_id = $1
           union
           select wc.id from world_cities wc join faction_members m on m.faction_id = wc.faction_id where m.user_id = $1
         )
         order by w.arrive_at_ms, w.id`,
        [account.userId, now],
      );
      return found.rows.map(
        (row): InboxEntry => ({
          kind: "wave_incoming",
          key: `wave_${String(row.id)}`,
          deadlineAt: Number(row.arrive_at_ms),
          firstSeenAt: Number(row.created_at_ms),
          params: {},
          target: { route: "map" },
        }),
      );
    },
  };
}
