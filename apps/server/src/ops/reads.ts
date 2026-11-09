// 운영자 콘솔의 DB 읽기(docs/adr/2026-11-08-operator-console.md). 읽기만 한다. 자료는 DB 기준이라 쓰기 대기열이 커밋하기 전 몇 초는 늦다.
// 이메일·비밀번호 해시·세션 토큰은 읽지 않는다(관리자 화면과 같은 규칙).
import type { Role } from "@terra/shared";
import type { OpsAuditRow, OpsCityRow, OpsItemRow, OpsSkillRow } from "@terra/shared/ops";
import { parseRoleString } from "../auth/permissions.ts";
import type { OpsQueryable } from "./access.ts";

export interface PlayerBase {
  id: string;
  loginId: string;
  roles: Role[];
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  online: boolean;
  offlineSinceMs: number | null;
  cyborgName: string | null;
  level: number | null;
  factionId: number | null;
  factionCode: string | null;
  ownerId: number | null;
}

interface PlayerSqlRow {
  id: string;
  name: string;
  role: string;
  banned: boolean;
  ban_reason: string | null;
  ban_expires: Date | null;
  created_at: Date;
  offline_since_ms: string | null;
  has_presence: boolean;
  cyborg_name: string | null;
  level: number | null;
  faction_id: string | null;
  faction_code: string | null;
  owner_id: string | null;
}

const num = (value: string | number | null): number | null => (value === null ? null : Number(value));

function toPlayer(row: PlayerSqlRow): PlayerBase {
  return {
    id: row.id,
    loginId: row.name,
    roles: parseRoleString(row.role),
    banned: row.banned,
    banReason: row.ban_reason,
    banExpires: row.ban_expires ? row.ban_expires.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    online: row.has_presence && row.offline_since_ms === null,
    offlineSinceMs: num(row.offline_since_ms),
    cyborgName: row.cyborg_name,
    level: row.level,
    factionId: num(row.faction_id),
    factionCode: row.faction_code,
    ownerId: num(row.owner_id),
  };
}

const PLAYER_SELECT = `
  select u.id, u.name, u.role, u.banned, u.ban_reason, u.ban_expires, u.created_at,
         p.offline_since_ms, (p.user_id is not null) as has_presence,
         c.name as cyborg_name, c.level, coalesce(c.faction_id, fm.faction_id) as faction_id, f.code as faction_code,
         o.id as owner_id
    from users u
    left join world_presence p on p.user_id = u.id
    left join cyborgs c on c.user_id = u.id
    left join faction_members fm on fm.user_id = u.id
    left join factions f on f.id = coalesce(c.faction_id, fm.faction_id)
    left join world_owners o on o.user_id = u.id`;

export type PlayerSort = "login" | "created" | "level";
export type PlayerStatus = "all" | "online" | "banned" | "staff";

