// 가문 소속 메모리 표 — 같은 세력 시야(D-250)·고용 자격(D-565)·한 줄 소속(D-569). docs/adr/2026-11-11-faction-identity.md "바뀜 (D-569)".
// - 소속은 한 줄(기획 D-569): 유닛 → 가문 하나 → 도시 하나 → 나라. "나라는 하나" — 가문원의 시민권(cyborgs.faction_id·faction_members)은 가문
//   소속 도시의 나라이고 내 도시(cyborgs.start_city_id)는 가문 소속 도시다. 다시 읽을 때마다 가문원 사이보그를 그 값에 맞춘다(alignHome — 가입·
//   창설·소속 도시 바꾸기·도시 얻기 뒤 가문 명령이 이 표를 다시 읽는다). 무소속(가문 없는 사람)은 내 도시와 그 나라 그대로다(귀화가 바꾼다).
//   가문을 나가도 나라·내 도시는 그대로다(마지막 소속 도시가 무소속의 소속 도시 — [임시] 질문 1841).
// - 시야 나라(nationVision.ts):
//   - 도시를 가진 가문(소유 주체 world_owners.faction_id = 가문 행): 봉신 → 위 세력(factions.parent_id), 독립 → 그 가문 행(46 §1.2 — "같은
//     세력"은 봉신 관계만 따라 올라간다 D-329 87). 그 가문원도 같은 나라.
//   - 도시 없는 가문: 소속 도시의 나라(factions.born_of, houseHome.ts — D-565).
//   - 도시를 가진 가문의 소속 도시는 그 가문 도시다(D-569 1743 — D-216·D-340·D-5056): 지금 소속 도시가 가문 도시가 아니면 가장 작은 ID의 가문
//     도시로 옮겨 적는다(마을 세우기·폐허 복원이 끝난 뒤 다시 읽을 때. 멱등).
// - 유닛 단위 가문(D-569 1744 "고용한 주체의 가문 소속에 들어간다"): 고용한 유닛은 고용한 사람의 그때 가문(표 house_units, 쓰기 대기열). 사이보그
//   본체는 그 사람의 가문을 따른다(줄 없음). 가문을 나가거나 내보내지거나 해산하면 그 사람 유닛의 그 가문 줄을 지운다(무소속 — D-565 1747).
//   가문에 새로 들어도 무소속 유닛은 그대로다(고용할 때의 가문 — [임시] 질문 1842). 이 표는 부팅 때 한 번 읽고 그 뒤는 메모리가 원본이다.
// 메모리 표: 가문 명령 뒤와 1분마다 DB에서 다시 읽는다(시야 틱은 동기로 묻는다). 세계 저장 층마다 하나(WeakMap).
import type { QueryPool } from "./persist/load.ts";
import type { WorldPersistence } from "./world.ts";

export interface HouseTies {
  /** 도시를 가진 가문 행 → 시야 나라(봉신 = 위 세력, 독립 = 자기). 그런 가문이 아니면 undefined */
  nationOfHouse(rowId: number): number | undefined;
  /** 가문장 → 그가 이끄는 도시 가진 가문 행(폐허 복원 고리가 쓴다). 아니면 undefined */
  ledHouseOf(userId: string): number | undefined;
  /** 도시를 가진 가문 행 → 그 가문장 사용자(조우 접속 판정 — 가문 소유 주체 유닛의 소유주, D-574 2140). 아니면 undefined */
  leaderOfHouse(rowId: number): string | undefined;
  /** 가문원(가문장 포함) → 나라(도시 가진 가문은 봉신 = 위 세력·독립 = 그 가문, 도시 없는 가문은 소속 도시의 나라 born_of) */
  memberNationOf(userId: string): number | undefined;
  /** 사용자가 든 가문 행(해산하지 않은 것). 없으면 undefined(무소속) */
  houseOfUser(userId: string): number | undefined;
  /** 유닛의 가문(D-569): 사이보그 본체면 주인의 가문, 아니면 고용할 때 적은 가문(주인이 아직 그 가문원일 때만). 없으면 undefined(무소속) */
  unitHouseOf(unitId: number, userId: string): number | undefined;
  /** 가문 행 → 그 가문 소속 도시(house_homes, 다시 읽을 때 채운다 — 적색 부상 귀환 소속 도시, unitHome.ts). 없으면 undefined */
  cityOfHouse(rowId: number): number | undefined;
  /** 고용한 유닛을 고용한 사람의 지금 가문에 적는다(쓰기 대기열 — 부르는 쪽이 유닛과 같은 커밋을 기다린다). 가문이 없으면 아무것도 안 한다 */
  assignUnit(unitId: number, userId: string, nowMs: number): void;
  /** DB에서 다시 읽고 가문원 시민권·내 도시를 맞추고 떠난 사람의 유닛 줄을 지운다 */
  reload(): Promise<void>;
  /** 표가 읽는 DB(빈 2차맵 알박기의 1인 가문 만들기·소식 — ruins/claimHouse.ts) */
  readonly pool: QueryPool;
}

