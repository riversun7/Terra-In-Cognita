// NPC 도시의 가문 — 기획 D-569(1744 "도시국가든 도시의 가문들이 존재하며 가문장이 유닛을 고용한다", "Npc는 고용이 아니라 생성")·D-212(NPC도 같은
// 규칙)·46 §1.1 "NPC 가문도 같은 규칙", 질문 1848 답. docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 1847·1848 답)".
// 바뀜(D-573 — 질문 2011 나, 질문 2012 답 D-217): docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 2011·2012·2014·2017·2018 답)".
// - 가문 수: NPC 도시(주인이 플레이어 가문이 아닌 거울 세계 도시)마다 도시 등급(발전도 → territory.gradeAtDevelopment)에 따른 수(설정 칸
//   house_npc_city_houses_l1~l6). 가문은 사람이 있을 때만 세운다(빈 가문 없음): 첫 가문은 시장이 처음 생길 때(이름 = 시장의 성), 모자란 가문은
//   그 도시 가문원을 나눠 옮길 만큼 사람이 있을 때(그 도시에 사는 가문원 ÷ 목표 수만큼, 가장 큰 가문의 가장 늦게 든 사람부터 — 가문장·시장은
//   옮기지 않는다. 이름 = 처음 옮긴 사람의 성) [임시 질문 2143]. 목표가 줄어도 있는 가문은 그대로다.
// - 가문장 [질문 2012 답 — 국가 지도자 = 지배 가문의 장]: 그 나라 수도의 지배 가문(수도에서 가장 먼저 세운 가문)은 NPC 국가 지도자 유닛
//   (leaders.ts, 유닛 종류 7 — 가문원 줄은 없다). 그 밖은 시장이 든 가문이면 시장(기획 답 744 나), 아니면 가문원 가운데 시장 규칙(INT + WIS →
//   스탯 합 → 작은 ID, cityPeople.ts pickMayor)으로 앞선 사람. 저장하지 않고 읽을 때 본다 [임시 질문 2144].
// - 이름 [질문 2013 — 기술 기본값]: 세울 때 그 사람의 성(그 도시 주인 나라의 팩 휴먼 이름 목록 — humanNames.ts, 번역 안 함 D-476). 목록이 없으면 도시
//   이름. 한 번 정하면 그대로다. 화면은 "{이름} 가문"·"House {name}"으로 적는다.
// - 나라 = 그 도시의 지금 주인(점령되면 따라간다). 도시가 폐허가 되어도 가문 줄은 남는다(같은 도시 ID로 복원되면 그 가문 — 질문 2015 지금대로).
// - 소속: 가문 없는 NPC 휴먼(생성될 때)은 사는 도시 가문 가운데 가장 작은 가문(같으면 먼저 세운 가문)에 든다. 한 번 들면 그대로다(다른 도시로
//   옮겨도, 노숙이 되어도 — 질문 2016 지금대로). 예외는 위의 모자란 가문 세우기뿐이다. 노숙 휴먼은 새로 들지 않는다. 죽은 휴먼은 지운다.
// - 옛 세계(리셋 없음): 켤 때 첫 맞추기가 시장이 있는 NPC 도시마다 첫 가문을 세우고 그 도시 휴먼을 넣은 뒤, 목표 수에 모자라면 위 규칙으로 세우고
//   나눈다(멱등 — 목표 수에 이르면 더 하지 않는다). 플레이어 가문 도시의 휴먼은 그 가문 소유 주체의 유닛이라 넣지 않는다.
// - 부하(NPC 휴먼 수천): 메모리 표(가문, 유닛 → 가문, 가문 → 가문원). 맞추기는 휴먼을 한 번 훑고 바뀐 줄만 쓰기 대기열에 넣는다(쓰기 대기열이
//   여러 줄 insert로 묶는다). 켤 때 휴먼 행이 없는 소속 줄(지난 실행이 지우지 못한 죽은 휴먼)을 한 SQL로 지운다.
// - 바뀜(governance-2, 질문 2406 — 기획 대조: 선출로 바뀐 지배 가문이 지배 가문을 읽는 모든 곳을 대신한다, D-574 10 수도 첫 가문은 처음 값일 뿐): 의결
//   (governance 틱)이 나라마다 정한 지배 가문을 setRuling으로 넣는다. NPC 가문이면 그 가문이 지배 가문(가문장 = NPC 국가 지도자 유닛, 그 가문 도시가 아직 그
//   나라 것일 때만 — 아니면 처음 규칙), 플레이어 가문이면 NPC 지배 가문이 없다(rulingHouseOf undefined — NPC 국가 지도자 유닛은 남지만 어느 가문도 이끌지
//   않는다 = 퇴임, 질문 2406 가 기술 기본값). 지배 가문 금고(rulingVault.ts)·정부 판·지도 한눈 정보·랭킹 지도자 자산이 이 값을 따른다.
// 판정에 쓰지 않는다(보이기·집계용 — 한눈 정보의 가문 줄·정부 판의 지배 가문·가문 판).
import { HOMELESS, type SimCity, type SimFaction, type SimUnit } from "@terra/sim";
import { cityGrade, gradeValue, type TerritoryCoefficients } from "@terra/shared/territory";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { pickMayor } from "./cityPeople.ts";

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
  /** 그 유닛이 가문장인가(지배 가문은 국가 지도자, 그 밖은 시장·앞선 가문원) */
  readonly leader: boolean;
}