/** 유저 목록. search = 아이디·사이보그 이름 일부(대소문자 무시) */
export async function listPlayers(
  db: OpsQueryable,
  input: { search: string; status: PlayerStatus; sort: PlayerSort; limit: number; offset: number },
): Promise<{ rows: PlayerBase[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (input.search) {
    values.push(`%${likeEscape(input.search)}%`);
    where.push(`(u.username ilike $${values.length} or c.name ilike $${values.length})`);
  }
  if (input.status === "online") where.push("p.user_id is not null and p.offline_since_ms is null");
  if (input.status === "banned") where.push("u.banned");
  if (input.status === "staff") where.push("u.role ~ '(^|,)(gm|dev|admin)(,|$)'");
  const filter = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const order =
    input.sort === "created"
      ? "u.created_at desc, u.id"
      : input.sort === "level"
        ? "c.level desc nulls last, u.username"
        : "u.username";
  const count = await db.query<{ n: string }>(
    `select count(*) as n from users u left join world_presence p on p.user_id = u.id left join cyborgs c on c.user_id = u.id ${filter}`,
    values,
  );
  const { rows } = await db.query<PlayerSqlRow>(
    `${PLAYER_SELECT} ${filter} order by ${order} limit $${values.length + 1} offset $${values.length + 2}`,
    [...values, input.limit, input.offset],
  );
  return { rows: rows.map(toPlayer), total: Number(count.rows[0]?.n ?? 0) };
}

export async function findPlayer(db: OpsQueryable, userId: string): Promise<PlayerBase | undefined> {
  const { rows } = await db.query<PlayerSqlRow>(`${PLAYER_SELECT} where u.id = $1`, [userId]);
  return rows[0] ? toPlayer(rows[0]) : undefined;
}

export interface CyborgSqlRow {
  name: string;
  temperament: string;
  level: number;
  exp: number;
  rebirths: number;
  faith: number;
  faith_points: number;
  religion: string | null;
  initial: number[];
  k_pm: number[];
  elements: number[] | null;
  start_city_id: string;
  unit_id: string | null;
  created_at_ms: string;
}

export async function cyborgOf(db: OpsQueryable, userId: string): Promise<CyborgSqlRow | undefined> {
  const { rows } = await db.query<CyborgSqlRow>(
    `select name, temperament, level, exp, rebirths, faith, faith_points, religion, initial, k_pm, elements,
            start_city_id, unit_id, created_at_ms
       from cyborgs where user_id = $1`,
    [userId],
  );
  return rows[0];
}

export async function sessionsOf(
  db: OpsQueryable,
  userId: string,
): Promise<{ count: number; lastSeen: string | null }> {
  const { rows } = await db.query<{ n: string; last: Date | null }>(
    "select count(*) as n, max(updated_at) as last from sessions where user_id = $1 and expires_at > now()",
    [userId],
  );
  const row = rows[0];
  return { count: Number(row?.n ?? 0), lastSeen: row?.last ? row.last.toISOString() : null };
}

interface ItemSqlRow {
  id: string;
  item_id: string;
  location: string;
  slot: number | null;
  quantity: number;
  durability: number | null;
  max_durability: number | null;
  source: string;
}

const toItem = (row: ItemSqlRow): OpsItemRow => ({
  id: Number(row.id),
  itemId: row.item_id,
  location: Number(row.location),
  slot: row.slot,
  quantity: row.quantity,
  durability: row.durability,
  maxDurability: row.max_durability,
  source: row.source,
});

const ITEM_SELECT =
  "select id, item_id, location, slot, quantity, durability, max_durability, source from item_holdings";

/** 주체의 보유 물건(최대 500) */
export async function itemsOfOwner(db: OpsQueryable, ownerId: number): Promise<OpsItemRow[]> {
  const { rows } = await db.query<ItemSqlRow>(`${ITEM_SELECT} where owner_id = $1 order by id limit 500`, [
    ownerId,
  ]);
  return rows.map(toItem);
}

/** 유닛이 들고 있거나 입은 물건(위치 = −유닛 ID) */
export async function itemsOfUnit(db: OpsQueryable, unitId: number): Promise<OpsItemRow[]> {
  const { rows } = await db.query<ItemSqlRow>(`${ITEM_SELECT} where location = $1 order by id limit 200`, [
    -unitId,
  ]);
  return rows.map(toItem);
}

export async function skillsOfUnits(db: OpsQueryable, unitIds: readonly number[]): Promise<OpsSkillRow[]> {
  if (unitIds.length === 0) return [];
  const { rows } = await db.query<{ unit_id: string; skill_id: string; grade: number; source: string }>(
    "select unit_id, skill_id, grade, source from unit_skills where unit_id = any($1::bigint[]) order by unit_id, skill_id",
    [unitIds],
  );
  return rows.map((row) => ({
    unitId: Number(row.unit_id),
    skillId: row.skill_id,
    grade: row.grade,
    source: row.source,
  }));
}

export async function humanOf(db: OpsQueryable, unitId: number) {
  const { rows } = await db.query<{
    city_id: string | null;
    satisfaction_milli: number;
    level: number;
    born_at_ms: string;
    lifespan_ms: string;
    rebirths: number;
    stats: number[] | null;
    elements: number[] | null;
  }>(
    "select city_id, satisfaction_milli, level, born_at_ms, lifespan_ms, rebirths, stats, elements from world_humans where unit_id = $1",
    [unitId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    cityId: num(row.city_id),
    satisfactionMilli: row.satisfaction_milli,
    level: row.level,
    bornAtMs: Number(row.born_at_ms),
    lifespanMs: Number(row.lifespan_ms),
    rebirths: row.rebirths,
    stats: row.stats,
    elements: row.elements,
  };
}

export async function vitalsOf(db: OpsQueryable, unitId: number) {
  const { rows } = await db.query<Record<string, string>>(
    "select hp, max_hp, armor, max_armor, shield, max_shield from unit_vitals where unit_id = $1",
    [unitId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    hp: Number(row.hp),
    maxHp: Number(row.max_hp),
    armor: Number(row.armor),
    maxArmor: Number(row.max_armor),
    shield: Number(row.shield),
    maxShield: Number(row.max_shield),
  };
}

export interface FactionSqlRow {
  id: string;
  kind: "npc" | "player";
  code: string | null;
  parent_id: string | null;
  regime: string;
  fixed: boolean;
  tech_level: number;
  dissolved_at_ms: string | null;
  traits: number[] | null;
  research_progress: number;
  ai_step: number;
  born_of: string | null;
  rebel_of: string | null;
  cities: string;
  humans: string;
  members: string;
  wars: string;
  truces: string;
  vassals: string;
  housing: string;
  satisfaction: string | null;
  owner_id: string | null;
}

const FACTION_SELECT = `
  select f.id, f.kind, f.code, f.parent_id, f.regime, f.fixed, f.tech_level, f.dissolved_at_ms, f.traits,
         f.research_progress, f.ai_step, f.born_of, f.rebel_of,
         (select count(*) from world_cities c where c.faction_id = f.id) as cities,
         (select count(*) from world_humans h join world_cities c on c.id = h.city_id where c.faction_id = f.id) as humans,
         (select count(*) from faction_members m where m.faction_id = f.id) as members,
         (select count(*) from faction_wars w where (w.faction_a = f.id or w.faction_b = f.id) and w.state = 'war') as wars,
         (select count(*) from faction_wars w where (w.faction_a = f.id or w.faction_b = f.id) and w.state = 'truce') as truces,
         (select count(*) from factions v where v.parent_id = f.id and v.dissolved_at_ms is null) as vassals,
         (select coalesce(sum(c.housing), 0) from world_cities c where c.faction_id = f.id) as housing,
         (select round(avg(h.satisfaction_milli)) from world_humans h join world_cities c on c.id = h.city_id
           where c.faction_id = f.id) as satisfaction,
         o.id as owner_id
    from factions f
    left join world_owners o on o.faction_id = f.id`;

export async function listFactions(
  db: OpsQueryable,
  input: { kind: "all" | "npc" | "player"; includeDissolved: boolean },
): Promise<FactionSqlRow[]> {
  const where: string[] = [];
  if (input.kind !== "all") where.push(`f.kind = '${input.kind === "npc" ? "npc" : "player"}'`);
  if (!input.includeDissolved) where.push("f.dissolved_at_ms is null");
  const filter = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const { rows } = await db.query<FactionSqlRow>(`${FACTION_SELECT} ${filter} order by f.id limit 1000`);
  return rows;
}

export async function findFaction(db: OpsQueryable, factionId: number): Promise<FactionSqlRow | undefined> {
  const { rows } = await db.query<FactionSqlRow>(`${FACTION_SELECT} where f.id = $1`, [factionId]);
  return rows[0];
}

export async function factionMembers(
  db: OpsQueryable,
  factionId: number,
): Promise<{ id: string; loginId: string }[]> {
  const { rows } = await db.query<{ id: string; name: string }>(
    `select u.id, u.name from users u
      where u.id in (select user_id from faction_members where faction_id = $1
                     union select user_id from cyborgs where faction_id = $1)
      order by u.username limit 500`,
    [factionId],
  );
  return rows.map((row) => ({ id: row.id, loginId: row.name }));
}

export async function factionWars(db: OpsQueryable, factionId: number) {
  const { rows } = await db.query<{
    other: string;
    code: string | null;
    state: "war" | "truce";
    at_ms: string;
  }>(
    `select case when w.faction_a = $1 then w.faction_b else w.faction_a end as other, f.code, w.state, w.at_ms
       from faction_wars w
       join factions f on f.id = case when w.faction_a = $1 then w.faction_b else w.faction_a end
      where w.faction_a = $1 or w.faction_b = $1
      order by w.state, other`,
    [factionId],
  );
  return rows.map((row) => ({
    otherId: Number(row.other),
    otherCode: row.code,
    state: row.state,
    atMs: Number(row.at_ms),
  }));
}

interface CitySqlRow {
  id: string;
  name: string | null;
  faction_id: string;
  faction_code: string | null;
  planet_id: string;
  map_key: string;
  cell_x: number;
  cell_y: number;
  start: boolean;
  housing: number;
  humans: string;
  development: number;
  admin_level: number;
  research_level: number;
  necessities_pm: number | null;
  mayor_unit_id: string | null;
}

export async function listCities(
  db: OpsQueryable,
  input: { factionId?: number | undefined; search: string },
): Promise<(Omit<OpsCityRow, "factionName"> & { factionCode: string | null })[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (input.factionId !== undefined) {
    values.push(input.factionId);
    where.push(`c.faction_id = $${values.length}`);
  }
  if (input.search) {
    values.push(`%${likeEscape(input.search)}%`);
    where.push(`c.name ilike $${values.length}`);
  }
  const filter = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const { rows } = await db.query<CitySqlRow>(
    `select c.id, c.name, c.faction_id, f.code as faction_code, c.planet_id, c.map_key, c.cell_x, c.cell_y, c.start,
            c.housing, (select count(*) from world_humans h where h.city_id = c.id) as humans, c.development,
            c.admin_level, c.research_level, c.necessities_pm, c.mayor_unit_id
       from world_cities c join factions f on f.id = c.faction_id
       ${filter} order by c.id limit 1000`,
    values,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    factionId: Number(row.faction_id),
    factionCode: row.faction_code,
    planetId: row.planet_id,
    mapKey: Number(row.map_key),
    cellX: row.cell_x,
    cellY: row.cell_y,
    start: row.start,
    housing: row.housing,
    humans: Number(row.humans),
    development: row.development,
    adminLevel: row.admin_level,
    researchLevel: row.research_level,
    necessitiesPm: row.necessities_pm,
    mayorUnitId: num(row.mayor_unit_id),
  }));
}

/** 소유 주체 → 이름표 재료(유저 아이디·세력 코드) */
export async function ownerLabels(
  db: OpsQueryable,
  ownerIds: readonly number[],
): Promise<
  Map<
    number,
    { kind: "user" | "faction" | null; loginId: string | null; factionId: number | null; code: string | null }
  >
> {
  const result = new Map<
    number,
    { kind: "user" | "faction" | null; loginId: string | null; factionId: number | null; code: string | null }
  >();
  if (ownerIds.length === 0) return result;
  const { rows } = await db.query<{
    id: string;
    user_id: string | null;
    faction_id: string | null;
    name: string | null;
    code: string | null;
  }>(
    `select o.id, o.user_id, o.faction_id, u.name, f.code
       from world_owners o left join users u on u.id = o.user_id left join factions f on f.id = o.faction_id
      where o.id = any($1::bigint[])`,
    [ownerIds],
  );
  for (const row of rows)
    result.set(Number(row.id), {
      kind: row.user_id !== null ? "user" : row.faction_id !== null ? "faction" : null,
      loginId: row.name,
      factionId: num(row.faction_id),
      code: row.code,
    });
  return result;
}

export interface AuditFilter {
  /** 동작 이름 앞부분(비우면 모두) */
  action: string;
  /** 동작 이름 앞부분 목록(분류 거르기, @terra/shared AUDIT_CATEGORIES). 비우면 모두. action과 함께 주면 둘 다 맞아야 한다 */
  prefixes?: readonly string[] | undefined;
  actorId?: string | undefined;
  targetId?: string | undefined;
  /** 한 사람 아이디 일부(대소문자 무시) */
  actorSearch?: string | undefined;
  /** 대상 계정 아이디 일부(대소문자 무시) */
  targetSearch?: string | undefined;
  /** 이 ID보다 작은 것(다음 쪽) */
  beforeId?: number | undefined;
  limit: number;
}

/** LIKE 특수 글자(\ % _)를 글자로 */
function likeEscape(value: string): string {
  return value.replaceAll(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listAudit(db: OpsQueryable, filter: AuditFilter): Promise<OpsAuditRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter.action) {
    values.push(`${likeEscape(filter.action)}%`);
    where.push(`a.action like $${values.length}`);
  }
  if (filter.prefixes && filter.prefixes.length > 0) {
    values.push(filter.prefixes.map((prefix) => `${likeEscape(prefix)}%`));
    where.push(`a.action like any($${values.length}::text[])`);
  }
  if (filter.actorId) {
    values.push(filter.actorId);
    where.push(`a.actor_id = $${values.length}`);
  }
  if (filter.targetId) {
    values.push(filter.targetId);
    where.push(`a.target_id = $${values.length}`);
  }
  if (filter.actorSearch) {
    values.push(`%${likeEscape(filter.actorSearch)}%`);
    where.push(`u.username ilike $${values.length}`);
  }
  if (filter.targetSearch) {
    values.push(`%${likeEscape(filter.targetSearch)}%`);
    where.push(`t.username ilike $${values.length}`);
  }
  if (filter.beforeId !== undefined) {
    values.push(filter.beforeId);
    where.push(`a.id < $${values.length}`);
  }
  values.push(filter.limit);
  const { rows } = await db.query<{
    id: string;
    at: Date;
    actor_kind: string;
    actor_id: string | null;
    actor_name: string | null;
    action: string;
    target_id: string | null;
    target_name: string | null;
    before: unknown;
    after: unknown;
    meta: unknown;
    ip: string | null;
  }>(
    `select a.id, a.at, a.actor_kind, a.actor_id, u.name as actor_name, a.action, a.target_id, t.name as target_name,
            a.before, a.after, a.meta, a.ip
       from audit_log a left join users u on u.id = a.actor_id left join users t on t.id = a.target_id
       ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
      order by a.id desc limit $${values.length}`,
    values,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    at: row.at.toISOString(),
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    actorLoginId: row.actor_name,
    action: row.action,
    targetId: row.target_id,
    targetLoginId: row.target_name,
    before: row.before,
    after: row.after,
    meta: row.meta,
    ip: row.ip,
  }));
}

