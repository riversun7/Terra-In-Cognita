// 기본(시작) NPC 국가의 잃은 도시 기억 저장(NPC 사회 런타임) — 기획 검토 2712(fixes-1117j, 사용자 결정 D-593 "뺏겨도 되찾을만큼"). 표 npc_lost_cities(db/warSchema.ts).
// - 판정은 시뮬과 같은 함수다(@terra/sim societyWar.ts annex가 SimFaction.lostCities에 적고, 하루 끝 forgetRetaken이 되찾은 것·없어진 도시를 지운다). 여기는 거울 세계의
//   기억을 표와 맞추기만 한다: 켤 때 읽어 거울 세력(소유 주체 ID)에 넣고, flush 때 바뀐 줄만 쓰기 대기열에 넣는다(더하기·고치기 upsert, 사라진 것 remove).
// - 세력 행을 모르는 줄(사라진 세력)은 거울에 올리지 않고 지운다(첫 flush). 점령 기록(war_outcomes)의 회복 불이익 기간과 상관없이 남는다.
import type { SimFaction } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 기억을 쓰는 세력 몫 */
export type LostFaction = Pick<SimFaction, "id" | "fixed" | "lostCities">;

/** 저장된 기억 한 줄(세력 행·도시 → 빼앗긴 시각) */
interface StoredLost {
  readonly row: number;
  readonly city: number;
  readonly atMs: number;
}

export interface LostCityState {
  /** 거울 세력(소유 주체 ID) → 도시 → 빼앗긴 시각 */
  readonly byOwner: ReadonlyMap<number, ReadonlyMap<number, number>>;
  /** 표에 있는 줄(세력 행을 모르는 줄 포함 — 그런 줄은 첫 flush가 지운다) */
  readonly stored: readonly StoredLost[];
}

const num = (value: unknown): number => Number(value);
const keyOf = (row: number, city: number): string => `${row}:${city}`;

/** 표를 읽는다. ownerOfRow = 세력 행 → 거울 세력(소유 주체) */
export async function loadLostCities(
  pool: QueryPool,
  ownerOfRow: ReadonlyMap<number, number>,
): Promise<LostCityState> {
  const { rows } = await pool.query(
    "select faction_id, city_id, lost_at_ms from npc_lost_cities order by faction_id, city_id",
  );
  const byOwner = new Map<number, Map<number, number>>();
  const stored: StoredLost[] = [];
  for (const row of rows) {
    const entry = { row: num(row.faction_id), city: num(row.city_id), atMs: num(row.lost_at_ms) };
    stored.push(entry);
    const owner = ownerOfRow.get(entry.row);
    if (owner === undefined) continue;
    const map = byOwner.get(owner) ?? new Map<number, number>();
    map.set(entry.city, entry.atMs);
    byOwner.set(owner, map);
  }
  return { byOwner, stored };
}

/** 읽은 기억을 거울 세력에 넣는다(고정 세력만 — 기억은 고정 세력만 쓴다) */
export function applyLostCities(factions: ReadonlyMap<number, LostFaction>, state: LostCityState): void {
  for (const [owner, cities] of state.byOwner) {
    const faction = factions.get(owner);
    if (faction?.fixed) faction.lostCities = new Map(cities);
  }
}

export interface LostCityPersist {
  /** 거울 기억과 표를 맞춘다(바뀐 줄만 쓰기 대기열에). 쓴 줄 수 */
  flush(): number;
}

export function createLostCityPersist(o: {
  readonly factions: ReadonlyMap<number, LostFaction>;
  readonly writer: Pick<WorldWriter, "upsert" | "remove">;
  /** 소유 주체 ID → 세력 행 ID(persist.rowOf) */
  readonly rowOf: ReadonlyMap<number, number>;
  readonly state: LostCityState;
}): LostCityPersist {
  /** 표에 쓴 줄(열쇠 → 빼앗긴 시각) */
  const written = new Map<string, StoredLost>();
  for (const entry of o.state.stored) written.set(keyOf(entry.row, entry.city), entry);
  return {
    flush() {
      let rows = 0;
      const now = new Map<string, StoredLost>();
      for (const faction of o.factions.values()) {
        if (!faction.lostCities || faction.lostCities.size === 0) continue;
        const row = o.rowOf.get(faction.id);
        if (row === undefined) continue;
        for (const [city, atMs] of faction.lostCities) now.set(keyOf(row, city), { row, city, atMs });
      }
      for (const [key, entry] of [...now].toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
        if (written.get(key)?.atMs === entry.atMs) continue;
        o.writer.upsert("npcLostCities", {
          faction_id: entry.row,
          city_id: entry.city,
          lost_at_ms: entry.atMs,
        });
        written.set(key, entry);
        rows += 1;
      }
      for (const [key, entry] of written) {
        if (now.has(key)) continue;
        o.writer.remove("npcLostCities", { faction_id: entry.row, city_id: entry.city });
        written.delete(key);
        rows += 1;
      }
      return rows;
    },
  };
}