/** 의결로 정한 지배 가문: 가문(NPC·플레이어) 또는 빈자리 */
export type RulingRef = { readonly npc: boolean; readonly id: number } | "vacant";

export interface NpcCityHouses {
  /** 그 휴먼의 NPC 가문. 없으면 undefined */
  of(unitId: number): NpcUnitHouse | undefined;
  /** 그 도시의 NPC 가문 ID들(세운 차례). 없으면 빈 목록 */
  housesOfCity(cityId: number): readonly number[];
  /** 그 나라(소유 주체 ID)의 지배 가문(수도에서 가장 먼저 세운 가문, 질문 2012 답 — leader = 국가 지도자가 있나). 없으면 undefined */
  rulingHouseOf(owner: number): NpcUnitHouse | undefined;
  /** 그 가문의 가문장 유닛(위 머리 주석 규칙 — 지배 가문은 국가 지도자). 없으면 undefined (house-9, NPC 가문장 금고 꺼내기) */
  headOf(houseId: number): number | undefined;
  /** 그 가문의 가문원 유닛(유닛 ID 차례 — 국가 지도자는 가문원 줄이 없어 들지 않는다) */
  membersOf(houseId: number): readonly number[];
  /** NPC 지배 가문마다 그 가문장인 국가 지도자 유닛(랭킹 자산 — 지도자 지갑은 가문 재산, house-10 기획 대조 2313). 가문 ID 차례 */
  rulingHeads(): { readonly house: number; readonly unit: number }[];
  /** 의결로 정한 지배 가문(위 머리 주석 바뀜 governance-2). undefined면 처음 규칙(수도 첫 가문), "vacant"면 빈자리(질문 2403 답 D-582 — 지배 가문 없음) */
  setRuling(owner: number, house: RulingRef | undefined): void;
  /** 의결로 정한 지배 가문이 플레이어 가문이면 그 가문 세력 행. 아니면 undefined */
  rulingPlayerHouseOf(owner: number): number | undefined;
  /** 가문 세우기·가문 없는 NPC 휴먼 넣기·모자란 가문 나누기·죽은 휴먼 빼기(바뀐 줄만 쓰기 대기열에) */
  sync(nowMs: number): {
    readonly created: number;
    readonly joined: number;
    readonly left: number;
    readonly moved: number;
  };
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

/** 도시 등급마다 가문 수(설정 칸)와 등급 문턱 */
export interface NpcCityHouseRules {
  readonly housesByGrade: readonly number[];
  readonly territory: Pick<TerritoryCoefficients, "gradeAtDevelopment">;
}

/** 그 발전도 도시의 가문 목표 수(1 이상) */
export function targetHouses(development: number, rules: NpcCityHouseRules): number {
  const value = Math.trunc(gradeValue(rules.housesByGrade, cityGrade(development, rules.territory)));
  return Number.isSafeInteger(value) && value > 1 ? value : 1;
}

export function createNpcCityHouses(o: {
  /** 거울 세계(쓰는 칸만) */
  readonly world: {
    readonly cities: ReadonlyMap<number, Pick<SimCity, "owner"> & Partial<Pick<SimCity, "development">>>;
    readonly units: ReadonlyMap<
      number,
      Pick<SimUnit, "id" | "city" | "owner"> & Partial<Pick<SimUnit, "recruit">>
    >;
    readonly factions: ReadonlyMap<number, Pick<SimFaction, "player">>;
  };
  readonly writer: Pick<WorldWriter, "upsert" | "remove">;
  readonly loaded: NpcCityHousesLoaded;
  /** 그 도시 시장(cityPeople.ts). 없으면 undefined */
  readonly mayorOf: (cityId: number) => number | undefined;
  /** 새 가문 이름: 세우는 사람의 성(그 도시 주인 나라 목록), 없으면 도시 이름 */
  readonly nameFor: (cityId: number, unitId: number) => string;
  /** 가문 수 설정(없으면 도시마다 하나 — 옛 시험) */
  readonly rules?: (() => NpcCityHouseRules) | undefined;
  /** 그 나라의 수도 도시(capitals.ts). 없으면 지배 가문이 없다 */
  readonly capitalOf?: ((owner: number) => number | undefined) | undefined;
  /** 그 나라의 NPC 국가 지도자 유닛(leaders.ts). 없으면 지배 가문장은 다른 가문과 같은 규칙 */
  readonly leaderOf?: ((owner: number) => number | undefined) | undefined;
}): NpcCityHouses {
  const houses = new Map<number, NpcCityHouseRow>();
  /** 도시 → 그 도시 가문 ID(세운 차례) */
  const byCity = new Map<number, number[]>();
  /** 가문 → 가문원 */
  const roster = new Map<number, Set<number>>();
  const members = new Map<number, number>();
  const addHouse = (row: NpcCityHouseRow): void => {
    houses.set(row.id, row);
    const list = byCity.get(row.cityId) ?? [];
    list.push(row.id);
    list.sort((a, b) => a - b);
    byCity.set(row.cityId, list);
    roster.set(row.id, roster.get(row.id) ?? new Set());
  };
  const setMember = (unitId: number, houseId: number): void => {
    const before = members.get(unitId);
    if (before !== undefined) roster.get(before)?.delete(unitId);
    members.set(unitId, houseId);
    roster.get(houseId)?.add(unitId);
  };
  for (const row of o.loaded.houses) addHouse(row);
  for (const [unitId, houseId] of o.loaded.members) if (houses.has(houseId)) setMember(unitId, houseId);
  /** 이번 실행에서 거울 세계에 있던 소속 휴먼(빠지면 죽은 것 — 띄우지 않은 2차맵의 휴먼 줄은 건드리지 않는다) */
  const live = new Set<number>();
  let maxId = Math.max(0, ...houses.keys());
  /** 플레이어 가문이 아닌 주인(NPC 세력)인가 */
  const npcOwner = (owner: number): boolean => {
    const faction = o.world.factions.get(owner);
    return faction !== undefined && faction.player !== true;
  };
  /** 의결로 정한 지배 가문(나라 소유 주체 → 가문) */
  const overrides = new Map<number, RulingRef>();
  /** 그 NPC 나라의 지배 가문 ID: 의결로 정한 NPC 가문(그 가문 도시가 그 나라 것일 때) → 플레이어 가문이면 없음 → 수도에서 먼저 세운 가문 */
  const rulingIdOf = (owner: number): number | undefined => {
    if (!npcOwner(owner)) return undefined;
    const set = overrides.get(owner);
    if (set === "vacant" || (set && !set.npc)) return undefined;
    if (set) {
      const house = houses.get(set.id);
      if (house && o.world.cities.get(house.cityId)?.owner === owner) return house.id;
    }
    const capital = o.capitalOf?.(owner);
    return capital === undefined ? undefined : byCity.get(capital)?.[0];
  };
  /** 가문장 유닛(위 머리 주석 규칙) */
  const headOf = (house: NpcCityHouseRow): number | undefined => {
    const city = o.world.cities.get(house.cityId);
    if (city && rulingIdOf(city.owner) === house.id) {
      const leader = o.leaderOf?.(city.owner);
      if (leader !== undefined) return leader;
    }
    const list = roster.get(house.id) ?? new Set<number>();
    const mayor = o.mayorOf(house.cityId);
    if (mayor !== undefined && list.has(mayor)) return mayor;
    return pickMayor(
      [...list].flatMap((unitId) => {
        const unit = o.world.units.get(unitId);
        return unit ? [{ id: unit.id, recruit: unit.recruit ?? null }] : [];
      }),
    );
  };
  const view = (house: NpcCityHouseRow, unitId: number): NpcUnitHouse => ({
    id: house.id,
    cityId: house.cityId,
    name: house.name,
    leader: headOf(house) === unitId,
  });
  const found = (cityId: number, founder: number, nowMs: number): NpcCityHouseRow => {
    maxId += 1;
    const house: NpcCityHouseRow = {
      id: maxId,
      cityId,
      name: o.nameFor(cityId, founder),
      foundedAtMs: nowMs,
    };
    addHouse(house);
    o.writer.upsert("npcHouses", { id: house.id, city_id: cityId, name: house.name, founded_at_ms: nowMs });
    return house;
  };
  const write = (unitId: number, houseId: number, nowMs: number): void => {
    setMember(unitId, houseId);
    live.add(unitId);
    o.writer.upsert("npcHouseUnits", { unit_id: unitId, house_id: houseId, set_at_ms: nowMs });
  };

  /** 모자란 가문을 세우고 그 도시에 사는 가문원을 나눠 옮긴다. [세운 수, 옮긴 수] */
  const fillCity = (cityId: number, target: number, nowMs: number): [number, number] => {
    const list = byCity.get(cityId) ?? [];
    if (list.length >= target) return [0, 0];
    const mayor = o.mayorOf(cityId);
    /** 그 도시에 사는 가문원(가문마다, 늦게 든 사람 = 큰 ID 먼저 옮긴다) */
    const living = (houseId: number): number[] =>
      [...(roster.get(houseId) ?? [])].filter((id) => o.world.units.get(id)?.city === cityId);
    const total = list.reduce((sum, id) => sum + living(id).length, 0);
    const quota = Math.floor(total / target);
    if (quota < 1) return [0, 0];
    let created = 0;
    let moved = 0;
    while ((byCity.get(cityId)?.length ?? 0) < target) {
      const takers = new Set<number>();
      const heads = new Set<number>();
      for (const id of byCity.get(cityId) ?? []) {
        const row = houses.get(id);
        const head = row ? headOf(row) : undefined;
        if (head !== undefined) heads.add(head);
      }
      if (mayor !== undefined) heads.add(mayor);
      // 가장 큰 가문(그 도시에 사는 사람 수)에서 늦게 든 사람(큰 ID)부터 한 사람씩 — 가문장·시장은 옮기지 않는다
      for (let i = 0; i < quota; i += 1) {
        let biggest: number[] | undefined;
        for (const id of byCity.get(cityId) ?? []) {
          const people = living(id).filter((unit) => !takers.has(unit));
          if (!biggest || people.length > biggest.length) biggest = people;
        }
        const pick = biggest?.filter((unit) => !heads.has(unit)).toSorted((a, b) => b - a)[0];
        if (pick === undefined) break;
        takers.add(pick);
      }
      const founder = [...takers][0];
      if (founder === undefined) break;
      const house = found(cityId, founder, nowMs);
      created += 1;
      for (const unitId of takers) {
        write(unitId, house.id, nowMs);
        moved += 1;
      }
    }
    return [created, moved];
  };

  return {
    of(unitId) {
      const id = members.get(unitId);
      const house = id === undefined ? undefined : houses.get(id);
      return house ? view(house, unitId) : undefined;
    },
    housesOfCity: (cityId) => byCity.get(cityId) ?? [],
    headOf(houseId) {
      const house = houses.get(houseId);
      return house ? headOf(house) : undefined;
    },
    membersOf: (houseId) => [...(roster.get(houseId) ?? [])].toSorted((a, b) => a - b),
    rulingHeads() {
      const out: { house: number; unit: number }[] = [];
      const owners = new Set<number>();
      for (const city of o.world.cities.values()) owners.add(city.owner);
      for (const owner of owners) {
        const house = rulingIdOf(owner);
        const unit = house === undefined ? undefined : o.leaderOf?.(owner);
        if (house !== undefined && unit !== undefined) out.push({ house, unit });
      }
      return out.toSorted((a, b) => a.house - b.house);
    },
    setRuling(owner, house) {
      if (house === "vacant") overrides.set(owner, "vacant");
      else if (house) overrides.set(owner, { npc: house.npc, id: house.id });
      else overrides.delete(owner);
    },
    rulingPlayerHouseOf(owner) {
      const set = overrides.get(owner);
      return set && set !== "vacant" && !set.npc && npcOwner(owner) ? set.id : undefined;
    },
    rulingHouseOf(owner) {
      const id = rulingIdOf(owner);
      const house = id === undefined ? undefined : houses.get(id);
      if (!house) return undefined;
      const leader = o.leaderOf?.(owner);
      return { id: house.id, cityId: house.cityId, name: house.name, leader: leader !== undefined };
    },
    sync(nowMs) {
      let created = 0;
      let joined = 0;
      let left = 0;
      let moved = 0;
      // 첫 가문: 시장이 처음 생긴 NPC 도시
      for (const [cityId, city] of o.world.cities) {
        if ((byCity.get(cityId)?.length ?? 0) > 0 || !npcOwner(city.owner)) continue;
        const mayor = o.mayorOf(cityId);
        if (mayor === undefined) continue;
        found(cityId, mayor, nowMs);
        created += 1;
      }
      // 죽은 휴먼을 먼저 뺀다(가장 작은 가문을 맞게 고르도록)
      for (const unitId of live) {
        if (o.world.units.has(unitId)) continue;
        live.delete(unitId);
        const houseId = members.get(unitId);
        if (houseId !== undefined) roster.get(houseId)?.delete(unitId);
        members.delete(unitId);
        o.writer.remove("npcHouseUnits", { unit_id: unitId });
        left += 1;
      }
      // 가문 없는 NPC 휴먼 → 사는 도시의 가장 작은 가문
      for (const unit of o.world.units.values()) {
        if (members.has(unit.id)) {
          live.add(unit.id);
          continue;
        }
        if (unit.city === HOMELESS || !npcOwner(unit.owner)) continue;
        let smallest: number | undefined;
        for (const id of byCity.get(unit.city) ?? [])
          if (smallest === undefined || (roster.get(id)?.size ?? 0) < (roster.get(smallest)?.size ?? 0))
            smallest = id;
        if (smallest === undefined) continue;
        write(unit.id, smallest, nowMs);
        joined += 1;
      }
      // 모자란 가문(D-573 — 도시 등급마다 수)
      const rules = o.rules?.();
      if (rules)
        for (const [cityId, city] of o.world.cities) {
          if (!npcOwner(city.owner) || (byCity.get(cityId)?.length ?? 0) === 0) continue;
          const [made, shifted] = fillCity(cityId, targetHouses(city.development ?? 0, rules), nowMs);
          created += made;
          moved += shifted;
        }
      return { created, joined, left, moved };
    },
    counts: () => ({ houses: houses.size, members: members.size }),
  };
}
