// NPC 사회 런타임의 바뀜 저장 — docs/adr/2026-11-01-npc-brain-r5.md 7절
// 거울 세계(SimWorld)를 마지막으로 저장한 모습과 견줘 바뀐 것만 월드 쓰기 대기열에 넣고, 2차맵 유닛(출생·사망·주인)을 맞춘다.
// - 세력 ID(거울) = 소유 주체 ID. 세력 행 ID와는 rowOf로 잇는다. 새 세력은 예비 세력 행(이미 DB에 있음)을 받아 동기로 ID를 얻는다
//   → 같은 처리에서 생긴 원장 계정이 소유 주체를 가리켜도 외래 키가 깨지지 않는다. 예비 행은 처리 뒤 채운다(refillSpares).
// - 새 도시(마을)는 부모 도시 둘레의 빈 자리에 둔다. 구인(D-469, 출생 없음) = 그 도시 둘레에 봇을 세움(레벨·스탯·속성은 휴먼 행),
//   사망 = 휴먼 행·유닛을 지움. 도시 주인이 산 구인 카드 칸은 recruit_draws(고용 주체 = 세력 소유 주체)에 쓴다.
// - 정원사(docs/adr/2026-11-01-gardener-r5b.md 5절): 바뀐 칸 오염(0이 되면 지움), 웨이브 줄(예고·전투 ID·결과·종류·보상), 도시 쉬는 시간,
//   npc_society.gardener(모함 칸·유목 부대·세력마다 관계도·명성). 폐허가 된 도시는 도시 행을 지우고(휴먼을 먼저 옮긴 같은 묶음), 노숙 휴먼은 city_id null.
// - 폐허·복원 사업(docs/adr/2026-11-07-ruins-restoration.md)은 ruinsPersist.ts: 폐허 줄·낸 값, 복원하면 같은 ID 도시 행을 다시 쓴다.
import { HOMELESS, type SimFaction, type SimWorld, recruitElementSlots, traitsToArray } from "@terra/sim";
import { type ServerGardener, storedGardenerOf } from "./gardener.ts";
import { createRuinsPersist } from "./ruinsPersist.ts";
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
  /**
   * 도시 이름(world_cities.name, 기획 답 510 다·552 다). 폐허가 되면 폐허 줄에 남기고, 복원되면 같은 ID 도시가 되찾는다. 켤 때 읽은 값이라
   * 실행 중에 세운 마을은 다음 켤 때 이름이 붙는다
   */
  readonly name?: string | undefined;
}

/** 구인 휴먼(봇)을 세우는 도시 둘레 반경(칸) */
const RECRUIT_RADIUS_CELLS = 8;
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
  /** 칸 오염·웨이브의 행성 */
  readonly planetId: string;
  /** 정원사(런타임이 사회 규칙 뒤에 붙인다) */
  readonly gardener: () => ServerGardener | undefined;
  /**
   * 도시 주인(세력 행)이 바뀐 것을 저장할 때(점령·반란·독립 모두 여기를 거친다): 영토 비콘이 도시를 따라간다(D-512 335). 도시 줄과 같은
   * 동기 처리라 같은 커밋에 든다
   */
  readonly onCityOwner?: ((cityId: number, factionRowId: number) => void) | undefined;
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
  flush(day: number): Promise<{ rows: number; recruited: number; deaths: number; owners: number }>;
  /** 폐허·낸 값·복원한 도시 행만 바로 넣는다(동기, 유저 폐허 명령 뒤 — 원장 거래와 같은 쓰기 묶음). 쓴 행 수 */
  flushRuins(): number;
}

/** 웨이브 줄의 저장 모습(바뀌었는지 견줄 때) */
const waveSig = (wave: { state: string; battleId: number | null; arriveAtMs: number }): string =>
  JSON.stringify([wave.state, wave.battleId, wave.arriveAtMs]);

/** 웨이브 줄에 쓰는 칸 */
interface WaveFields {
  readonly id: number;
  readonly city: number;
  readonly faction: number;
  readonly strength: number;
  readonly physical: number;
  readonly createdAtMs: number;
  readonly arriveAtMs: number;
  readonly battleId: number | null;
  /** 도시 웨이브 | 보호 레이드(정원사 2) */
  readonly kind: "city" | "protection";
}

