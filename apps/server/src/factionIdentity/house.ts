// 플레이어 가문 저장·읽기(질문 926 나·930 나, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)"). SQL만 둔다.
// - 창설(foundHouse): 정체성 줄(faction_identities, 아직 가문 없음) 하나에서 세력 행(factions kind = player, born_of = 가문 나라 — 소속 도시의
//   나라, D-565)·세력 정체성(faction_profiles source = player)·가문장 줄(house_members)·소속 도시 줄(house_homes)을 만들고 정체성 줄에 가문을 잇는다. 한 문장(데이터를 바꾸는 CTE)이라
//   하나라도 실패하면(약어 겹침 등) 아무것도 남지 않는다. 같은 줄을 두 번 창설하지 않는다(faction_id is null 조건 + 줄 잠금).
// - 창설한 가문은 소유 주체(world_owners)를 만들지 않는다: 국고·도시가 없다. 창설자 시민권(faction_members·cyborgs.faction_id)은 이 문장이
//   아니라 가문 표 다시 읽기가 소속 도시의 나라로 맞춘다(world/houseTies.ts, D-569). 도시를 얻으며 봉신·독립을 고르면 그때 주체를 만든다
//   (houseCity.ts, 질문 1005 가).
// - 신고(reportHouse): 계정마다 가문 하나에 한 줄, 하루(24시간) 횟수는 설정 칸으로 센다.
import type { FactionReportStatus } from "@terra/shared/factionIdentity";
import type { IdentityQueryable } from "./store.ts";

/** 이름을 마지막으로 정한 시각을 이 값으로 두면 대기(설정 칸 어떤 값이든)가 이미 지났다 — 운영자가 이름을 되돌린 뒤(986 가) */
export const RENAME_FREE = Number.MIN_SAFE_INTEGER;

/** 하루(신고 횟수를 세는 창) */
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 정체성 줄에서 가문을 창설한다. 만든 가문 세력 행 ID, 정체성 줄이 없거나 이미 창설했거나 다른 가문의 가문원이면(질문 985) null.
 * 약어가 다른 세력 정체성과 겹치면 pg 고유 제약 오류(23505, faction_profiles_short_idx)가 난다 — 부르는 쪽이 읽는다
 */
export async function foundHouse(
  pool: IdentityQueryable,
  input: { userId: string; nationId: number | null; homeCityId?: number | null | undefined; nowMs: number },
): Promise<number | null> {
  const { rows } = await pool.query<{ id: string }>(
    `with ident as (
       select user_id, name, short_name, color from faction_identities
        where user_id = $1 and faction_id is null
          and not exists (select 1 from house_members m where m.user_id = $1) for update
     ),
     created as (insert into factions (kind, born_of) select 'player', $2::bigint from ident returning id),
     profile as (
       insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms, updated_by)
       select created.id, ident.name, ident.short_name, ident.color, 'player', $3, ident.user_id
         from created, ident returning faction_id
     ),
     member as (
       insert into house_members (user_id, faction_id, role, joined_at_ms)
       select $1, created.id, 'leader', $3 from created returning faction_id
     ),
     linked as (
       update faction_identities i set faction_id = created.id, founded_at_ms = $3
         from created where i.user_id = $1 returning i.faction_id
     ),
     homed as (
       insert into house_homes (faction_id, city_id, set_at_ms)
       select created.id, $4::bigint, $3 from created where $4::bigint is not null returning faction_id
     )
     select created.id from created, profile, member, linked`,
    [input.userId, input.nationId, input.nowMs, input.homeCityId ?? null],
  );
  const row = rows[0];
  return row ? Number(row.id) : null;
}

/** 창설하지 않은 정체성 줄과 그 창설자의 나라(사이보그 시민권, 미소속이면 null)·내 도시 — 서버를 켤 때 옛 정체성을 가문으로 옮긴다. 다른 가문의 가문원은 뺀다 */
export async function unfoundedIdentities(
  pool: IdentityQueryable,
): Promise<{ userId: string; nationId: number | null; cityId: number }[]> {
  const { rows } = await pool.query<{ user_id: string; faction_id: string | null; start_city_id: string }>(
    `select i.user_id, c.faction_id, c.start_city_id from faction_identities i join cyborgs c on c.user_id = i.user_id
      where i.faction_id is null
        and not exists (select 1 from house_members m where m.user_id = i.user_id)
      order by i.created_at_ms`,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    nationId: row.faction_id === null ? null : Number(row.faction_id),
    cityId: Number(row.start_city_id),
  }));
}

/** 가문 나라(소속 도시의 나라 — D-565) */
export async function houseNation(pool: IdentityQueryable, factionId: number): Promise<number | null> {
  const { rows } = await pool.query<{ born_of: string | null }>(
    "select born_of from factions where id = $1 and kind = 'player'",
    [factionId],
  );
  const value = rows[0]?.born_of;
  return value === null || value === undefined ? null : Number(value);
}

/** 이 사용자가 든 가문(없으면 null) */
export async function houseOfUser(pool: IdentityQueryable, userId: string): Promise<number | null> {
  const { rows } = await pool.query<{ faction_id: string }>(
    "select faction_id from house_members where user_id = $1",
    [userId],
  );
  return rows[0] ? Number(rows[0].faction_id) : null;
}

