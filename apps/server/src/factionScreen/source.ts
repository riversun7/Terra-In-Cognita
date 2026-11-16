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
import type { NationEmblemView } from "@terra/shared/nationEditor";
import type { LocalizedName } from "@terra/shared/roster";
import type { World } from "../world/world.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import { loadEmblemHashes } from "../nationEdit/emblems.ts";
import type { NationNameReads } from "../worldMap/reads.ts";
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
  /** 그 세력 지도자 유닛(NPC 국가 지도자 사이보그, 유닛 종류 7 — npc/leaders.ts). 없으면 null */
  readonly leaderUnit?: number | null;
  /** 화면 이름·지도자 이름(팩 국가 프리셋, 이름 출처가 있을 때 — "WP-NPC"). 없으면 null */
  readonly label?: LocalizedName | null;
  readonly leaderName?: LocalizedName | null;
  /** 국가 마크(팩 국가 프리셋의 만든 마크, 이 세계에 올린 그림이 있으면 그 해시 — docs/adr/2026-11-10-nation-editor.md 4절) */
  readonly emblem?: NationEmblemView | null;
  /**
   * 내가 든 가문(나라 안의 가문, D-216 이중 소속 — docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)"). 없으면 null·없음
   */
  readonly house?: { readonly name: string; readonly memberCount: number; readonly head: boolean } | null;
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
            (select o.id from world_owners o where o.faction_id = f.id) as owner_id,
            (select u.id from world_units u join world_owners o on o.id = u.owner_id
              where o.faction_id = f.id and u.kind = $2 order by u.id limit 1) as leader_unit,
            (select c.name from house_members h join cyborgs c on c.user_id = h.user_id
              where h.faction_id = f.id and h.role = 'leader' and f.kind = 'player') as house_leader
       from faction_members m
       join factions f on f.id = m.faction_id
       left join factions p on p.id = f.parent_id
      where m.user_id = $1`,
    [userId, UNIT_KIND_NPC_LEADER],
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
    leaderUnit: row.leader_unit === null || row.leader_unit === undefined ? null : asNumber(row.leader_unit),
    // 플레이어 가문 나라의 지도자 = 그 가문장(질문 2012 답 — 국가 지도자 = 지배 가문의 장). NPC 나라는 withNationNames가 팩 이름을 붙인다
    ...(typeof row.house_leader === "string"
      ? { leaderName: { ko: row.house_leader, en: row.house_leader } }
      : {}),
  };
}

/** 내가 든 가문(가문 이름 = 플레이어가 정한 세력 정체성) */
async function housePart(
  db: Queryable,
  userId: string,
): Promise<{ readonly name: string; readonly memberCount: number; readonly head: boolean } | null> {
  const found = await db.query(
    `select p.name, m.role, (select count(*)::int from house_members x where x.faction_id = m.faction_id) as members
       from house_members m join faction_profiles p on p.faction_id = m.faction_id where m.user_id = $1`,
    [userId],
  );
  const row = found.rows[0];
  if (row === undefined) return null;
  return { name: String(row.name), memberCount: asNumber(row.members), head: row.role === "leader" };
}

/** DB에서 실제 자료를 읽는다(시험이 바로 부른다) */
export async function readFactionReal(db: Queryable, userId: string): Promise<FactionReal> {
  const [owner, nation, house] = await Promise.all([
    ownerPart(db, userId),
    factionPart(db, userId),
    housePart(db, userId),
  ]);
  const faction = nation === null ? null : { ...nation, house };
  const occupations = faction === null ? null : await readOccupationRows(db, faction.id);
  return { owner, faction, occupations };
}

/**
 * 세력에 화면 이름·지도자 이름을 붙인다(팩 국가 프리셋 — "WP-NPC"). 지도자 이름은 지도자 유닛이 있을 때만(없는 지도자의 이름을 보이지 않는다).
 * 이름 출처가 없으면 그대로
 */
export function withNationNames(
  real: FactionReal,
  names: NationNameReads | undefined,
  uploaded?: ReadonlyMap<string, string>,
): FactionReal {
  const faction = real.faction;
  if (!faction || faction.code === null || !names) return real;
  const found = names.nationNames(faction.code);
  return {
    ...real,
    faction: {
      ...faction,
      label: found.name ?? null,
      emblem: found.emblem
        ? {
            spec: found.emblem.spec,
            color: found.emblem.color,
            uploaded: uploaded?.get(found.emblem.preset) ?? null,
          }
        : null,
      leaderName:
        faction.leaderUnit === null || faction.leaderUnit === undefined ? null : (found.leader ?? null),
    },
  };
}

/** 월드(S3 저장)가 있는 서버의 실제 자료 출처. names = 지도 흐름 조회(나라·지도자 이름, 준비 전이면 undefined) */
export function createWorldFactionSource(
  world: World,
  names?: () => Partial<NationNameReads> | undefined,
): FactionSource {
  return {
    async load(userId, nowMs) {
      const persistence = world.persistence;
      if (!persistence) return NO_FACTION_REAL;
      const ownerId = persistence.settlement.findOwnerOfUser(userId);
      if (ownerId !== undefined) {
        persistence.settlement.settleOwner(ownerId, nowMs);
        await persistence.writer.durable();
      }
      const nationNames = names?.()?.nationNames;
      const real = await readFactionReal(persistence.pool, userId);
      // 올린 국가 마크(있을 때만 그림이 먼저). 읽지 못해도 화면은 만든 마크로 뜬다
      const uploaded =
        nationNames && real.faction
          ? await loadEmblemHashes(persistence.pool).catch(() => undefined)
          : undefined;
      return withNationNames(real, nationNames ? { nationNames } : undefined, uploaded);
    },
  };
}
