// 처리할 일 "가문 초대"(house_invite)·"가입 신청"(house_application)·"가문 소식"(house_notice) 제공 함수 — 질문 985 다·983 가·986 가,
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)". 요청 때 DB에서 읽는다(처리함 등록부 원칙).
// - 초대: 나에게 온 초대마다 한 줄, 마감 = 사라지는 시각. 가입 신청: 내가 가문장인 가문의 신청을 한 줄로 묶는다(가문 키).
// - 소식: 확인하지 않은 소식마다 한 줄(완료 분류). 세력 화면 "내 가문" 칸에서 [확인]하면 지운다(inbox.ack가 아직 없다).
// - 누르면 세력 화면으로 간다(그 칸에서 받기·거절·확인).
import type { InboxEntry, InboxProvider } from "../inbox/types.ts";
import type { QueryPool } from "../world/persist/load.ts";
import { HOUSE_NOTICE_LIMIT } from "./houseView.ts";

const FACTION = { route: "faction" } as const;

export function createHouseInboxProviders(pool: QueryPool): InboxProvider[] {
  return [
    {
      kind: "house_invite",
      async collect(account, now) {
        const found = await pool.query(
          `select r.id, r.created_at_ms, r.expires_at_ms, p.name from house_requests r
             join faction_profiles p on p.faction_id = r.faction_id
            where r.user_id = $1 and r.kind = 'invite' and r.expires_at_ms > $2 order by r.created_at_ms, r.id`,
          [account.userId, now],
        );
        return found.rows.map(
          (row): InboxEntry => ({
            kind: "house_invite",
            key: `invite_${String(row.id)}`,
            deadlineAt: Number(row.expires_at_ms),
            firstSeenAt: Number(row.created_at_ms),
            params: { house: String(row.name) },
            target: FACTION,
          }),
        );
      },
    },
    {
      kind: "house_application",
      async collect(account, now) {
        const found = await pool.query(
          `select r.faction_id, r.created_at_ms, r.expires_at_ms, p.name from house_requests r
             join house_members m on m.faction_id = r.faction_id and m.user_id = $1 and m.role = 'leader'
             join faction_profiles p on p.faction_id = r.faction_id
            where r.kind = 'apply' and r.expires_at_ms > $2 order by r.created_at_ms, r.id`,
          [account.userId, now],
        );
        return found.rows.map(
          (row): InboxEntry => ({
            kind: "house_application",
            key: `house_${String(row.faction_id)}`,
            deadlineAt: Number(row.expires_at_ms),
            firstSeenAt: Number(row.created_at_ms),
            params: { house: String(row.name) },
            target: FACTION,
          }),
        );
      },
    },
    {
      kind: "house_notice",
      async collect(account) {
        const found = await pool.query(
          `select id, kind, house_name, created_at_ms from house_notices where user_id = $1
            order by created_at_ms desc, id desc limit ${HOUSE_NOTICE_LIMIT}`,
          [account.userId],
        );
        return found.rows.map(
          (row): InboxEntry => ({
            kind: "house_notice",
            key: `notice_${String(row.id)}`,
            deadlineAt: null,
            firstSeenAt: Number(row.created_at_ms),
            params: { house: String(row.house_name), notice: String(row.kind) },
            target: FACTION,
          }),
        );
      },
    },
  ];
}
