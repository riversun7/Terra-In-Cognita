// 폐허·복원 사업의 DB 읽기와 거울 세계 차리기(NPC 사회 런타임 부팅) — docs/adr/2026-11-07-ruins-restoration.md
// 폐허 줄(world_ruins)과 낸 값(restoration_contributions)을 읽어 거울 세계의 폐허(SimRuin)와 도시 자리(places, 칸 오염·복원한 도시 자리)를
// 채운다. 세력은 소유 주체 ID로 잇는다(옛 주인·도시가 드는 세력은 세력 행 → 그 세력의 소유 주체, 사라진 세력도 소유 주체는 남는다).
// int8은 pg가 문자열로 주므로 숫자·BigInt로 바꾼다.
import type { SimRuin } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { CityPlace } from "./persist.ts";

export interface RuinRow {
  readonly id: number;
  readonly planetId: string;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  /** 옛 주인 세력의 소유 주체(세력 줄이 없으면 0) */
  readonly formerOwnerId: number;
  readonly ruinedAtMs: number;
  readonly housing: number;
  readonly claimantOwnerId: number | null;
  readonly joinOwnerId: number | null;
  readonly claimedAtMs: number;
  readonly buildingId: number | null;
  readonly goal: bigint | null;
  readonly currency: string | null;
  readonly open: boolean;
  /** 모금 기한(ms, 폐허 2 — 485 다). 0 = 정하지 않음 */
  readonly deadlineMs: number;
  readonly contributions: readonly { readonly ownerId: number; readonly amount: bigint }[];
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
/** int8을 글자로 읽은 값(::text) → BigInt. 글자가 아니면 null */
const bigOrNull = (value: unknown): bigint | null =>
  typeof value === "string" || typeof value === "number" ? BigInt(value) : null;

/** 그 행성의 폐허(ID 차례)와 낸 값 */
export async function loadRuins(pool: QueryPool, planetId: string): Promise<RuinRow[]> {
  const [ruins, contributions] = await Promise.all([
    pool.query(
      `select r.id, r.planet_id, r.map_key, r.cell_x, r.cell_y, fo.id as former_owner_id, r.ruined_at_ms, r.housing,
              r.claimant_owner_id, jo.id as join_owner_id, r.claimed_at_ms, r.government_building_id, r.goal::text as goal,
              r.currency, r.open, r.deadline_ms
       from world_ruins r
       left join world_owners fo on fo.faction_id = r.former_faction_id
       left join world_owners jo on jo.faction_id = r.join_faction_id
       where r.planet_id = $1 order by r.id`,
      [planetId],
    ),
    pool.query(
      `select c.ruin_id, c.owner_id, c.amount::text as amount from restoration_contributions c
       join world_ruins r on r.id = c.ruin_id where r.planet_id = $1 order by c.ruin_id, c.owner_id`,
      [planetId],
    ),
  ]);
  const byRuin = new Map<number, { ownerId: number; amount: bigint }[]>();
  for (const row of contributions.rows) {
    const list = byRuin.get(num(row.ruin_id)) ?? [];
    list.push({ ownerId: num(row.owner_id), amount: bigOrNull(row.amount) ?? 0n });
    byRuin.set(num(row.ruin_id), list);
  }
  return ruins.rows.map((row) => ({
    id: num(row.id),
    planetId: String(row.planet_id),
    mapKey: num(row.map_key),
    cellX: num(row.cell_x),
    cellY: num(row.cell_y),
    formerOwnerId: num(row.former_owner_id ?? 0),
    ruinedAtMs: num(row.ruined_at_ms),
    housing: num(row.housing),
    claimantOwnerId: numOrNull(row.claimant_owner_id),
    joinOwnerId: numOrNull(row.join_owner_id),
    claimedAtMs: num(row.claimed_at_ms ?? 0),
    buildingId: numOrNull(row.government_building_id),
    goal: bigOrNull(row.goal),
    currency: typeof row.currency === "string" ? row.currency : null,
    open: row.open === true,
    deadlineMs: num(row.deadline_ms ?? 0),
    contributions: byRuin.get(num(row.id)) ?? [],
  }));
}

/**
 * 거울 세계 폐허 표를 만들고 자리를 places에 채운다(띄운 2차맵의 폐허만). 주인 칸이 반쯤 빈 줄(직전 판 앱 등)은 주인 없음으로 읽는다
 */
export function ruinsOf(
  rows: readonly RuinRow[],
  places: Map<number, CityPlace>,
  hasMap: (mapKey: number) => boolean,
): Map<number, SimRuin> {
  const out = new Map<number, SimRuin>();
  for (const row of rows) {
    if (!hasMap(row.mapKey)) continue;
    const claimed =
      row.claimantOwnerId !== null && row.joinOwnerId !== null && row.goal !== null && row.currency !== null;
    out.set(row.id, {
      id: row.id,
      formerOwner: row.formerOwnerId,
      ruinedAtMs: row.ruinedAtMs,
      housing: row.housing,
      claimant: claimed ? row.claimantOwnerId : null,
      joinFaction: claimed ? row.joinOwnerId : null,
      claimedAtMs: claimed ? row.claimedAtMs : 0,
      building: claimed ? row.buildingId : null,
      goal: claimed ? (row.goal ?? 0n) : 0n,
      currency: claimed ? (row.currency ?? "") : "",
      open: claimed && row.open,
      deadlineMs: claimed ? row.deadlineMs : 0,
      contributions: new Map(claimed ? row.contributions.map((c) => [c.ownerId, c.amount]) : []),
    });
    places.set(row.id, {
      planetId: row.planetId,
      mapKey: row.mapKey,
      cellX: row.cellX,
      cellY: row.cellY,
      foundedAtMs: row.ruinedAtMs,
    });
  }
  return out;
}
