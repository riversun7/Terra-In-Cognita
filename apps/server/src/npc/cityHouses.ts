// NPC 도시의 가문 — 기획 D-569(1744 "도시국가든 도시의 가문들이 존재하며 가문장이 유닛을 고용한다", "Npc는 고용이 아니라 생성")·D-212(NPC도 같은
// 규칙)·46 §1.1 "NPC 가문도 같은 규칙", 질문 1848 답. docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 1847·1848 답)".
// - 가문 수 [임시 질문 2011]: NPC 도시(주인이 플레이어 가문이 아닌 거울 세계 도시)마다 하나. 시장이 처음 생길 때(그 도시에 휴먼이 생길 때) 세운다.
// - 가문장 [임시 질문 2012]: 그 도시 시장(기획 답 744 나, cityPeople.ts — INT + WIS가 큰 휴먼). 저장하지 않고 읽을 때 본다(시장이 바뀌면 가문장도).
// - 이름 [임시 질문 2013]: 세울 때 시장의 성(그 도시 주인 나라의 팩 휴먼 이름 목록 — humanNames.ts, 번역 안 함 D-476). 목록이 없으면 도시 이름.
//   한 번 정하면 그대로다(시장이 바뀌어도). 화면은 "{이름} 가문"·"House {name}"으로 적는다.
// - 나라 = 그 도시의 지금 주인(점령되면 따라간다). 도시가 폐허가 되어도 가문 줄은 남는다(같은 도시 ID로 복원되면 그 가문 [임시 질문 2015]).
// - 소속: NPC 휴먼(거울 세계 휴먼, 주인이 플레이어 가문이 아님)은 생성될 때 사는 도시의 가문에 든다 — 맞추기(sync)마다 가문 없는 휴먼을 그 도시
//   가문에 넣는다. 한 번 들면 그대로다(다른 도시로 옮겨도, 노숙이 되어도 [임시 질문 2016]). 노숙 휴먼은 새로 들지 않는다. 죽은 휴먼은 지운다.
// - 옛 세계(리셋 없음): 켤 때 첫 맞추기가 시장이 있는 NPC 도시마다 가문을 세우고 그 도시 휴먼을 모두 넣는다(멱등 — 이미 든 휴먼·이미 있는 가문은
//   그대로). 플레이어 가문 도시의 휴먼은 그 가문 소유 주체의 유닛이라 넣지 않는다.
// - 부하(NPC 휴먼 수천): 메모리 표 둘(가문 ID → 가문, 유닛 ID → 가문 ID). 맞추기는 휴먼을 한 번 훑고 바뀐 줄만 쓰기 대기열에 넣는다(쓰기 대기열이
//   여러 줄 insert로 묶는다). 켤 때 휴먼 행이 없는 소속 줄(지난 실행이 지우지 못한 죽은 휴먼)을 한 SQL로 지운다.
// 판정에 쓰지 않는다(보이기·집계용 — 한눈 정보의 가문 줄).
import { HOMELESS, type SimCity, type SimFaction, type SimUnit } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

export interface NpcCityHouseRow {
  readonly id: number;
  readonly cityId: number;
  readonly name: string;
  readonly foundedAtMs: number;
}

export interface NpcCityHousesLoaded {
  readonly houses: readonly NpcCityHouseRow[];
  /** 유닛 ID → 가문 ID */
  readonly members: ReadonlyMap<number, number>;
}

/** 휴먼 하나의 NPC 가문(한눈 정보) */
export interface NpcUnitHouse {
  readonly id: number;
  readonly cityId: number;
  readonly name: string;
  /** 그 휴먼이 가문장(그 도시 시장)인가 */
  readonly leader: boolean;
}

export interface NpcCityHouses {
  /** 그 휴먼의 NPC 가문. 없으면 undefined */
  of(unitId: number): NpcUnitHouse | undefined;
  /** 그 도시의 NPC 가문 ID. 없으면 undefined */
  houseOfCity(cityId: number): number | undefined;
  /** 시장이 있는 NPC 도시에 가문을 세우고, 가문 없는 NPC 휴먼을 사는 도시 가문에 넣고, 죽은 휴먼을 뺀다(바뀐 줄만 쓰기 대기열에) */
  sync(nowMs: number): { readonly created: number; readonly joined: number; readonly left: number };
  /** 가문 수·소속 휴먼 수 */
  counts(): { readonly houses: number; readonly members: number };
}

