// 배후지 칸 재고 저장 DB 시험(질문 1061 나, catchmentStore.ts) — TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 1. 하루 끝이 지나야 쓴다. 상한과 다른 칸만 쓰고 상한으로 돌아온 칸은 지운다. 도시 결과는 world_cities.catchment 12칸.
// 2. 읽어서 새 배후지 상태에 넣으면 같은 재고·결과(다시 켜도 고갈이 풀리지 않는다), 받은 몫이 도시 supplyPm에도 든다.
import { TEST_SOCIETY_COEFFICIENTS, catchmentSettingsOf, createCatchmentState } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { checkSqlInvariants } from "../world/invariants.ts";
import { createWorldWriter } from "../world/persist/writer.ts";
import { silentLog } from "../world/testSupport.ts";
import { createCatchmentStore, loadCatchment, restoreCatchment } from "./catchmentStore.ts";

const PLANET = "s2_test_planet";
const settings = () =>
  catchmentSettingsOf(TEST_SOCIETY_COEFFICIENTS.worldSeed, TEST_SOCIETY_COEFFICIENTS.territory);
/** 칸 10·11·12, 모든 원자재 몫 1000(상한 = 칸 재고 설정 칸) */
const geometry = {
  cellsOf: () => [10, 11, 12],
  capacityPm: () => 1000,
};
const CAP = TEST_SOCIETY_COEFFICIENTS.worldSeed.catchmentStockPerCell;
const supply = (pm: number) => ({ ore: pm, wood: pm, herb: pm, crop: pm, livestock: pm, fish: pm });

let test: TestDatabase;
beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  await test.drop();
});

describe.skipIf(!TEST_DATABASE_URL)("배후지 칸 재고 저장", () => {
  it("하루 끝 뒤 바뀐 칸만 쓰고, 다시 읽으면 같은 재고·결과다", async () => {
    const pool = test.db.$client;
    const writer = createWorldWriter({ pool, log: silentLog, onFatal: () => {}, intervalMs: 10 });
    await pool.query("insert into factions (kind, code) values ('npc', 'fake_faction')");
    await pool.query(
      `insert into world_cities (id, faction_id, planet_id, map_key, cell_x, cell_y, founded_at_ms) values
       (1, 1, $1, 5, 64, 64, 0), (2, 1, $1, 6, 64, 64, 0)`,
      [PLANET],
    );
    const state = createCatchmentState(geometry, settings);
    const store = createCatchmentStore({
      state,
      writer,
      planetId: PLANET,
      saved: { stock: [], cities: [] },
      hasCity: (id) => id === 1,
    });
    state.stock.set(10, [CAP, 300, CAP, 0, CAP, CAP]);
    state.stock.set(11, [CAP, CAP, CAP, CAP, CAP, CAP]);
    const result = {
      radiusMilli: 2070,
      areaMilli: 13_000,
      cells: 3,
      sharedCells: 1,
      demand: 900,
      totalPm: 640,
      supplyPm: supply(640),
    };
    state.cities.set(1, result);
    state.cities.set(2, { ...result, totalPm: 1000 });
    // 하루 끝 전: 쓰지 않는다
    expect(store.flush(1)).toBe(0);
    state.days += 1;
    // 칸 10 하나 + 도시 1(도시 2는 없는 도시)
    expect(store.flush(2)).toBe(2);
    // 상한인 칸 11은 메모리에서도 지운다
    expect(state.stock.has(11)).toBe(false);
    // 같은 날 다시: 아무것도 쓰지 않는다
    expect(store.flush(3)).toBe(0);
    await writer.durable();
    const stockRows = await rows<{ cell_key: string; wood: number; crop: number }>(
      test.db,
      "select cell_key, wood, crop from catchment_cell_stock order by cell_key",
    );
    expect(stockRows).toEqual([{ cell_key: "10", wood: 300, crop: 0 }]);
    const cityRows = await rows<{ id: string; catchment: number[] | null }>(
      test.db,
      "select id, catchment from world_cities order by id",
    );
    expect(cityRows[0]?.catchment).toEqual([2070, 13_000, 3, 1, 900, 640, 640, 640, 640, 640, 640, 640]);
    expect(cityRows[1]?.catchment).toBeNull();

    // 다시 켬: 읽어 넣으면 같은 재고, 받은 몫이 도시에 든다
    const saved = await loadCatchment(pool, PLANET);
    const again = createCatchmentState(geometry, settings);
    const cities = new Map<number, { supplyPm?: number | undefined }>([[1, {}]]);
    restoreCatchment(again, saved, { cities });
    expect(again.stock.get(10)).toEqual([CAP, 300, CAP, 0, CAP, CAP]);
    expect(again.cities.get(1)?.totalPm).toBe(640);
    expect(cities.get(1)?.supplyPm).toBe(640);

    // 다 자라 상한으로 돌아오면 줄을 지운다
    const next = createCatchmentStore({ state: again, writer, planetId: PLANET, saved, hasCity: () => true });
    again.stock.set(10, [CAP, CAP, CAP, CAP, CAP, CAP]);
    again.days += 1;
    expect(next.flush(4)).toBe(1);
    await writer.durable();
    expect(await rows(test.db, "select cell_key from catchment_cell_stock")).toEqual([]);
    // 불변 조건(C1 도시 결과 모양)
    expect(await checkSqlInvariants(pool, 5)).toEqual([]);
    await pool.query("update world_cities set catchment = '{1,2,3}' where id = 2");
    expect(await checkSqlInvariants(pool, 5)).toEqual(["C1 malformed city catchment results: 1"]);
  });
});