/** 표가 맞추는 세계 저장 층(시험은 빈 객체 — 맞추기·유닛 줄 쓰기를 건너뛴다) */
export type HouseTiesStore = object & Partial<Pick<WorldPersistence, "cyborgs" | "writer">>;

const tiesByStore = new WeakMap<object, HouseTies>();

/** 세계 저장 층(world.persistence)에 붙은 표. 없으면 undefined */
export function houseTiesOf(store: object | undefined): HouseTies | undefined {
  return store ? tiesByStore.get(store) : undefined;
}

/** 도시를 가진 가문의 소속 도시를 그 가문 도시로(지금 소속 도시가 가문 도시가 아닐 때만, 가장 작은 ID — D-569 1743). $1 = 지금 시각 */
const CITY_HOUSE_HOME_SQL = `insert into house_homes (faction_id, city_id, set_at_ms)
  select f.id, min(c.id), $1::bigint from factions f join world_cities c on c.faction_id = f.id
   where f.kind = 'player' and f.dissolved_at_ms is null
     and not exists (select 1 from house_homes h join world_cities hc on hc.id = h.city_id and hc.faction_id = f.id
                      where h.faction_id = f.id)
   group by f.id
  on conflict (faction_id) do update set city_id = excluded.city_id, set_at_ms = excluded.set_at_ms`;

interface UnitHouse {
  readonly house: number;
  readonly userId: string;
}

