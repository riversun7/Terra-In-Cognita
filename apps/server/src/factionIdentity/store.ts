// 플레이어 세력 정체성 저장·읽기(표 faction_identities) — docs/adr/2026-11-11-faction-identity.md 3절. SQL만 둔다(규칙은 services.ts).
// - 올린 그림은 그 줄에 한 장(emblem_png)이다. 목록·조회는 그림 바이트를 읽지 않는다(해시·크기만). 그림 길(nationEdit/emblems.ts)이 해시로 읽는다.
// - 세계 스위치 "플레이어 마크 올리기 허용": 표 ops_switches의 줄 player_emblem_block(켜짐 = 막음). 줄이 없으면 꺼짐 = 올릴 수 있다(기본 허용).
import type { FactionIdentityNotice, FactionIdentityView, OpsEmblemRow } from "@terra/shared/factionIdentity";
import {
  EMBLEM_CHARGES,
  EMBLEM_DIVISIONS,
  EMBLEM_SHAPES,
  type NationEmblemSpec,
  normalizeEmblem,
} from "@terra/shared/nationEmblem";
import type { OpsQueryable } from "../ops/access.ts";

export type IdentityQueryable = OpsQueryable;

/** 운영 스위치 줄 ID(켜짐 = 플레이어 그림 올리기를 막는다) */
export const UPLOAD_BLOCK_SWITCH = "player_emblem_block";

/** 그림 바이트를 뺀 열 */
const COLUMNS = `user_id, name, name_key, short_name, color, emblem_shape, emblem_division, emblem_charge, emblem_scheme,
  emblem_sha256, emblem_bytes, emblem_uploaded_at_ms, upload_blocked, notice_kind, notice_reason, notice_at_ms,
  created_at_ms, updated_at_ms, name_changed_at_ms`;

interface RawRow {
  user_id: string;
  name: string;
  name_key: string;
  short_name: string;
  color: string;
  emblem_shape: string;
  emblem_division: string;
  emblem_charge: string;
  emblem_scheme: number;
  emblem_sha256: string | null;
  emblem_bytes: number | null;
  emblem_uploaded_at_ms: string | number | null;
  upload_blocked: boolean;
  notice_kind: string | null;
  notice_reason: string | null;
  notice_at_ms: string | number | null;
  created_at_ms: string | number;
  updated_at_ms: string | number;
  name_changed_at_ms: string | number;
}

export interface IdentityRow {
  readonly userId: string;
  readonly name: string;
  readonly nameKey: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  readonly uploaded: { readonly hash: string; readonly bytes: number; readonly at: number } | null;
  readonly uploadBlocked: boolean;
  readonly notice: FactionIdentityNotice | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly nameChangedAt: number;
}

/** 값이 있을 때만 그 칸을 둔다(exactOptionalPropertyTypes) */
const optional = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
  value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });

/** 목록 안의 값이면 그 값(더 새 판이 넣은 모르는 값은 undefined → 기본 사양) */
const pick = <T extends string>(list: readonly T[], value: string): T | undefined =>
  list.find((entry) => entry === value);

function rowOf(raw: RawRow): IdentityRow {
  return {
    userId: raw.user_id,
    name: raw.name,
    nameKey: raw.name_key,
    shortName: raw.short_name,
    color: raw.color,
    emblem: normalizeEmblem({
      ...optional("shape", pick(EMBLEM_SHAPES, raw.emblem_shape)),
      ...optional("division", pick(EMBLEM_DIVISIONS, raw.emblem_division)),
      ...optional("charge", pick(EMBLEM_CHARGES, raw.emblem_charge)),
      scheme: raw.emblem_scheme,
    }),
    uploaded:
      raw.emblem_sha256 === null
        ? null
        : {
            hash: raw.emblem_sha256,
            bytes: raw.emblem_bytes ?? 0,
            at: Number(raw.emblem_uploaded_at_ms ?? 0),
          },
    uploadBlocked: raw.upload_blocked,
    notice:
      raw.notice_kind === "emblem_removed"
        ? { kind: "emblem_removed", reason: raw.notice_reason, at: Number(raw.notice_at_ms ?? 0) }
        : null,
    createdAt: Number(raw.created_at_ms),
    updatedAt: Number(raw.updated_at_ms),
    nameChangedAt: Number(raw.name_changed_at_ms),
  };
}