/** 현황판의 DB 수(한 질의) */
export async function overviewCounts(db: OpsQueryable) {
  const { rows } = await db.query<Record<string, string>>(`
    select
      (select count(*) from users) as users,
      (select count(*) from users where banned) as banned_users,
      (select count(*) from world_presence where offline_since_ms is null) as online,
      (select count(*) from cyborgs) as cyborgs,
      (select count(*) from factions where kind = 'npc' and dissolved_at_ms is null) as factions_npc,
      (select count(*) from factions where kind = 'player' and dissolved_at_ms is null) as factions_player,
      (select count(*) from world_cities) as cities,
      (select count(*) from world_humans) as humans,
      (select count(*) from world_buildings) as buildings,
      (select count(*) from faction_wars where state = 'war') as wars,
      (select count(*) from client_errors where received_at > now() - interval '24 hours') as client_errors,
      (select count(*) from audit_log where at > now() - interval '24 hours') as audit,
      (select count(*) from users where created_at > now() - interval '24 hours') as signups`);
  const row = rows[0] ?? {};
  const n = (key: string): number => Number(row[key] ?? 0);
  return {
    counts: {
      users: n("users"),
      bannedUsers: n("banned_users"),
      online: n("online"),
      cyborgs: n("cyborgs"),
      factionsNpc: n("factions_npc"),
      factionsPlayer: n("factions_player"),
      cities: n("cities"),
      humans: n("humans"),
      buildings: n("buildings"),
      wars: n("wars"),
    },
    recent: { clientErrors24h: n("client_errors"), audit24h: n("audit"), signups24h: n("signups") },
  };
}