/** 켤 때 한 번: 죽은 휴먼의 소속 줄을 지우고 가문·소속을 읽는다 */
export async function loadNpcCityHouses(pool: QueryPool): Promise<NpcCityHousesLoaded> {
  await pool.query(
    `delete from npc_house_units n where not exists (select 1 from world_humans h where h.unit_id = n.unit_id)`,
  );
  const [houses, members] = await Promise.all([
    pool.query("select id, city_id, name, founded_at_ms from npc_houses order by id"),
    pool.query("select unit_id, house_id from npc_house_units"),
  ]);
  return {
    houses: houses.rows.map((row) => ({
      id: Number(row.id),
      cityId: Number(row.city_id),
      name: String(row.name),
      foundedAtMs: Number(row.founded_at_ms),
    })),
    members: new Map(members.rows.map((row) => [Number(row.unit_id), Number(row.house_id)])),
  };
}

export function createNpcCityHouses(o: {
  /** 거울 세계(쓰는 칸만) */
  readonly world: {
    readonly cities: ReadonlyMap<number, Pick<SimCity, "owner">>;
    readonly units: ReadonlyMap<number, Pick<SimUnit, "id" | "city" | "owner">>;
    readonly factions: ReadonlyMap<number, Pick<SimFaction, "player">>;
  };
  readonly writer: Pick<WorldWriter, "upsert" | "remove">;
  readonly loaded: NpcCityHousesLoaded;
  /** 그 도시 시장(cityPeople.ts). 없으면 undefined */
  readonly mayorOf: (cityId: number) => number | undefined;
  /** 새 가문 이름: 시장의 성(그 도시 주인 나라 목록), 없으면 도시 이름 */
  readonly nameFor: (cityId: number, mayorId: number) => string;
}): NpcCityHouses {
  const houses = new Map<number, NpcCityHouseRow>();
  const byCity = new Map<number, NpcCityHouseRow>();
  for (const row of o.loaded.houses) {
    houses.set(row.id, row);
    byCity.set(row.cityId, row);
  }
  const members = new Map(o.loaded.members);
  /** 이번 실행에서 거울 세계에 있던 소속 휴먼(빠지면 죽은 것 — 띄우지 않은 2차맵의 휴먼 줄은 건드리지 않는다) */
  const live = new Set<number>();
  let maxId = Math.max(0, ...houses.keys());
  /** 플레이어 가문이 아닌 주인(NPC 세력)인가 */
  const npcOwner = (owner: number): boolean => {
    const faction = o.world.factions.get(owner);
    return faction !== undefined && faction.player !== true;
  };

  return {
    of(unitId) {
      const id = members.get(unitId);
      const house = id === undefined ? undefined : houses.get(id);
      if (!house) return undefined;
      return {
        id: house.id,
        cityId: house.cityId,
        name: house.name,
        leader: o.mayorOf(house.cityId) === unitId,
      };
    },
    houseOfCity: (cityId) => byCity.get(cityId)?.id,
    sync(nowMs) {
      let created = 0;
      let joined = 0;
      let left = 0;
      for (const [cityId, city] of o.world.cities) {
        if (byCity.has(cityId) || !npcOwner(city.owner)) continue;
        const mayor = o.mayorOf(cityId);
        if (mayor === undefined) continue;
        maxId += 1;
        const house: NpcCityHouseRow = {
          id: maxId,
          cityId,
          name: o.nameFor(cityId, mayor),
          foundedAtMs: nowMs,
        };
        houses.set(house.id, house);
        byCity.set(cityId, house);
        o.writer.upsert("npcHouses", {
          id: house.id,
          city_id: cityId,
          name: house.name,
          founded_at_ms: nowMs,
        });
        created += 1;
      }
      for (const unit of o.world.units.values()) {
        if (members.has(unit.id)) {
          live.add(unit.id);
          continue;
        }
        if (unit.city === HOMELESS || !npcOwner(unit.owner)) continue;
        const house = byCity.get(unit.city);
        if (!house) continue;
        members.set(unit.id, house.id);
        live.add(unit.id);
        o.writer.upsert("npcHouseUnits", { unit_id: unit.id, house_id: house.id, set_at_ms: nowMs });
        joined += 1;
      }
      for (const unitId of live) {
        if (o.world.units.has(unitId)) continue;
        live.delete(unitId);
        members.delete(unitId);
        o.writer.remove("npcHouseUnits", { unit_id: unitId });
        left += 1;
      }
      return { created, joined, left };
    },
    counts: () => ({ houses: houses.size, members: members.size }),
  };
}
