// 부팅 복구의 DB 읽기 — docs/adr/2026-10-31-s3-server-stage.md 2절
// 쓰기 대기열이 돌기 전에 한 번 부른다. int8은 pg가 문자열로 주므로 여기서 숫자(시각·ID)·BigInt(금액)로 바꾼다.
import { SIZE_SMALL, type Rotation, type SizeClass, isSizeClass } from "@terra/sim";
import { DEFAULT_WORLD_PLANET_ID, WORLD_DOMAINS, type WorldDomain } from "../../db/schema.ts";
import type { BuildingRow, UnitRow } from "../secondMap.ts";
import { TEST_NPC_FACTION_CODE } from "../unitKinds.ts";

/** pg Pool에서 쓰는 것만 */
export interface QueryPool {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface OwnerRow {
  id: number;
  userId: string | null;
  factionId: number | null;
  settledAtMs: number;
  upkeepArrears: number;
}

export interface AccountRow {
  id: number;
  ownerId: number | null;
  systemCode: string | null;
  asset: string;
  balance: bigint;
}

export interface LoadedWorld {
  /** 지난 서버의 마지막 생존 시각. 처음 켜면 null */
  lastAliveMs: number | null;
  owners: OwnerRow[];
  units: UnitRow[];
  buildings: BuildingRow[];
  accounts: AccountRow[];
  /** 표마다 가장 큰 ID(없으면 0). 새 ID는 그다음부터 센다 */
  maxIds: { owner: number; unit: number; building: number; account: number; tx: number };
  /** 접속 중으로 남아 있어 끊긴 것으로 고친 사용자 수 */
  presenceFixed: number;
  /** 고친 뒤의 접속 상태(모두 끊김) */
  presence: { userId: string; offlineSinceMs: number | null }[];
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
/** DB 검사 조건이 1~3만 받는다. 그래도 틀리면 일반 등급으로 읽는다 */
const toSize = (value: unknown): SizeClass => {
  const size = num(value);
  return isSizeClass(size) ? size : SIZE_SMALL;
};
/** DB 검사 조건이 네 값만 받는다. 그래도 틀리면 육지로 읽는다 */
const toDomain = (value: unknown): WorldDomain => WORLD_DOMAINS.find((domain) => domain === value) ?? "land";
const toPlanet = (value: unknown): string => (typeof value === "string" ? value : DEFAULT_WORLD_PLANET_ID);
const toRotation = (value: unknown): Rotation => {
  const rotation = num(value);
  return rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
};

/** 시험 NPC 세력과 그 소유 주체를 (없으면 만들고) 소유 주체 ID를 돌려준다 */
export async function ensureTestNpcOwner(pool: QueryPool, nowMs: number): Promise<number> {
  await pool.query(`insert into factions (kind, code) values ('npc', $1) on conflict (code) do nothing`, [
    TEST_NPC_FACTION_CODE,
  ]);
  const faction = await pool.query(`select id from factions where code = $1`, [TEST_NPC_FACTION_CODE]);
  const factionId = num(faction.rows[0]?.id);
  const found = await pool.query(`select id from world_owners where faction_id = $1`, [factionId]);
  if (found.rows[0]) return num(found.rows[0].id);
  const inserted = await pool.query(
    `insert into world_owners (id, faction_id, settled_at_ms)
     select coalesce(max(id), 0) + 1, $1, $2 from world_owners returning id`,
    [factionId, nowMs],
  );
  return num(inserted.rows[0]?.id);
}

export async function loadWorld(pool: QueryPool, nowMs: number): Promise<LoadedWorld> {
  const heartbeat = await pool.query(`select alive_at_ms from world_heartbeat where id = 1`);
  const lastAliveMs = numOrNull(heartbeat.rows[0]?.alive_at_ms);
  // kill -9는 끊김을 적을 틈이 없다 → 접속 중으로 남은 사용자는 지난 생존 시각에 끊긴 것으로 친다(불변 조건 I8)
  const fixedAt = lastAliveMs ?? nowMs;
  const fixed = await pool.query(
    `update world_presence set offline_since_ms = $1, updated_at_ms = $1 where offline_since_ms is null returning user_id`,
    [fixedAt],
  );

  const presence = await pool.query(`select user_id, offline_since_ms from world_presence`);
  const owners = await pool.query(
    `select id, user_id, faction_id, settled_at_ms, upkeep_arrears from world_owners`,
  );
  const units = await pool.query(
    `select id, owner_id, kind, size, speed, map_key, planet_id, domain, path, depart_at_ms, wake_at_ms, ai_step,
            job, job_phase, job_progress_ms, fatigue from world_units`,
  );
  const buildings = await pool.query(
    `select id, map_key, planet_id, domain, owner_id, x, y, width, height, rotation from world_buildings`,
  );
  const accounts = await pool.query(`select id, owner_id, system_code, asset, balance from ledger_accounts`);
  const max = await pool.query(
    `select (select max(id) from world_owners) as owner, (select max(id) from world_units) as unit,
            (select max(id) from world_buildings) as building, (select max(id) from ledger_accounts) as account,
            (select max(id) from ledger_transactions) as tx`,
  );
  const maxRow = max.rows[0] ?? {};

  return {
    lastAliveMs,
    presenceFixed: fixed.rows.length,
    presence: presence.rows.map((row) => ({
      userId: String(row.user_id),
      offlineSinceMs: numOrNull(row.offline_since_ms),
    })),
    owners: owners.rows.map((row) => ({
      id: num(row.id),
      userId: typeof row.user_id === "string" ? row.user_id : null,
      factionId: numOrNull(row.faction_id),
      settledAtMs: num(row.settled_at_ms),
      upkeepArrears: num(row.upkeep_arrears),
    })),
    units: units.rows.map((row) => ({
      id: num(row.id),
      ownerId: num(row.owner_id),
      kind: num(row.kind),
      size: toSize(row.size),
      speed: num(row.speed),
      mapKey: num(row.map_key),
      planetId: toPlanet(row.planet_id),
      domain: toDomain(row.domain),
      path: Array.isArray(row.path) ? row.path.map(num) : [],
      departAtMs: num(row.depart_at_ms),
      wakeAtMs: numOrNull(row.wake_at_ms),
      aiStep: num(row.ai_step),
      job: {
        job: num(row.job),
        phase: num(row.job_phase),
        progressMs: num(row.job_progress_ms),
        fatigue: num(row.fatigue),
      },
    })),
    buildings: buildings.rows.map((row) => ({
      id: num(row.id),
      mapKey: num(row.map_key),
      planetId: toPlanet(row.planet_id),
      domain: toDomain(row.domain),
      ownerId: numOrNull(row.owner_id),
      placement: {
        x: num(row.x),
        y: num(row.y),
        width: num(row.width),
        height: num(row.height),
        rotation: toRotation(row.rotation),
      },
    })),
    accounts: accounts.rows.map((row) => ({
      id: num(row.id),
      ownerId: numOrNull(row.owner_id),
      systemCode: typeof row.system_code === "string" ? row.system_code : null,
      asset: String(row.asset),
      balance: BigInt(String(row.balance)),
    })),
    maxIds: {
      owner: num(maxRow.owner ?? 0),
      unit: num(maxRow.unit ?? 0),
      building: num(maxRow.building ?? 0),
      account: num(maxRow.account ?? 0),
      tx: num(maxRow.tx ?? 0),
    },
  };
}
