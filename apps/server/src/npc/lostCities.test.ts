// 잃은 도시 기억 저장 시험(lostCities.ts — 기획 검토 2712, fixes-1117j). 가짜 표·쓰기 대기열로 본다.
import { describe, expect, it } from "vitest";
import { type LostFaction, applyLostCities, createLostCityPersist, loadLostCities } from "./lostCities.ts";

/** 기억 칸만 쓰는 가짜 세력 */
const faction = (id: number, fixed: boolean): LostFaction => ({ id, fixed });

describe("잃은 도시 기억 저장(npc_lost_cities)", () => {
  it("켤 때 읽어 고정 세력에만 넣고, 세력 행을 모르는 줄은 첫 flush가 지운다", async () => {
    const pool = {
      query: async () => ({
        rows: [
          { faction_id: 10, city_id: 5, lost_at_ms: 100 },
          { faction_id: 20, city_id: 6, lost_at_ms: 200 },
          { faction_id: 99, city_id: 7, lost_at_ms: 300 },
        ],
      }),
    };
    const state = await loadLostCities(
      pool,
      new Map([
        [10, 1],
        [20, 2],
      ]),
    );
    const fixed = faction(1, true);
    const free = faction(2, false);
    const factions = new Map([
      [1, fixed],
      [2, free],
    ]);
    applyLostCities(factions, state);
    expect([...(fixed.lostCities ?? [])]).toEqual([[5, 100]]);
    expect(free.lostCities).toBeUndefined();
    const writes: [string, string, Record<string, unknown>][] = [];
    const persist = createLostCityPersist({
      factions,
      writer: {
        upsert: (table, row) => void writes.push(["upsert", table, row]),
        remove: (table, key) => void writes.push(["remove", table, key]),
      },
      rowOf: new Map([
        [1, 10],
        [2, 20],
      ]),
      state,
    });
    // 첫 flush: 거울에 없는 줄(유동 세력 20·모르는 행 99)은 지운다, 그대로인 줄(10·5)은 쓰지 않는다
    expect(persist.flush()).toBe(2);
    expect(writes).toEqual([
      ["remove", "npcLostCities", { faction_id: 20, city_id: 6 }],
      ["remove", "npcLostCities", { faction_id: 99, city_id: 7 }],
    ]);
    // 새로 잃음 → upsert, 되찾음 → remove, 바뀜 없으면 쓰지 않는다
    writes.length = 0;
    fixed.lostCities?.set(8, 400);
    fixed.lostCities?.delete(5);
    expect(persist.flush()).toBe(2);
    expect(writes).toEqual([
      ["upsert", "npcLostCities", { faction_id: 10, city_id: 8, lost_at_ms: 400 }],
      ["remove", "npcLostCities", { faction_id: 10, city_id: 5 }],
    ]);
    writes.length = 0;
    expect(persist.flush()).toBe(0);
  });
});
