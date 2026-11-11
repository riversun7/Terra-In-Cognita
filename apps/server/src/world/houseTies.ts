// 도시를 가진 플레이어 가문과 같은 세력 시야(D-250) — docs/adr/2026-11-11-house-village.md(질문 1005 가).
// "같은 세력" = 같은 국가 전체: 국가 안의 가문과 봉신 가문이 들어가고, 독립한 가문은 따로다(46 §1.2, "같은 세력"은 봉신 관계만 따라 올라간다
// D-329 87). 시야 묶음(nationVision.ts)은 소유 주체 → 나라를 묻는데, 도시를 얻은 가문은 소유 주체(world_owners.faction_id = 가문 행)가 있다:
// - 봉신 가문의 주체 → 위 세력(factions.parent_id = 가문 나라). 가문 휴먼·건물이 나라와 시야를 함께 본다.
// - 독립 가문의 주체 → 그 가문 행. 그 가문원(유저 주체)도 → 그 가문 행: 독립한 가문은 옛 나라와 시야를 나누지 않고 가문끼리 본다.
//   가문원의 시민권(cyborgs.faction_id)은 그대로 둔다 — 시민권을 새 도시국가로 옮길지는 기획이 정할 일이다([임시], 질문 1038).
// 메모리 표: 가문 명령(마을·폐허 고르기·가입·해산) 뒤와 1분마다 DB에서 다시 읽는다(시야 틱은 동기로 묻는다). 세계 저장 층마다 하나(WeakMap).
import type { QueryPool } from "./persist/load.ts";

export interface HouseTies {
  /** 도시를 가진 가문 행 → 시야 나라(봉신 = 위 세력, 독립 = 자기). 그런 가문이 아니면 undefined */
  nationOfHouse(rowId: number): number | undefined;
  /** 독립 가문의 가문원 → 그 가문 행. 아니면 undefined */
  independentOfUser(userId: string): number | undefined;
  /** 가문장 → 그가 이끄는 도시 가진 가문 행(폐허 복원 고리가 쓴다). 아니면 undefined */
  ledHouseOf(userId: string): number | undefined;
  /** DB에서 다시 읽는다 */
  reload(): Promise<void>;
}

const tiesByStore = new WeakMap<object, HouseTies>();

/** 세계 저장 층(world.persistence)에 붙은 표. 없으면 undefined */
export function houseTiesOf(store: object | undefined): HouseTies | undefined {
  return store ? tiesByStore.get(store) : undefined;
}

/** 표를 만들어 세계 저장 층에 붙인다(이미 있으면 그것) */
export function attachHouseTies(store: object, pool: QueryPool): HouseTies {
  const existing = tiesByStore.get(store);
  if (existing) return existing;
  let nations = new Map<number, number>();
  let independents = new Map<string, number>();
  let leaders = new Map<string, number>();
  const ties: HouseTies = {
    nationOfHouse: (rowId) => nations.get(rowId),
    independentOfUser: (userId) => independents.get(userId),
    ledHouseOf: (userId) => leaders.get(userId),
    async reload() {
      const [houses, members] = await Promise.all([
        pool.query(
          `select f.id, f.parent_id from factions f join world_owners o on o.faction_id = f.id
            where f.kind = 'player' and f.dissolved_at_ms is null`,
        ),
        pool.query(
          `select m.user_id, m.faction_id, m.role, f.parent_id from house_members m
             join factions f on f.id = m.faction_id join world_owners o on o.faction_id = f.id
            where f.kind = 'player' and f.dissolved_at_ms is null`,
        ),
      ]);
      const nextNations = new Map<number, number>();
      for (const row of houses.rows) {
        const id = Number(row.id);
        nextNations.set(id, row.parent_id === null ? id : Number(row.parent_id));
      }
      const nextIndependents = new Map<string, number>();
      const nextLeaders = new Map<string, number>();
      for (const row of members.rows) {
        const userId = String(row.user_id);
        const factionId = Number(row.faction_id);
        if (row.parent_id === null) nextIndependents.set(userId, factionId);
        if (row.role === "leader") nextLeaders.set(userId, factionId);
      }
      nations = nextNations;
      independents = nextIndependents;
      leaders = nextLeaders;
    },
  };
  tiesByStore.set(store, ties);
  return ties;
}
