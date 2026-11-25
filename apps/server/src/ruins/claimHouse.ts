// 빈 2차맵 알박기의 DB 쪽 일(비동기) — 기획 D-574("가문이 있으면 가문소유, 무소속이면 유닛 독재 도시")·D-572, ruins/landClaim.ts.
// - 1인 가문(foundPersonalHouse): 가문 없는 플레이어가 지은 정부가 다 지어지면 그 플레이어를 가문장으로 하는 가문(세력 행 kind = player)을
//   만든다 — "유닛 독재 도시"의 주인 세력이다(기술 기본값, 질문 2242). 저장한 정체성(faction_identities, 아직 가문 없음)이 있으면 가문 창설과
//   같은 문장(이름·약어·색이 그 가문의 것), 없거나 약어가 겹치면 이름 없는 세력 행·가문장 줄을 만들고 자리표시 정체성을 붙인다(아래). 나라
//   (born_of) = 사이보그 시민권 나라, 소속 도시 = 사이보그 시작 도시(도시를 얻으면 가문 표가 가문 도시로 옮긴다). 만든 뒤 런타임 틱이 그 가문으로
//   새 도시를 세운다.
//   바뀜(사용자 결정 2026-11-25 — landClaim.ts 머리 "바뀜"): 알박기는 이제 1인 가문을 저절로 만들지 않는다(가문 없는 사람의 정부는 지배
//   가문이 없는 빈 상태). foundPersonalHouse는 부르는 곳이 없고, 이미 만든 1인 가문과 이름 붙이기 길만 남는다.
// - 이름 붙이기(질문 2242 가 + 기술 기본값): 이름 없는 1인 가문에는 운영자가 되돌린 이름과 같은 자리표시 정체성("가문 #ID"·약어 "H<36진수 ID>",
//   이름 대기 없음 = RENAME_FREE — 질문 986 가의 되돌린 상태)을 세력 정체성(faction_profiles)·플레이어 정체성(faction_identities, 가문에 이음)에
//   함께 둔다. 그래서 가문장은 기존 정체성 고치기 길(tRPC factionIdentity.save — 이름 바꾸기 막음 1006 나·약어 폭·겹침 규칙 그대로)로 바로 이름을
//   붙이고, 그 사이에도 가문 표지·가문 도시 줄(세력 화면 "내 가문")이 보인다(표지 조회는 세력 정체성 줄이 있어야 가문을 보인다). 세력 화면은
//   이름이 자리표시면 [이름 정하기]를 보인다. 이 판 앞에 만든 이름 없는 가문은 런타임 첫 알박기 틱에 한 번 붙인다(nameUnnamedHouses).
// - 소식(writeClaimNotices): 가문 소식 표(house_notices — 가문 화면 소식 칸)에 쓴다. 도시가 섰다 = city_gained(2197 나 — 그 가문의 모든
//   가문원), 짓던 정부가 멈췄다 = claim_halted(2194 — 그 건물을 지은 사람).
import { FACTION_IDENTITY_COLORS } from "@terra/shared/factionIdentity";
import { houseResetName } from "@terra/shared/house";
import { emblemOfId } from "@terra/shared/nationEmblem";
import type { QueryPool } from "../world/persist/load.ts";
import { RENAME_FREE } from "../factionIdentity/house.ts";

/** 가문 창설과 같은 문장(factionIdentity/house.ts foundHouse) — 정체성 줄이 있고 아직 가문이 없을 때만 */
const IDENTITY_HOUSE_SQL = `with ident as (
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
 select created.id from created, profile, member, linked`;

/** 이름 없는 1인 가문(세력 행·가문장 줄·소속 도시 줄) — 이미 가문이 있으면 아무것도 하지 않는다 */
const BARE_HOUSE_SQL = `with free as (
   select 1 where not exists (select 1 from house_members m where m.user_id = $1)
 ),
 created as (insert into factions (kind, born_of) select 'player', $2::bigint from free returning id),
 member as (
   insert into house_members (user_id, faction_id, role, joined_at_ms)
   select $1, created.id, 'leader', $3 from created returning faction_id
 ),
 homed as (
   insert into house_homes (faction_id, city_id, set_at_ms)
   select created.id, $4::bigint, $3 from created where $4::bigint is not null returning faction_id
 )
 select created.id from created, member`;

const isShortViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  Reflect.get(error, "code") === "23505" &&
  String(Reflect.get(error, "constraint") ?? "").includes("short");

/**
 * 자리표시 정체성(가문장 줄 → 플레이어 정체성 → 세력 정체성 차례로 한 문장 — 하나라도 실패하면 아무것도 남지 않는다). 그 사람의 정체성 초안이
 * 있으면(아직 가문에 잇지 않은 줄) 이름·약어만 자리표시로 바꾸고 색·마크는 그대로 둔다. 이미 세력 정체성이 있는 가문은 건드리지 않는다
 */
const PLACEHOLDER_SQL = `with leader as (
   select m.user_id from house_members m
    where m.faction_id = $2 and m.user_id = $1 and m.role = 'leader'
      and not exists (select 1 from faction_profiles p where p.faction_id = $2)
 ),
 ident as (
   insert into faction_identities (user_id, name, name_key, short_name, color, emblem_shape, emblem_division,
     emblem_charge, emblem_scheme, created_at_ms, updated_at_ms, name_changed_at_ms, faction_id, founded_at_ms)
   select leader.user_id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $2, $11 from leader
   on conflict (user_id) do update set name = excluded.name, name_key = excluded.name_key,
     short_name = excluded.short_name, updated_at_ms = excluded.updated_at_ms,
     name_changed_at_ms = excluded.name_changed_at_ms, faction_id = excluded.faction_id,
     founded_at_ms = excluded.founded_at_ms
     where faction_identities.faction_id is null
   returning user_id, color
 ),
 profile as (
   insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms, updated_by)
   select $2, $3, $5, ident.color, 'player', $11, ident.user_id from ident returning faction_id
 )
 select faction_id from profile`;

