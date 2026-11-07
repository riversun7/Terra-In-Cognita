// 세력 화면의 실제 자료 — 로그인한 사용자의 소유 주체(world_owners)·유닛·건물 수·원장 잔고, 세력 소속(factions·faction_members),
// 그 세력의 체제·고정 표시(factions.regime·fixed)와 도시 수(world_cities, R4b). 읽기만 한다.
// - 외교·전쟁·지분 같은 칸은 세계가 아직 돌리지 않아(R5) 읽지 않는다. 도시 수·체제만 있어도 NPC 국가 시민에게 "국가"가 보인다(C8).
// - 점령 칸 = 내 세력이 이기거나 당한 공성 결과(war_outcomes, 기획 D-520 — occupations.ts).
// - 월드가 있으면 읽기 전에 그 사용자 주체를 지금까지 정산하고 쓰기 대기열이 비기를 기다린다(복귀 요약과 같은 방식,
//   src/world/summarySources.ts). 주체를 새로 만들지는 않는다(findOwnerOfUser).
// - 잔고는 위치 없는 계정(화폐 등)만, 0이 아닌 것만 보인다. 금액은 BigInt → 10진 글자.
import {
  type AssetBalance,
  type FactionKind,
  type OccupationRow,
  REGIMES,
  type Regime,
} from "@terra/shared/faction";
import type { World } from "../world/world.ts";
import { readOccupationRows } from "./occupations.ts";

/** pg Pool·Client 모양(query만). 시험은 시험 DB 연결을 넣는다 */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** 내가 든 세력(S3 최소 표에서 읽은 값) */
export interface FactionMembership {
  readonly id: number;
  readonly kind: FactionKind;
  readonly code: string | null;
  /** 위 세력(봉신 관계, factions.parent_id) */
  readonly parent: { readonly id: number; readonly kind: FactionKind; readonly code: string | null } | null;
  readonly joinedAt: number;
  readonly memberCount: number;
  /** 체제(factions.regime, D-217)와 고정 세력 표시(factions.fixed, D-324) */
  readonly regime: Regime;
  readonly fixed: boolean;
  /** 그 세력이 가진 도시 수(world_cities) */
  readonly cityCount: number;
  /** 그 세력 소유 주체의 잔고(국고) */
  readonly treasury: readonly AssetBalance[];
}

export interface FactionReal {
  readonly owner: {
    readonly units: number;
    readonly buildings: number;
    readonly balances: readonly AssetBalance[];
  } | null;
  readonly faction: FactionMembership | null;
  /** 내 세력이 이기거나 당한 공성 결과(D-520, war_outcomes — occupations.ts). 세력이 없으면 null(화면 "곧 열림") */
  readonly occupations?: readonly OccupationRow[] | null;
}

/** 실제 자료가 없을 때(DB·월드 없는 서버) */
export const NO_FACTION_REAL: FactionReal = { owner: null, faction: null };

export interface FactionSource {
  load(userId: string, nowMs: number): Promise<FactionReal>;
}

const asNumber = (value: unknown): number => (typeof value === "string" ? Number(value) : Number(value ?? 0));
const asKind = (value: unknown): FactionKind => (value === "player" ? "player" : "npc");
const asCode = (value: unknown): string | null => (typeof value === "string" ? value : null);
/** DB 검사 조건이 세 값만 받지만, 더 새 버전이 넣은 값이면 기본값(민주주의, 표의 default)으로 읽는다 */
const asRegime = (value: unknown): Regime => REGIMES.find((regime) => regime === value) ?? "democracy";

/** 주체의 위치 없는 계정 잔고(0 아닌 것, 자산 코드 순) */
async function balancesOf(db: Queryable, ownerId: number): Promise<AssetBalance[]> {
  const result = await db.query(
    `select asset, balance::text as balance from ledger_accounts
      where owner_id = $1 and location is null and balance <> 0 order by asset`,
    [ownerId],
  );
  return result.rows.map((row) => ({ asset: String(row.asset), name: null, amount: String(row.balance) }));
}

async function countOf(
  db: Queryable,
  table: "world_units" | "world_buildings",
  ownerId: number,
): Promise<number> {
  const result = await db.query(`select count(*)::int as n from ${table} where owner_id = $1`, [ownerId]);
  return asNumber(result.rows[0]?.n);
}

async function ownerPart(db: Queryable, userId: string): Promise<FactionReal["owner"]> {
  const found = await db.query(`select id from world_owners where user_id = $1`, [userId]);
  const row = found.rows[0];
  if (row === undefined) return null;
  const ownerId = asNumber(row.id);
  const [units, buildings, balances] = await Promise.all([
    countOf(db, "world_units", ownerId),
    countOf(db, "world_buildings", ownerId),
    balancesOf(db, ownerId),
  ]);
  return { units, buildings, balances };
}

async function factionPart(db: Queryable, userId: string): Promise<FactionMembership | null> {
  const found = await db.query(
    `select f.id, f.kind, f.code, f.regime, f.fixed, m.joined_at,
            p.id as parent_id, p.kind as parent_kind, p.code as parent_code,
            (select count(*)::int from faction_members x where x.faction_id = f.id) as members,
            (select count(*)::int from world_cities c where c.faction_id = f.id) as cities,
            (select o.id from world_owners o where o.faction_id = f.id) as owner_id
       from faction_members m
       join factions f on f.id = m.faction_id
       left join factions p on p.id = f.parent_id
      where m.user_id = $1`,
    [userId],
  );
  const row = found.rows[0];
  if (row === undefined) return null;
  const ownerId = row.owner_id === null || row.owner_id === undefined ? null : asNumber(row.owner_id);
  const treasury = ownerId === null ? [] : await balancesOf(db, ownerId);
  const joined = row.joined_at instanceof Date ? row.joined_at.getTime() : Date.parse(String(row.joined_at));
  return {
    id: asNumber(row.id),
    kind: asKind(row.kind),
    code: asCode(row.code),
    parent:
      row.parent_id === null || row.parent_id === undefined
        ? null
        : { id: asNumber(row.parent_id), kind: asKind(row.parent_kind), code: asCode(row.parent_code) },
    joinedAt: Number.isFinite(joined) ? joined : 0,
    memberCount: asNumber(row.members),
    regime: asRegime(row.regime),
    fixed: row.fixed === true,
    cityCount: asNumber(row.cities),
    treasury,
  };
}

/** DB에서 실제 자료를 읽는다(시험이 바로 부른다) */
export async function readFactionReal(db: Queryable, userId: string): Promise<FactionReal> {
  const [owner, faction] = await Promise.all([ownerPart(db, userId), factionPart(db, userId)]);
  const occupations = faction === null ? null : await readOccupationRows(db, faction.id);
  return { owner, faction, occupations };
}

/** 월드(S3 저장)가 있는 서버의 실제 자료 출처 */
export function createWorldFactionSource(world: World): FactionSource {
  return {
    async load(userId, nowMs) {
      const persistence = world.persistence;
      if (!persistence) return NO_FACTION_REAL;
      const ownerId = persistence.settlement.findOwnerOfUser(userId);
      if (ownerId !== undefined) {
        persistence.settlement.settleOwner(ownerId, nowMs);
        await persistence.writer.durable();
      }
      return readFactionReal(persistence.pool, userId);
    },
  };
}
