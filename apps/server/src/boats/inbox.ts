// 처리할 일 "도크에서 출고를 기다리는 배"(boat_in_dock)·"집 정박장이 없는 배"(boat_homeless) 제공 함수 — 기획 D-559 1523·1528,
// docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559". 진짜 우편 표가 아직 없어(mail/list.ts) 처리할 일로 알린다(1528 "집 잃으면 우편 알림"의 지금 모양).
// 요청 때 DB에서 읽는다(처리함 등록부 원칙 — 쓰기 대기열이 밀리면 몇 초 늦을 수 있다). 둘 다 계정마다 한 줄로 묶는다(key = boats).
// - boat_in_dock: 다 만들었거나 고친(yard_since_ms 있음) 내 배. 마감 없음(장기 보관료는 그 판에서 본다).
// - boat_homeless: 2차맵에 뜬 내 배 가운데 집 정박장이 없는 배(도크에 든 배는 뺀다).
import type { InboxEntry, InboxProvider } from "../inbox/types.ts";
import type { QueryPool } from "../world/persist/load.ts";

/** 계정마다 한 줄로 묶는 건(key = boats) */
const grouped = (kind: "boat_in_dock" | "boat_homeless", rows: readonly Record<string, unknown>[]) =>
  rows.map(
    (row): InboxEntry => ({
      kind,
      key: "boats",
      deadlineAt: null,
      firstSeenAt: Number(row.since ?? 0),
      params: {},
      target: { route: "map" },
    }),
  );

export function createBoatInboxProviders(pool: QueryPool): InboxProvider[] {
  return [
    {
      kind: "boat_in_dock",
      async collect(account) {
        const found = await pool.query(
          `select s.boat_id, s.yard_since_ms as since from boat_states s
           join world_owners o on o.id = s.owner_id
           where o.user_id = $1 and s.yard_id is not null and s.yard_since_ms is not null
           order by s.boat_id`,
          [account.userId],
        );
        return grouped("boat_in_dock", found.rows);
      },
    },
    {
      kind: "boat_homeless",
      async collect(account) {
        const found = await pool.query(
          `select s.boat_id, s.hull_at_ms as since from boat_states s
           join world_units u on u.id = s.boat_id
           join world_owners o on o.id = u.owner_id
           where o.user_id = $1 and s.home_id is null and s.yard_id is null
           order by s.boat_id`,
          [account.userId],
        );
        return grouped("boat_homeless", found.rows);
      },
    },
  ];
}