/** 자리표시 약어 앞 글자(겹치면 다음 글자로 — 운영자가 되돌린 약어 houseResetShort와 같은 "H"가 먼저) */
const PLACEHOLDER_SHORT_PREFIXES = ["H", "Q", "Z"] as const;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && Reflect.get(error, "code") === "23505";

/**
 * 이름 없는 1인 가문에 자리표시 정체성을 붙인다(질문 2242 이름 붙이기 길). 붙였으면 true. 약어가 모두 겹치거나(Assumed: 거의 없음) 이미 정체성이
 * 있거나 그 사람이 가문장이 아니면 false
 */
export async function givePlaceholderIdentity(
  pool: QueryPool,
  input: { userId: string; factionId: number; nowMs: number },
): Promise<boolean> {
  const name = houseResetName(input.factionId);
  const emblem = emblemOfId(input.userId);
  const color = FACTION_IDENTITY_COLORS[input.factionId % FACTION_IDENTITY_COLORS.length] ?? "#c0392b";
  const id36 = Math.max(1, Math.trunc(input.factionId)).toString(36).toUpperCase();
  for (const prefix of PLACEHOLDER_SHORT_PREFIXES) {
    try {
      const { rows } = await pool.query(PLACEHOLDER_SQL, [
        input.userId,
        input.factionId,
        name,
        name.replaceAll(/\s+/gu, "").toLowerCase(),
        `${prefix}${id36}`.slice(0, 5),
        color,
        emblem.shape,
        emblem.division,
        emblem.charge,
        emblem.scheme,
        input.nowMs,
        RENAME_FREE,
      ]);
      return rows.length > 0;
    } catch (error) {
      // 약어가 다른 세력·정체성과 겹친다: 다음 앞 글자로
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return false;
}

/** 세력 정체성이 없는 플레이어 가문(이 판 앞에 만든 이름 없는 1인 가문)에 자리표시 정체성을 붙인다. 붙인 수 */
export async function nameUnnamedHouses(pool: QueryPool, nowMs: number): Promise<number> {
  const { rows } = await pool.query(
    `select f.id, m.user_id from factions f join house_members m on m.faction_id = f.id and m.role = 'leader'
      where f.kind = 'player' and f.dissolved_at_ms is null
        and not exists (select 1 from faction_profiles p where p.faction_id = f.id)
      order by f.id`,
  );
  let named = 0;
  for (const row of rows)
    if (
      await givePlaceholderIdentity(pool, { userId: String(row.user_id), factionId: Number(row.id), nowMs })
    )
      named += 1;
  return named;
}

/** 1인 가문을 만든다. 만든 세력 행 ID, 이미 가문이 있으면 null */
export async function foundPersonalHouse(
  pool: QueryPool,
  input: { userId: string; nationId: number | null; homeCityId: number | null; nowMs: number },
): Promise<number | null> {
  const values = [input.userId, input.nationId, input.nowMs, input.homeCityId];
  try {
    const named = await pool.query(IDENTITY_HOUSE_SQL, values);
    if (named.rows[0]) return Number(named.rows[0].id);
  } catch (error) {
    // 약어가 다른 세력과 겹친다: 이름 없는 행으로(정체성 초안의 이름·약어는 자리표시로 바뀐다 — 가문장이 정체성 고치기로 다시 정한다)
    if (!isShortViolation(error)) throw error;
  }
  const bare = await pool.query(BARE_HOUSE_SQL, values);
  if (!bare.rows[0]) return null;
  const factionId = Number(bare.rows[0].id);
  await givePlaceholderIdentity(pool, { userId: input.userId, factionId, nowMs: input.nowMs });
  return factionId;
}

/** 소식 한 줄(가문 소식 표) */
export interface ClaimNotice {
  /** 받는 사람. house = 그 가문의 모든 가문원에게(userId는 무시), 아니면 그 사람에게 */
  readonly userId: string | null;
  readonly house: number | null;
  readonly kind: "city_gained" | "claim_halted";
  /** city_gained = vassal | independent, claim_halted = null */
  readonly reason: string | null;
  readonly nowMs: number;
}

/** 소식을 쓴다(가문 이름은 그때의 세력 정체성 — 없으면 "#ID", 가문 없는 사람은 빈 글자) */
export async function writeClaimNotices(pool: QueryPool, notices: readonly ClaimNotice[]): Promise<void> {
  for (const notice of notices) {
    if (notice.house !== null)
      await pool.query(
        `insert into house_notices (user_id, faction_id, kind, house_name, other_name, reason, count, created_at_ms)
         select m.user_id, m.faction_id, $2, coalesce(p.name, '#' || m.faction_id::text), null, $3, 0, $4
           from house_members m left join faction_profiles p on p.faction_id = m.faction_id
          where m.faction_id = $1 and ($5::uuid is null or m.user_id = $5::uuid)`,
        [
          notice.house,
          notice.kind,
          notice.reason,
          notice.nowMs,
          notice.kind === "claim_halted" ? notice.userId : null,
        ],
      );
    else if (notice.userId !== null)
      await pool.query(
        `insert into house_notices (user_id, faction_id, kind, house_name, other_name, reason, count, created_at_ms)
         values ($1, null, $2, '', null, $3, 0, $4)`,
        [notice.userId, notice.kind, notice.reason, notice.nowMs],
      );
  }
}
