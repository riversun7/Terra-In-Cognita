// NPC 사회 런타임의 바뀜 저장 — docs/adr/2026-11-01-npc-brain-r5.md 7절
// 거울 세계(SimWorld)를 마지막으로 저장한 모습과 견줘 바뀐 것만 월드 쓰기 대기열에 넣고, 2차맵 유닛(출생·사망·주인)을 맞춘다.
// - 세력 ID(거울) = 소유 주체 ID. 세력 행 ID와는 rowOf로 잇는다. 새 세력은 예비 세력 행(이미 DB에 있음)을 받아 동기로 ID를 얻는다
//   → 같은 처리에서 생긴 원장 계정이 소유 주체를 가리켜도 외래 키가 깨지지 않는다. 예비 행은 처리 뒤 채운다(refillSpares).
// - 새 도시(마을)는 부모 도시 둘레의 빈 자리에 둔다. 출생 = 그 도시 둘레에 봇을 세움, 사망 = 휴먼 행·유닛을 지움.
import { type SimFaction, type SimWorld, traitsToArray } from "@terra/sim";
import type { QueryPool, OwnerRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";

/** 도시 자리(2차맵 칸) */
export interface CityPlace {
  readonly planetId: string;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly foundedAtMs: number;
}

/** 출생 봇을 세우는 도시 둘레 반경(칸) */
const BIRTH_RADIUS_CELLS = 8;
/** 새 마을 자리: 부모 도시에서 떨어진 거리(칸)와 다른 도시와 띄울 거리 */
const TOWN_DISTANCES = [28, 40, 52] as const;
const TOWN_SPACING = 14;
const TOWN_DIRECTIONS = 16;
const MAP_MARGIN = 8;
const MAP_SIZE = 256;

/** 세력 하나의 저장 모습(바뀌었는지 견줄 때) */
function factionSig(f: SimFaction): string {
  return JSON.stringify([
    f.alive,
    f.code,
    f.regime,
    f.overlord,
    f.tech,
    f.research.blueprint,
    f.research.progress,
    traitsToArray(f.traits),
    f.aiStep,
    f.rebelOf,
  ]);
}

export interface NpcPersistOptions {
  readonly world: SimWorld;
  readonly pool: QueryPool;
  readonly writer: WorldWriter;
  readonly owners: Map<number, OwnerRow>;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly nextOwnerId: () => number;
  readonly now: () => number;
  readonly log: { warn(obj: object, message: string): void; error(obj: object, message: string): void };
  readonly seed: number;
}

export interface NpcPersist {
  /** 소유 주체 ID → 세력 행 ID */
  readonly rowOf: Map<number, number>;
  readonly places: Map<number, CityPlace>;
  /** 예비 세력 하나를 받는다(새 세력의 ID). 없으면 소유 주체 ID만(행은 저장할 때 늦게 넣는다) */
  takeSpare(): number;
  /** 예비 세력 행을 n개까지 채운다(DB에 넣고 기다린다) */
  refillSpares(n: number): Promise<void>;
  /** 지금 모습을 저장한 모습으로 친다(부팅 때 DB에서 읽은 그대로인 것) */
  markSaved(day: number): void;
  /** 그 세력을 다음 저장에 다시 쓴다(부팅 때 성향을 새로 굴린 세력) */
  dirtyFaction(id: number): void;
  /** 바뀐 것을 쓰기 대기열에 넣는다. 늦게 넣을 세력 행이 있으면 기다린다 */
  flush(day: number): Promise<{ rows: number; births: number; deaths: number; owners: number }>;
}

export function createNpcPersist(
  o: NpcPersistOptions,
  init: {
    rowOf: Map<number, number>;
    places: Map<number, CityPlace>;
    spares: { rowId: number; ownerId: number }[];
  },
): NpcPersist {
  const { world, writer, maps } = o;
  const rowOf = init.rowOf;
  const places = init.places;
  const spares = [...init.spares];
  const late = new Set<number>();
  const savedFactions = new Map<number, string>();
  const savedCities = new Map<number, string>();
  const savedHumans = new Map<number, { sig: string; owner: number }>();
  const savedWars = new Map<string, string>();
  let savedDay = -1;
  const diedAt = new Map<number, number>();

  const citySig = (id: number): string => {
    const city = world.cities.get(id);
    return city
      ? JSON.stringify([city.owner, city.housing, city.researchLevel, city.development, city.nextRebellionMs])
      : "";
  };

  const humanSig = (id: number): string => {
    const unit = world.units.get(id);
    return unit
      ? JSON.stringify([
          unit.city,
          unit.owner,
          unit.satisfactionMilli,
          unit.bornAtMs,
          unit.lifespanMs,
          unit.rebirths,
        ])
      : "";
  };

  /** 세력 쌍 행(작은 행 ID가 앞) */
  const warRows = (): Map<string, { a: number; b: number; state: "war" | "truce"; atMs: number }> => {
    const out = new Map<string, { a: number; b: number; state: "war" | "truce"; atMs: number }>();
    for (const f of world.factions.values()) {
      if (!f.alive) continue;
      const fRow = rowOf.get(f.id);
      if (fRow === undefined) continue;
      const add = (otherId: number, state: "war" | "truce", atMs: number): void => {
        const oRow = rowOf.get(otherId);
        if (oRow === undefined || !world.factions.get(otherId)?.alive) return;
        const a = Math.min(fRow, oRow);
        const b = Math.max(fRow, oRow);
        const key = `${a}:${b}`;
        if (!out.has(key)) out.set(key, { a, b, state, atMs });
      };
      for (const other of f.wars) add(other, "war", f.lastFight.get(other) ?? o.now());
      for (const [other, until] of f.truces) if (!f.wars.has(other)) add(other, "truce", until);
    }
    return out;
  };

  const mapOfCity = (cityId: number): SecondMap | undefined => {
    const place = places.get(cityId);
    return place ? maps.get(place.mapKey) : undefined;
  };

  /** 새 마을 자리: 부모 세력 첫 도시 둘레, 다른 도시와 띄운 첫 빈 자리(정해진 차례) */
  const placeTown = (cityId: number, ownerId: number): CityPlace | undefined => {
    const owner = world.factions.get(ownerId);
    const anchors = [...(owner?.cities ?? [])]
      .filter((id) => id !== cityId && places.has(id))
      .toSorted((a, b) => a - b)
      .map((id) => places.get(id))
      .filter((p) => p !== undefined);
    // 세운 세력의 도시가 없으면(새 가문) 부모 = 상위 세력·아무 세력 도시
    const fallback = [...places.values()].toSorted((a, b) => a.mapKey - b.mapKey || a.cellX - b.cellX);
    const parentCity =
      anchors[0] ??
      (owner?.overlord !== null && owner?.overlord !== undefined
        ? [...(world.factions.get(owner.overlord)?.cities ?? [])]
            .map((id) => places.get(id))
            .find((p) => p !== undefined)
        : undefined) ??
      fallback[0];
    if (!parentCity) return undefined;
    const taken = [...places.values()].filter((p) => p.mapKey === parentCity.mapKey);
    for (const distance of TOWN_DISTANCES) {
      for (let k = 0; k < TOWN_DIRECTIONS; k++) {
        // 방향은 정수 표(16방위, 1000배)로 정한다
        const [dx, dy] = DIRECTIONS[k] ?? [0, 0];
        const x = parentCity.cellX + Math.trunc((dx * distance) / 1000);
        const y = parentCity.cellY + Math.trunc((dy * distance) / 1000);
        if (x < MAP_MARGIN || y < MAP_MARGIN || x >= MAP_SIZE - MAP_MARGIN || y >= MAP_SIZE - MAP_MARGIN)
          continue;
        if (taken.some((p) => Math.max(Math.abs(p.cellX - x), Math.abs(p.cellY - y)) < TOWN_SPACING))
          continue;
        return {
          planetId: parentCity.planetId,
          mapKey: parentCity.mapKey,
          cellX: x,
          cellY: y,
          foundedAtMs: o.now(),
        };
      }
    }
    return { ...parentCity, foundedAtMs: o.now() };
  };

  const saveOwner = (ownerId: number, rowId: number): void => {
    const owner: OwnerRow = {
      id: ownerId,
      userId: null,
      factionId: rowId,
      settledAtMs: o.now(),
      upkeepArrears: 0,
      upkeepUnpaidAtMs: null,
    };
    o.owners.set(ownerId, owner);
    writer.upsert("owners", {
      id: owner.id,
      user_id: null,
      faction_id: rowId,
      settled_at_ms: owner.settledAtMs,
      upkeep_arrears: 0,
      upkeep_unpaid_at_ms: null,
    });
  };

  const insertSpareRow = async (): Promise<number> => {
    const found = await o.pool.query(
      `insert into factions (kind, dissolved_at_ms) values ('npc', $1) returning id`,
      [o.now()],
    );
    return Number(found.rows[0]?.id);
  };

  return {
    rowOf,
    places,
    takeSpare() {
      const spare = spares.shift();
      if (spare) {
        rowOf.set(spare.ownerId, spare.rowId);
        return spare.ownerId;
      }
      // 예비가 모자라다: 소유 주체 ID만 먼저 주고 행은 저장할 때 넣는다(그 사이 커밋은 외래 키로 실패하고 다시 해 본다)
      const ownerId = o.nextOwnerId();
      late.add(ownerId);
      o.log.warn({ ownerId }, "npc society: no spare faction row, inserting late");
      return ownerId;
    },
    async refillSpares(n) {
      while (spares.length < n) {
        const rowId = await insertSpareRow();
        const ownerId = o.nextOwnerId();
        saveOwner(ownerId, rowId);
        spares.push({ rowId, ownerId });
      }
    },
    dirtyFaction(id) {
      savedFactions.delete(id);
    },
    markSaved(day) {
      for (const f of world.factions.values()) savedFactions.set(f.id, factionSig(f));
      for (const id of world.cities.keys()) savedCities.set(id, citySig(id));
      for (const unit of world.units.values())
        savedHumans.set(unit.id, { sig: humanSig(unit.id), owner: unit.owner });
      for (const [key, row] of warRows()) savedWars.set(key, JSON.stringify(row));
      savedDay = day;
    },
    async flush(day) {
      const count = { rows: 0, births: 0, deaths: 0, owners: 0 };
      // 늦게 넣는 세력 행(예비가 모자랐을 때)
      // Set·Map은 돌면서 지금 항목을 지워도 된다
      for (const ownerId of late) {
        const rowId = await insertSpareRow();
        rowOf.set(ownerId, rowId);
        saveOwner(ownerId, rowId);
        late.delete(ownerId);
      }
      const nowMs = o.now();
      // 세력: 새 세력은 예비 행을 받았다(소유 주체는 그때 저장) → 이름·상태를 고친다
      for (const f of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
        const rowId = rowOf.get(f.id);
        if (rowId === undefined) continue;
        const sig = factionSig(f);
        if (savedFactions.get(f.id) === sig) continue;
        if (!f.alive && !diedAt.has(f.id)) diedAt.set(f.id, nowMs);
        writer.upsert("factionState", {
          id: rowId,
          code: f.code,
          regime: f.regime,
          parent_id: f.overlord === null ? null : (rowOf.get(f.overlord) ?? null),
          tech_level: f.tech,
          tech_blueprint: Math.max(f.tech, f.research.blueprint),
          research_progress: f.research.progress,
          traits: traitsToArray(f.traits),
          ai_step: f.aiStep,
          dissolved_at_ms: f.alive ? null : (diedAt.get(f.id) ?? nowMs),
          rebel_of: f.rebelOf === null ? null : (rowOf.get(f.rebelOf) ?? null),
        });
        savedFactions.set(f.id, sig);
        count.rows += 1;
      }
      // 도시
      for (const [id, city] of [...world.cities].toSorted((a, b) => a[0] - b[0])) {
        let place = places.get(id);
        if (!place) {
          place = placeTown(id, city.owner);
          if (!place) continue;
          places.set(id, place);
        }
        const sig = citySig(id);
        if (savedCities.get(id) === sig) continue;
        const factionRow = rowOf.get(city.owner);
        if (factionRow === undefined) continue;
        writer.upsert("cities", {
          id,
          faction_id: factionRow,
          planet_id: place.planetId,
          map_key: place.mapKey,
          cell_x: place.cellX,
          cell_y: place.cellY,
          start: city.start,
          housing: city.housing,
          research_level: city.researchLevel,
          founded_at_ms: place.foundedAtMs,
          development: city.development,
          next_rebellion_ms: city.nextRebellionMs,
        });
        savedCities.set(id, sig);
        count.rows += 1;
      }
      // 휴먼: 사망 = 거울에서 사라짐 → 휴먼 행·유닛 지움
      for (const id of savedHumans.keys()) {
        if (world.units.has(id)) continue;
        writer.remove("humans", { unit_id: id });
        for (const map of maps.values()) if (map.removeUnit(id)) break;
        savedHumans.delete(id);
        count.deaths += 1;
      }
      for (const unit of [...world.units.values()].toSorted((a, b) => a.id - b.id)) {
        const saved = savedHumans.get(unit.id);
        const sig = humanSig(unit.id);
        if (saved?.sig === sig) continue;
        const existing = saved ? undefined : [...maps.values()].find((map) => map.unitInfo(unit.id));
        if (existing) {
          // 처음 들인 휴먼(이미 2차맵에 있는 시험 봇): 주인만 맞춘다
          existing.setOwner(unit.id, unit.owner);
        } else if (!saved) {
          // 출생: 그 도시 둘레에 봇을 세운다. 설 곳이 없으면 그 휴먼은 없던 것으로 한다
          const place = places.get(unit.city);
          const map = mapOfCity(unit.city);
          if (
            !place ||
            !map ||
            !map.spawnBotNear(unit.id, unit.owner, { x: place.cellX, y: place.cellY }, BIRTH_RADIUS_CELLS)
          ) {
            world.units.delete(unit.id);
            world.factions.get(unit.owner)?.units.delete(unit.id);
            o.log.warn({ unitId: unit.id, cityId: unit.city }, "npc society: no room for a newborn");
            continue;
          }
          count.births += 1;
        } else if (saved.owner !== unit.owner) {
          for (const map of maps.values()) if (map.setOwner(unit.id, unit.owner)) break;
          count.owners += 1;
        }
        writer.upsert("humans", {
          unit_id: unit.id,
          city_id: unit.city,
          satisfaction_milli: Math.max(0, Math.min(100_000, unit.satisfactionMilli)),
          born_at_ms: unit.bornAtMs,
          lifespan_ms: unit.lifespanMs,
          rebirths: unit.rebirths,
        });
        savedHumans.set(unit.id, { sig, owner: unit.owner });
        count.rows += 1;
      }
      // 전쟁·불가침
      const wars = warRows();
      for (const key of savedWars.keys()) {
        if (wars.has(key)) continue;
        const [a, b] = key.split(":").map(Number);
        writer.remove("factionWars", { faction_a: a, faction_b: b });
        savedWars.delete(key);
        count.rows += 1;
      }
      for (const [key, row] of wars) {
        const sig = JSON.stringify(row);
        if (savedWars.get(key) === sig) continue;
        writer.upsert("factionWars", {
          faction_a: row.a,
          faction_b: row.b,
          state: row.state,
          at_ms: row.atMs,
        });
        savedWars.set(key, sig);
        count.rows += 1;
      }
      if (day !== savedDay) {
        writer.upsert("npcSociety", { id: 1, seed: o.seed, day, updated_at_ms: nowMs });
        savedDay = day;
        count.rows += 1;
      }
      return count;
    },
  };
}

/** 16방위 단위 벡터(1000배, 정수 표 — 초월함수를 쓰지 않는다) */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1000, 0],
  [924, 383],
  [707, 707],
  [383, 924],
  [0, 1000],
  [-383, 924],
  [-707, 707],
  [-924, 383],
  [-1000, 0],
  [-924, -383],
  [-707, -707],
  [-383, -924],
  [0, -1000],
  [383, -924],
  [707, -707],
  [924, -383],
];