/** 표를 만들어 세계 저장 층에 붙인다(이미 있으면 그것) */
export function attachHouseTies(store: HouseTiesStore, pool: QueryPool): HouseTies {
  const existing = tiesByStore.get(store);
  if (existing) return existing;
  let nations = new Map<number, number>();
  let leaders = new Map<string, number>();
  let leaderOf = new Map<number, string>();
  let memberNations = new Map<string, number>();
  let memberHouses = new Map<string, number>();
  let houseCities = new Map<number, number>();
  const units = new Map<number, UnitHouse>();
  let unitsLoaded = false;

  /** 가문원 시민권·내 도시를 가문에 맞춘다(D-569). 바뀐 수 */
  const align = (homes: ReadonlyMap<string, number | null>): number => {
    const cyborgs = store.cyborgs;
    if (!cyborgs) return 0;
    let changed = 0;
    for (const [userId, nation] of memberNations)
      if (cyborgs.alignHome(userId, { factionId: nation, cityId: homes.get(userId) ?? null })) changed += 1;
    return changed;
  };

  /** 주인이 그 가문을 떠난 유닛 줄을 지운다(D-565 1747 — 무소속). 지운 수 */
  const detachLeft = (): number => {
    let removed = 0;
    for (const [unitId, row] of units) {
      if (memberHouses.get(row.userId) === row.house) continue;
      units.delete(unitId);
      store.writer?.remove("houseUnits", { unit_id: unitId });
      removed += 1;
    }
    return removed;
  };

  const ties: HouseTies = {
    pool,
    nationOfHouse: (rowId) => nations.get(rowId),
    ledHouseOf: (userId) => leaders.get(userId),
    leaderOfHouse: (rowId) => leaderOf.get(rowId),
    memberNationOf: (userId) => memberNations.get(userId),
    houseOfUser: (userId) => memberHouses.get(userId),
    cityOfHouse: (rowId) => houseCities.get(rowId),
    unitHouseOf(unitId, userId) {
      const house = memberHouses.get(userId);
      if (house === undefined) return undefined;
      if (store.cyborgs?.userOfUnit(unitId) === userId) return house;
      return units.get(unitId)?.house === house ? house : undefined;
    },
    assignUnit(unitId, userId, nowMs) {
      const house = memberHouses.get(userId);
      if (house === undefined || !store.writer) return;
      units.set(unitId, { house, userId });
      store.writer.upsert("houseUnits", {
        unit_id: unitId,
        faction_id: house,
        user_id: userId,
        set_at_ms: nowMs,
      });
    },
    async reload() {
      // 고친 쓰기 대기열 줄이 DB에 닿기 전에 읽지 않게(앞 명령의 맞추기)
      await store.writer?.durable();
      await pool.query(CITY_HOUSE_HOME_SQL, [Date.now()]);
      if (!unitsLoaded) {
        const { rows } = await pool.query("select unit_id, faction_id, user_id from house_units");
        for (const row of rows)
          units.set(Number(row.unit_id), { house: Number(row.faction_id), userId: String(row.user_id) });
        unitsLoaded = true;
      }
      const [houses, members] = await Promise.all([
        pool.query(
          `select f.id, f.parent_id from factions f join world_owners o on o.faction_id = f.id
            where f.kind = 'player' and f.dissolved_at_ms is null`,
        ),
        pool.query(
          `select m.user_id, m.faction_id, m.role, f.parent_id, f.born_of, h.city_id as home_city,
                  exists(select 1 from world_owners o where o.faction_id = f.id) as has_owner
             from house_members m join factions f on f.id = m.faction_id
             left join house_homes h on h.faction_id = f.id
            where f.kind = 'player' and f.dissolved_at_ms is null`,
        ),
      ]);
      const nextNations = new Map<number, number>();
      for (const row of houses.rows) {
        const id = Number(row.id);
        nextNations.set(id, row.parent_id === null ? id : Number(row.parent_id));
      }
      const nextLeaders = new Map<string, number>();
      const nextMemberNations = new Map<string, number>();
      const nextMemberHouses = new Map<string, number>();
      const homes = new Map<string, number | null>();
      const nextHouseCities = new Map<number, number>();
      for (const row of members.rows) {
        const userId = String(row.user_id);
        const factionId = Number(row.faction_id);
        nextMemberHouses.set(userId, factionId);
        if (row.home_city !== null && row.home_city !== undefined)
          nextHouseCities.set(factionId, Number(row.home_city));
        homes.set(
          userId,
          row.home_city === null || row.home_city === undefined ? null : Number(row.home_city),
        );
        if (row.has_owner === true) {
          if (row.role === "leader") nextLeaders.set(userId, factionId);
          nextMemberNations.set(userId, row.parent_id === null ? factionId : Number(row.parent_id));
        } else if (row.born_of !== null && row.born_of !== undefined)
          nextMemberNations.set(userId, Number(row.born_of));
      }
      nations = nextNations;
      leaders = nextLeaders;
      leaderOf = new Map([...nextLeaders].map(([userId, rowId]) => [rowId, userId]));
      memberNations = nextMemberNations;
      memberHouses = nextMemberHouses;
      houseCities = nextHouseCities;
      if (align(homes) + detachLeft() > 0) await store.writer?.durable();
    },
  };
  tiesByStore.set(store, ties);
  return ties;
}