/** 끝난 웨이브의 결과 → 줄 상태 */
const resolvedState = (outcome: string): string =>
  outcome === "damaged" || outcome === "ruined" ? "won" : outcome === "repelled" ? "repelled" : "disbanded";

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
  /** 도시 → 저장한 세력 행(주인이 바뀌었나 견줄 때) */
  const savedOwners = new Map<number, number>();
  const savedDraws = new Map<number, string>();
  const savedHumans = new Map<number, { sig: string; owner: number }>();
  const savedWars = new Map<string, string>();
  let savedDay = -1;
  const savedPollution = new Map<number, number>();
  const savedWaves = new Map<number, string>();
  let savedGardener = "";
  const diedAt = new Map<number, number>();

  const citySig = (id: number): string => {
    const city = world.cities.get(id);
    return city
      ? JSON.stringify([
          city.owner,
          city.housing,
          city.researchLevel,
          city.development,
          city.nextRebellionMs,
          o.gardener()?.run.cooldownUntil.get(id) ?? 0,
          city.adminLevel,
        ])
      : "";
  };

  /** 도시 주인이 산 구인 카드 칸의 저장 모습(없으면 빈 문자열) */
  const drawSig = (id: number): string => {
    const draw = world.cities.get(id)?.recruitDraw;
    return draw ? JSON.stringify([draw.hirer, draw.window, draw.taken]) : "";
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
          unit.recruit?.level ?? 1,
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
    // 자리가 없으면 부모 도시 자리에(이름은 물려받지 않는다 — 다음 켤 때 붙는다)
    return { ...parentCity, foundedAtMs: o.now(), name: undefined };
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

  const waveRow = (
    wave: WaveFields,
    state: string,
    resolvedAtMs: number | null,
    reward: string | null = null,
  ) => ({
    id: wave.id,
    planet_id: o.planetId,
    city_id: wave.city,
    cell_key: places.get(wave.city)?.mapKey ?? 0,
    faction_id: rowOf.get(wave.faction) ?? null,
    strength: wave.strength,
    physical: wave.physical,
    created_at_ms: wave.createdAtMs,
    arrive_at_ms: wave.arriveAtMs,
    state,
    battle_id: wave.battleId,
    resolved_at_ms: resolvedAtMs,
    kind: wave.kind,
    reward,
  });

  /** 정원사 바뀜: 칸 오염(바뀐 칸만, 0이면 지움), 진군·전투 중인 웨이브, 끝난 웨이브의 결과 */
  const flushGardener = (gardener: ServerGardener, nowMs: number): number => {
    let rows = 0;
    const layer = gardener.run.layer();
    for (const [cell, value] of layer) {
      if (savedPollution.get(cell) === value) continue;
      writer.upsert("pollution", { planet_id: o.planetId, cell_key: cell, value, updated_at_ms: nowMs });
      savedPollution.set(cell, value);
      rows += 1;
    }
    for (const cell of savedPollution.keys()) {
      if (layer.has(cell)) continue;
      writer.remove("pollution", { planet_id: o.planetId, cell_key: cell });
      savedPollution.delete(cell);
      rows += 1;
    }
    gardener.takeDirtyWaves();
    for (const wave of [...gardener.run.waves.values()].toSorted((a, b) => a.id - b.id)) {
      const sig = waveSig(wave);
      if (savedWaves.get(wave.id) === sig) continue;
      writer.upsert("gardenerWaves", waveRow(wave, wave.state, null));
      savedWaves.set(wave.id, sig);
      rows += 1;
    }
    for (const done of gardener.run.takeResolved()) {
      writer.upsert(
        "gardenerWaves",
        waveRow(done.wave, resolvedState(done.outcome), done.atMs, gardener.takeRewardRecord(done.wave.id)),
      );
      savedWaves.delete(done.wave.id);
      rows += 1;
    }
    return rows;
  };

  /** 도시 행 하나를 쓴다(바뀌었을 때만, 새 마을은 자리부터). 쓴 행 수 */
  const saveCity = (id: number): number => {
    const city = world.cities.get(id);
    if (!city) return 0;
    let place = places.get(id);
    if (!place) {
      place = placeTown(id, city.owner);
      if (!place) return 0;
      places.set(id, place);
    }
    const sig = citySig(id);
    if (savedCities.get(id) === sig) return 0;
    const factionRow = rowOf.get(city.owner);
    if (factionRow === undefined) return 0;
    writer.upsert("cities", {
      wave_cooldown_until_ms: o.gardener()?.run.cooldownUntil.get(id) ?? 0,
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
      admin_level: city.adminLevel,
    });
    savedCities.set(id, sig);
    // 주인이 바뀌었으면 그 도시의 영토 비콘도 넘어간다(D-512 335, 같은 묶음)
    if (savedOwners.get(id) !== factionRow) {
      if (savedOwners.has(id)) o.onCityOwner?.(id, factionRow);
      savedOwners.set(id, factionRow);
    }
    return 1;
  };
  const ruins = createRuinsPersist({ world, writer, places, rowOf, saveCity });

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
      for (const [id, city] of world.cities) {
        savedCities.set(id, citySig(id));
        savedDraws.set(id, drawSig(id));
        const row = rowOf.get(city.owner);
        if (row !== undefined) savedOwners.set(id, row);
      }
      for (const unit of world.units.values())
        savedHumans.set(unit.id, { sig: humanSig(unit.id), owner: unit.owner });
      for (const [key, row] of warRows()) savedWars.set(key, JSON.stringify(row));
      savedDay = day;
      ruins.markSaved();
      const gardener = o.gardener();
      if (gardener) {
        for (const [cell, value] of gardener.run.layer()) savedPollution.set(cell, value);
        for (const wave of gardener.run.waves.values()) savedWaves.set(wave.id, waveSig(wave));
      }
    },
    flushRuins: () => ruins.flush(o.now()),
    async flush(day) {
      const count = { rows: 0, recruited: 0, deaths: 0, owners: 0 };
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
      // 폐허·복원 사업(복원한 도시 행은 자리의 세운 시각을 고친 뒤 여기서 먼저 쓴다)
      count.rows += ruins.flush(nowMs);
      // 도시
      for (const [id] of [...world.cities].toSorted((a, b) => a[0] - b[0])) count.rows += saveCity(id);
      // 폐허가 된 도시(웨이브, D-464 217): 도시 행을 지운다. 그 도시 휴먼은 아래에서 옮긴 도시·노숙으로 먼저 고친다(같은 묶음,
      // 쓰기 대기열은 고치기를 먼저, 지우기를 나중에 한다). 자리(places)는 남긴다(칸 오염의 칸)
      for (const id of savedCities.keys()) {
        if (world.cities.has(id)) continue;
        writer.remove("cities", { id });
        savedCities.delete(id);
        savedOwners.delete(id);
        savedDraws.delete(id);
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
          // 구인(D-469): 그 도시 둘레에 봇을 세운다. 설 곳이 없으면 그 휴먼은 없던 것으로 한다(값은 이미 소각됨 — 드묾, 기록만)
          const place = places.get(unit.city);
          const map = mapOfCity(unit.city);
          if (
            !place ||
            !map ||
            !map.spawnBotNear(unit.id, unit.owner, { x: place.cellX, y: place.cellY }, RECRUIT_RADIUS_CELLS)
          ) {
            world.units.delete(unit.id);
            world.factions.get(unit.owner)?.units.delete(unit.id);
            o.log.warn({ unitId: unit.id, cityId: unit.city }, "npc society: no room for a recruit");
            continue;
          }
          count.recruited += 1;
        } else if (saved.owner !== unit.owner) {
          for (const map of maps.values()) if (map.setOwner(unit.id, unit.owner)) break;
          count.owners += 1;
        }
        writer.upsert("humans", {
          unit_id: unit.id,
          city_id: unit.city === HOMELESS ? null : unit.city,
          satisfaction_milli: Math.max(0, Math.min(100_000, unit.satisfactionMilli)),
          born_at_ms: unit.bornAtMs,
          lifespan_ms: unit.lifespanMs,
          rebirths: unit.rebirths,
          level: unit.recruit?.level ?? 1,
          stats: unit.recruit ? [...unit.recruit.stats] : null,
          elements: unit.recruit ? recruitElementSlots(unit.recruit.elements) : null,
        });
        savedHumans.set(unit.id, { sig, owner: unit.owner });
        count.rows += 1;
      }
      // 구인 카드 산 칸(도시 주인 = 고용 주체). 도시 행 다음에 쓴다(쓰기 대기열 차례)
      for (const [id, city] of [...world.cities].toSorted((a, b) => a[0] - b[0])) {
        const draw = city.recruitDraw;
        const sig = drawSig(id);
        if (!draw || savedDraws.get(id) === sig || !rowOf.has(draw.hirer)) continue;
        writer.upsert("recruitDraws", {
          owner_id: draw.hirer,
          city_id: id,
          window_index: draw.window,
          taken: draw.taken,
        });
        savedDraws.set(id, sig);
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
      const gardener = o.gardener();
      const gardenerText = gardener ? storedGardenerOf(gardener.run, gardener.mothershipCell) : null;
      if (day !== savedDay || (gardenerText !== null && gardenerText !== savedGardener)) {
        writer.upsert("npcSociety", {
          id: 1,
          seed: o.seed,
          day,
          updated_at_ms: nowMs,
          gardener: gardenerText,
        });
        savedDay = day;
        if (gardenerText !== null) savedGardener = gardenerText;
        count.rows += 1;
      }
      if (gardener) count.rows += flushGardener(gardener, nowMs);
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