/** 최근 거래 window개 안에서 금액(절댓값)이 큰 항목 */
export async function largeEntries(
  db: OpsQueryable,
  input: { asset: string; window: number; limit: number },
) {
  const { rows } = await db.query<{
    tx_id: string;
    kind: string;
    at_ms: string;
    asset: string;
    owner_id: string | null;
    amount: string;
  }>(
    `with recent as (select id, kind, at_ms from ledger_transactions order by id desc limit $1)
     select r.id as tx_id, r.kind, r.at_ms, a.asset, a.owner_id, e.amount
       from recent r join ledger_entries e on e.tx_id = r.id join ledger_accounts a on a.id = e.account_id
      where a.owner_id is not null and ($2 = '' or a.asset = $2)
      order by abs(e.amount) desc, r.id desc limit $3`,
    [input.window, input.asset, input.limit],
  );
  return rows.map((row) => ({
    txId: Number(row.tx_id),
    kind: row.kind,
    atMs: Number(row.at_ms),
    asset: row.asset,
    ownerId: num(row.owner_id),
    amount: row.amount,
  }));
}

export async function operatorTransactions(db: OpsQueryable, limit: number) {
  const { rows } = await db.query<{
    id: string;
    kind: string;
    at_ms: string;
    idempotency_key: string | null;
  }>(
    "select id, kind, at_ms, idempotency_key from ledger_transactions where kind in ('ops_grant', 'ops_revoke') order by id desc limit $1",
    [limit],
  );
  return rows.map((row) => ({
    txId: Number(row.id),
    kind: row.kind,
    atMs: Number(row.at_ms),
    key: row.idempotency_key,
  }));
}

