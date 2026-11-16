// 빈 2차맵 알박기의 DB 쪽 일(비동기) — 기획 D-574("가문이 있으면 가문소유, 무소속이면 유닛 독재 도시")·D-572, ruins/landClaim.ts.
// - 1인 가문(foundPersonalHouse): 가문 없는 플레이어가 지은 정부가 다 지어지면 그 플레이어를 가문장으로 하는 가문(세력 행 kind = player)을
//   만든다 — "유닛 독재 도시"의 주인 세력이다(기술 기본값, 질문 2242). 저장한 정체성(faction_identities, 아직 가문 없음)이 있으면 가문 창설과
//   같은 문장(이름·약어·색이 그 가문의 것), 없거나 약어가 겹치면 이름 없는 세력 행(화면은 "#ID")·가문장 줄만. 나라(born_of) = 사이보그
//   시민권 나라, 소속 도시 = 사이보그 시작 도시(도시를 얻으면 가문 표가 가문 도시로 옮긴다). 만든 뒤 런타임 틱이 그 가문으로 새 도시를 세운다.
// - 소식(writeClaimNotices): 가문 소식 표(house_notices — 가문 화면 소식 칸)에 쓴다. 도시가 섰다 = city_gained(2197 나 — 그 가문의 모든
//   가문원), 짓던 정부가 멈췄다 = claim_halted(2194 — 그 건물을 지은 사람).
import type { QueryPool } from "../world/persist/load.ts";

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
    // 약어가 다른 세력과 겹친다: 이름 없는 행으로(정체성은 그대로 — 고친 뒤 이름을 붙이는 길은 질문 2242)
    if (!isShortViolation(error)) throw error;
  }
  const bare = await pool.query(BARE_HOUSE_SQL, values);
  return bare.rows[0] ? Number(bare.rows[0].id) : null;
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
