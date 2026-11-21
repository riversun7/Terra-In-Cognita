// 처리할 일 "사는 곳이 쉬는 내 유닛"(residence_paused) 제공 함수 — 질문 2485 가(사용자 답: 고른 사는 곳을 쓸 수 없게 되면 고른 것은 쉬고 숙소 배정으로 돌아가며, 주인에게
// 알린다), 줄기 governance-6. 쉼 표시는 사는 곳 쉼 훑기(attach.ts sweepResidencePauses — 1분마다)가 unit_residences.paused_since_ms에 적는다. 요청 때 DB에서 읽는다
// (처리함 등록부 원칙). 계정마다 한 줄로 묶는다(key = residence — 쉬는 유닛 수). 처음 본 시각 = 가장 이른 쉼 시각, 마감 없음.
import type { InboxEntry, InboxProvider } from "../inbox/types.ts";
import type { QueryPool } from "../world/persist/load.ts";

export function createResidencePausedInboxProvider(pool: QueryPool): InboxProvider {
  return {
    kind: "residence_paused",
    async collect(account) {
      const found = await pool.query(
        `select r.unit_id, r.building_id, r.paused_since_ms from unit_residences r
         join world_owners o on o.id = r.owner_id
         where o.user_id = $1 and r.paused_since_ms is not null
         order by r.unit_id`,
        [account.userId],
      );
      // 묶는 종류: 유닛마다 건 하나, 같은 키(residence)라 한 줄이 된다
      return found.rows.map(
        (row): InboxEntry => ({
          kind: "residence_paused",
          key: "residence",
          deadlineAt: null,
          firstSeenAt: Number(row.paused_since_ms ?? 0),
          params: {},
          target: { route: "map" },
        }),
      );
    },
  };
}