// ── 계정 통제 ──

/** 세션을 모두 지운다(강제 로그아웃). 지운 수. 열린 WebSocket은 세션 조회 캐시가 끝나면(SOCKET_VIEWER_TTL_MS) 끊긴 사용자로 본다 */
export async function revokeSessions(db: OpsQueryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ id: string }>("delete from sessions where user_id = $1 returning id", [
    userId,
  ]);
  return rows.length;
}

/** 정지·해제. expires = null이면 기한 없음. 정지하면 세션도 지운다. 바뀐 줄이 없으면 false(계정 없음) */
export async function setBan(
  db: OpsQueryable,
  input: { userId: string; banned: boolean; reason: string | null; expires: Date | null },
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    "update users set banned = $2, ban_reason = $3, ban_expires = $4, updated_at = now() where id = $1 returning id",
    [input.userId, input.banned, input.banned ? input.reason : null, input.banned ? input.expires : null],
  );
  if (rows.length === 0) return false;
  if (input.banned) await revokeSessions(db, input.userId);
  return true;
}

export async function setOpsGrants(
  db: OpsQueryable,
  input: { userId: string; permissions: readonly string[]; actorId: string; nowMs: number },
): Promise<void> {
  await db.query(
    `insert into ops_grants (user_id, permissions, updated_at_ms, updated_by) values ($1, $2, $3, $4)
     on conflict (user_id) do update set permissions = excluded.permissions, updated_at_ms = excluded.updated_at_ms,
       updated_by = excluded.updated_by`,
    [input.userId, input.permissions, input.nowMs, input.actorId],
  );
}

export async function userExists(
  db: OpsQueryable,
  userId: string,
): Promise<{ roles: Role[]; loginId: string } | undefined> {
  const { rows } = await db.query<{ role: string; name: string }>(
    "select role, name from users where id = $1",
    [userId],
  );
  const row = rows[0];
  return row ? { roles: parseRoleString(row.role), loginId: row.name } : undefined;
}

export async function writeOpsAudit(
  db: OpsQueryable,
  entry: {
    actorId: string;
    ip: string | null;
    action: string;
    targetId: string | null;
    before?: unknown;
    after?: unknown;
    meta?: unknown;
  },
): Promise<void> {
  await db.query(
    `insert into audit_log (actor_kind, actor_id, action, target_id, before, after, ip, meta)
     values ('admin', $1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorId,
      entry.action,
      entry.targetId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.ip,
      entry.meta === undefined ? null : JSON.stringify(entry.meta),
    ],
  );
}