export const viewOf = (row: IdentityRow): FactionIdentityView => ({
  name: row.name,
  shortName: row.shortName,
  color: row.color,
  emblem: row.emblem,
  uploaded: row.uploaded?.hash ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export async function loadIdentity(pool: IdentityQueryable, userId: string): Promise<IdentityRow | null> {
  const { rows } = await pool.query<RawRow>(`select ${COLUMNS} from faction_identities where user_id = $1`, [
    userId,
  ]);
  return rows[0] ? rowOf(rows[0]) : null;
}

/** 다른 플레이어 세력이 이 이름·약어를 쓰는가 */
export async function playerTaken(
  pool: IdentityQueryable,
  userId: string,
  nameKey: string,
  shortKey: string,
): Promise<{ name: boolean; short: boolean }> {
  const { rows } = await pool.query<{ name_hit: boolean; short_hit: boolean }>(
    `select
       exists(select 1 from faction_identities where name_key = $2 and user_id <> $1) as name_hit,
       exists(select 1 from faction_identities where lower(short_name) = $3 and user_id <> $1) as short_hit`,
    [userId, nameKey, shortKey],
  );
  return { name: rows[0]?.name_hit === true, short: rows[0]?.short_hit === true };
}

/** NPC 세력 정체성(faction_profiles — 이미 정해진 이름·약어)이 이 이름·약어를 쓰는가. 이름은 빈칸을 빼고 소문자로 견준다 */
export async function profileTaken(
  pool: IdentityQueryable,
  nameKey: string,
  shortKey: string,
): Promise<{ name: boolean; short: boolean }> {
  const { rows } = await pool.query<{ name_hit: boolean; short_hit: boolean }>(
    `select
       exists(select 1 from faction_profiles where lower(replace(name, ' ', '')) = $1) as name_hit,
       exists(select 1 from faction_profiles where lower(short_name) = $2) as short_hit`,
    [nameKey, shortKey],
  );
  return { name: rows[0]?.name_hit === true, short: rows[0]?.short_hit === true };
}

export interface IdentityWrite {
  readonly userId: string;
  readonly name: string;
  readonly nameKey: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  /** keep = 올린 그림 칸을 건드리지 않는다, null = 비운다, 값 = 바꾼다 */
  readonly upload: "keep" | null | { readonly png: Uint8Array; readonly sha256: string };
  readonly nowMs: number;
  /** 이름·약어가 바뀌었나(처음이면 참) */
  readonly renamed: boolean;
}

/** 처음 정한다(insert). 이름·약어가 겹치면 pg 오류(23505)가 난다 — 부르는 쪽이 읽는다 */
export async function insertIdentity(pool: IdentityQueryable, write: IdentityWrite): Promise<void> {
  const upload = write.upload === "keep" ? null : write.upload;
  await pool.query(
    `insert into faction_identities (user_id, name, name_key, short_name, color, emblem_shape, emblem_division,
       emblem_charge, emblem_scheme, emblem_png, emblem_sha256, emblem_bytes, emblem_uploaded_at_ms,
       created_at_ms, updated_at_ms, name_changed_at_ms)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $14)`,
    [
      write.userId,
      write.name,
      write.nameKey,
      write.shortName,
      write.color,
      write.emblem.shape,
      write.emblem.division,
      write.emblem.charge,
      write.emblem.scheme,
      upload ? Buffer.from(upload.png) : null,
      upload?.sha256 ?? null,
      upload?.png.length ?? null,
      upload ? write.nowMs : null,
      write.nowMs,
    ],
  );
}

/** 고친다(update). 그림 칸은 upload가 keep이 아닐 때만 바꾼다 */
export async function updateIdentity(pool: IdentityQueryable, write: IdentityWrite): Promise<void> {
  const values: unknown[] = [
    write.userId,
    write.name,
    write.nameKey,
    write.shortName,
    write.color,
    write.emblem.shape,
    write.emblem.division,
    write.emblem.charge,
    write.emblem.scheme,
    write.nowMs,
    write.renamed,
  ];
  let uploadSql = "";
  if (write.upload !== "keep") {
    const upload = write.upload;
    values.push(
      upload ? Buffer.from(upload.png) : null,
      upload?.sha256 ?? null,
      upload?.png.length ?? null,
      upload ? write.nowMs : null,
    );
    uploadSql = ", emblem_png = $12, emblem_sha256 = $13, emblem_bytes = $14, emblem_uploaded_at_ms = $15";
  }
  await pool.query(
    `update faction_identities set name = $2, name_key = $3, short_name = $4, color = $5, emblem_shape = $6,
       emblem_division = $7, emblem_charge = $8, emblem_scheme = $9, updated_at_ms = $10,
       name_changed_at_ms = case when $11 then $10 else name_changed_at_ms end${uploadSql}
     where user_id = $1`,
    values,
  );
}

/** 알림을 지운다(주인이 확인) */
export async function clearNotice(pool: IdentityQueryable, userId: string): Promise<void> {
  await pool.query(
    `update faction_identities set notice_kind = null, notice_reason = null, notice_at_ms = null where user_id = $1`,
    [userId],
  );
}

/** 세계 스위치: 플레이어 그림 올리기를 막았나(줄이 없으면 막지 않음) */
export async function uploadSwitchBlocked(pool: IdentityQueryable): Promise<boolean> {
  const { rows } = await pool.query<{ enabled: boolean }>("select enabled from ops_switches where id = $1", [
    UPLOAD_BLOCK_SWITCH,
  ]);
  return rows[0]?.enabled === true;
}

export async function setUploadSwitchBlocked(
  pool: IdentityQueryable,
  blocked: boolean,
  actorId: string,
  nowMs: number,
): Promise<void> {
  await pool.query(
    `insert into ops_switches (id, enabled, updated_at_ms, updated_by) values ($1, $2, $3, $4)
     on conflict (id) do update set enabled = excluded.enabled, updated_at_ms = excluded.updated_at_ms,
       updated_by = excluded.updated_by`,
    [UPLOAD_BLOCK_SWITCH, blocked, nowMs, actorId],
  );
}

// ── 운영자 콘솔 "마크 관리" ──

/** 한 번에 보이는 줄 수 상한 */
export const OPS_EMBLEM_LIMIT = 200;

/** 올린 그림이 있는 세력(최근 올린 차례) + 올리기가 막혔거나 내린 알림이 남은 세력 */
export async function listModeration(
  pool: IdentityQueryable,
): Promise<{ rows: OpsEmblemRow[]; total: number }> {
  const found = await pool.query<RawRow & { login_id: string; cyborg_name: string | null }>(
    `select ${COLUMNS.split(",")
      .map((column) => `i.${column.trim()}`)
      .join(", ")}, u.name as login_id, c.name as cyborg_name
       from faction_identities i
       join users u on u.id = i.user_id
       left join cyborgs c on c.user_id = i.user_id
      where i.emblem_sha256 is not null or i.upload_blocked or i.notice_kind is not null
      order by i.emblem_uploaded_at_ms desc nulls last, i.updated_at_ms desc
      limit ${OPS_EMBLEM_LIMIT}`,
  );
  const count = await pool.query<{ n: number }>("select count(*)::int as n from faction_identities");
  return {
    rows: found.rows.map((raw) => {
      const row = rowOf(raw);
      return {
        userId: row.userId,
        loginId: raw.login_id,
        cyborgName: raw.cyborg_name,
        name: row.name,
        shortName: row.shortName,
        color: row.color,
        emblem: row.emblem,
        uploaded: row.uploaded,
        uploadBlocked: row.uploadBlocked,
        notice: row.notice,
      };
    }),
    total: count.rows[0]?.n ?? 0,
  };
}

/** 올린 그림을 내린다(만든 마크로 돌아간다). 내린 해시(올린 그림이 없었으면 null) */
export async function takeDownEmblem(
  pool: IdentityQueryable,
  input: { userId: string; reason: string | null; blockUploads: boolean; nowMs: number },
): Promise<{ sha256: string; bytes: number } | null> {
  const { rows } = await pool.query<{ sha256: string; bytes: number }>(
    `with before as (
       select user_id, emblem_sha256 as sha256, emblem_bytes as bytes from faction_identities
        where user_id = $1 and emblem_sha256 is not null for update
     )
     update faction_identities i set emblem_png = null, emblem_sha256 = null, emblem_bytes = null,
       emblem_uploaded_at_ms = null, notice_kind = 'emblem_removed', notice_reason = $2, notice_at_ms = $3,
       upload_blocked = i.upload_blocked or $4, updated_at_ms = $3
      from before where i.user_id = before.user_id
     returning before.sha256, before.bytes`,
    [input.userId, input.reason, input.nowMs, input.blockUploads],
  );
  return rows[0] ?? null;
}

/** 이 계정의 그림 올리기를 막거나 푼다. 앞 값(줄이 없으면 null) */
export async function setUploadBlocked(
  pool: IdentityQueryable,
  userId: string,
  blocked: boolean,
): Promise<boolean | null> {
  const { rows } = await pool.query<{ before: boolean }>(
    `with before as (select user_id, upload_blocked from faction_identities where user_id = $1 for update)
     update faction_identities i set upload_blocked = $2 from before where i.user_id = before.user_id
     returning before.upload_blocked as before`,
    [userId, blocked],
  );
  return rows[0]?.before ?? null;
}

/** 소유 주체(유저) → 올린 그림 해시·정체성(지도의 유닛 한눈 정보가 쓴다). 정하지 않았으면 null */
export async function identityOfUser(
  pool: IdentityQueryable,
  userId: string,
): Promise<FactionIdentityView | null> {
  const row = await loadIdentity(pool, userId);
  return row ? viewOf(row) : null;
}