/**
 * 가문을 신고한다(같은 계정이 같은 가문을 두 번 세지 않는다). 하루 횟수는 dailyLimit(설정 칸 house_report_daily, 0 = 신고 못 함).
 * 결과: reported·already·limit·own(내 가문)·unknown(가문이 아니거나 없음)
 */
export async function reportHouse(
  pool: IdentityQueryable,
  input: { reporterId: string; factionId: number; nowMs: number; dailyLimit: number },
): Promise<FactionReportStatus> {
  const { rows } = await pool.query<{ house: boolean; own: boolean; already: boolean; recent: number }>(
    `select
       exists(select 1 from factions f where f.id = $2 and f.kind = 'player' and f.dissolved_at_ms is null) as house,
       exists(select 1 from house_members m where m.user_id = $1 and m.faction_id = $2) as own,
       exists(select 1 from house_reports r where r.reporter_id = $1 and r.faction_id = $2) as already,
       (select count(*)::int from house_reports r where r.reporter_id = $1 and r.created_at_ms > $3) as recent`,
    [input.reporterId, input.factionId, input.nowMs - REPORT_WINDOW_MS],
  );
  const row = rows[0];
  if (!row?.house) return "unknown";
  if (row.own) return "own";
  if (row.already) return "already";
  if (row.recent >= Math.max(0, input.dailyLimit)) return "limit";
  const inserted = await pool.query<{ id: string }>(
    `insert into house_reports (faction_id, reporter_id, created_at_ms) values ($1, $2, $3)
     on conflict do nothing returning id`,
    [input.factionId, input.reporterId, input.nowMs],
  );
  return inserted.rows.length > 0 ? "reported" : "already";
}

/** 그 가문의 신고를 넘긴다(운영자가 보고 문제없다고 봄). 지운 수 */
export async function clearReports(pool: IdentityQueryable, factionId: number): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    "delete from house_reports where faction_id = $1 returning id",
    [factionId],
  );
  return rows.length;
}

/**
 * 운영자가 신고된 가문 이름을 "가문 #ID"로 되돌린다(질문 986 가). resetShort면 약어도 "H<36진수 ID>"로. 이름 대기를 풀어(name_changed_at_ms =
 * RENAME_FREE) 주인이 바로 다시 정한다. 세력 정체성(faction_profiles)도 같은 문장에서 바꾸고 그 가문의 신고를 지운다. 앞 값·주인, 가문이 없으면 null.
 * 약어가 다른 세력과 겹치면 pg 고유 제약 오류(23505)가 난다 — 부르는 쪽이 읽는다
 */
export async function resetHouseName(
  pool: IdentityQueryable,
  input: {
    factionId: number;
    name: string;
    nameKey: string;
    shortName: string | null;
    nowMs: number;
    actorId: string;
    /** 되돌린 횟수가 이 값에 이르면 이름 바꾸기를 저절로 막는다(설정 칸 house_name_reset_block, 0 = 끔 — 질문 1006 나) */
    autoBlockAt: number;
  },
): Promise<{
  ownerId: string;
  name: string;
  shortName: string;
  newShort: string;
  resets: number;
  autoBlocked: boolean;
} | null> {
  const { rows } = await pool.query<{
    user_id: string;
    name: string;
    short_name: string;
    new_short: string;
    resets: number;
    auto_blocked: boolean;
  }>(
    `with before as (
       select user_id, name, short_name, rename_blocked from faction_identities where faction_id = $1 for update
     ),
     changed as (
       update faction_identities i set name = $2, name_key = $3, short_name = coalesce($4, i.short_name),
         name_changed_at_ms = $7, updated_at_ms = $5, name_reset_count = i.name_reset_count + 1,
         rename_blocked = i.rename_blocked or ($8::int > 0 and i.name_reset_count + 1 >= $8::int)
         from before where i.user_id = before.user_id
       returning i.short_name, i.name_reset_count as resets,
         (not before.rename_blocked and $8::int > 0 and i.name_reset_count >= $8::int) as auto_blocked
     ),
     profile as (
       update faction_profiles p set name = $2, short_name = coalesce($4, p.short_name), updated_at_ms = $5,
         updated_by = $6 where p.faction_id = $1 returning p.faction_id
     ),
     cleared as (delete from house_reports r where r.faction_id = $1 and exists (select 1 from before) returning r.id)
     select before.user_id, before.name, before.short_name, changed.short_name as new_short, changed.resets,
            changed.auto_blocked
       from before, changed`,
    [
      input.factionId,
      input.name,
      input.nameKey,
      input.shortName,
      input.nowMs,
      input.actorId,
      RENAME_FREE,
      Math.max(0, Math.trunc(input.autoBlockAt)),
    ],
  );
  const row = rows[0];
  return row
    ? {
        ownerId: row.user_id,
        name: row.name,
        shortName: row.short_name,
        newShort: row.new_short,
        resets: row.resets,
        autoBlocked: row.auto_blocked,
      }
    : null;
}
