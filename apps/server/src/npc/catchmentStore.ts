// 배후지 채집 다툼 저장 — docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12, 칸 재고 저장)", 질문 1061 나(기획 D-533 "1061 칸 재고는 DB
// 저장"). 칸 재고가 서버 메모리에만 있으면 다시 켤 때·배포 때마다 고갈이 풀려 운영자가 본 숫자와 달라진다.
// - 칸 재고(catchment_cell_stock): 칸 × 원자재 여섯. 상한(= 처음 보는 칸에 채우는 값)과 다른 칸만 둔다. 하루 끝(stepCatchment) 뒤 처음 저장에서
//   지난 저장과 달라진 칸만 쓰기 대기열에 넣고, 상한으로 돌아온 칸은 지운다. 재고는 하루에 한 번만 바뀌므로 쓰기는 하루 끝 한 번 몰린다.
// - 도시 결과(world_cities.catchment, 19칸): 지난 하루 끝 반경·넓이·칸·겹친 칸·캐려는 양·합 몫·원자재 여섯 몫·여섯 땅 몫·산지 몫. 다시 켠 뒤 첫 하루 끝 전에도
//   채집 빠르기(facilitySupplyPm)와 성장 멈춤(SimCity.supplyPm)이 끄기 전 값 그대로다. 도시 행에 두어 도시가 폐허가 되면 함께 지워진다.
// - 켤 때(startServerEconomy, 시설을 놓기 전): 저장한 재고·결과를 배후지 상태에 넣는다(restoreCatchment).
import { CATCHMENT_MATERIALS, type CatchmentMaterial, cellStockCap } from "@terra/shared/catchment";
import type { CatchmentState, CityCatchment } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 저장한 칸 재고 한 줄 */
export interface CatchmentStockRow {
  readonly cellKey: number;
  /** CATCHMENT_MATERIALS 차례 */
  readonly stock: readonly number[];
}

/** 저장한 도시 결과 한 줄 */
export interface CatchmentCityRow {
  readonly cityId: number;
  readonly catchment: CityCatchment;
}

export interface CatchmentSaved {
  readonly stock: readonly CatchmentStockRow[];
  readonly cities: readonly CatchmentCityRow[];
}

/** 도시 결과 칸 수(world_cities.catchment) */
// 바뀜(2026-11-12, 광석 고도 몫과 합침): 원자재 여섯 땅 몫(landPm)과 산지 몫(highOrePm)을 뒤에 더해 19칸. 옛 12칸 줄은 모양이 달라 다음 하루 끝에 다시 센다
export const CITY_CATCHMENT_FIELDS = 7 + 2 * CATCHMENT_MATERIALS.length;

/** 도시 결과 → 저장 칸(19) */
export function cityCatchmentRow(city: CityCatchment): number[] {
  return [
    city.radiusMilli,
    city.areaMilli,
    city.cells,
    city.sharedCells,
    city.demand,
    city.totalPm,
    ...CATCHMENT_MATERIALS.map((material) => city.supplyPm[material]),
    ...CATCHMENT_MATERIALS.map((material) => city.landPm[material]),
    city.highOrePm,
  ].map((value) => Math.max(0, Math.trunc(value)));
}

/** 저장 칸 → 도시 결과(모양이 다르면 undefined — 다음 하루 끝에 다시 센다) */
export function cityCatchmentOf(values: readonly number[]): CityCatchment | undefined {
  if (values.length !== CITY_CATCHMENT_FIELDS || values.some((value) => !Number.isFinite(value) || value < 0))
    return undefined;
  const at = (index: number): number => values[index] ?? 0;
  // CATCHMENT_MATERIALS 차례(광석·목재·약초·작물·축산물·어류)
  const supplyPm: Record<CatchmentMaterial, number> = {
    ore: at(6),
    wood: at(7),
    herb: at(8),
    crop: at(9),
    livestock: at(10),
    fish: at(11),
  };
  // 땅 몫은 같은 차례로 12~17칸, 산지 몫은 18칸
  const landPm: Record<CatchmentMaterial, number> = {
    ore: at(12),
    wood: at(13),
    herb: at(14),
    crop: at(15),
    livestock: at(16),
    fish: at(17),
  };
  return {
    radiusMilli: at(0),
    areaMilli: at(1),
    cells: at(2),
    sharedCells: at(3),
    demand: at(4),
    totalPm: at(5),
    supplyPm,
    landPm,
    highOrePm: at(18),
  };
}

/** 그 행성 칸 재고와 도시 결과를 읽는다(켤 때 한 번) */
export async function loadCatchment(pool: QueryPool, planetId: string): Promise<CatchmentSaved> {
  const [stock, cities] = await Promise.all([
    pool.query(
      `select cell_key, ore, wood, herb, crop, livestock, fish from catchment_cell_stock where planet_id = $1
       order by cell_key`,
      [planetId],
    ),
    pool.query(`select id, catchment from world_cities where catchment is not null order by id`),
  ]);
  return {
    stock: stock.rows.map((row) => ({
      cellKey: Number(row.cell_key),
      stock: CATCHMENT_MATERIALS.map((material) => Number(row[material])),
    })),
    cities: cities.rows.flatMap((row) => {
      const values = Array.isArray(row.catchment) ? row.catchment.map(Number) : [];
      const catchment = cityCatchmentOf(values);
      return catchment ? [{ cityId: Number(row.id), catchment }] : [];
    }),
  };
}

/** 저장한 재고·결과를 배후지 상태에 넣는다(없는 도시의 결과는 버린다). 도시 결과의 합 몫은 SimCity.supplyPm에도 둔다 */
export function restoreCatchment(
  state: CatchmentState,
  saved: CatchmentSaved,
  world: { readonly cities: ReadonlyMap<number, { supplyPm?: number | undefined }> },
): void {
  for (const row of saved.stock) state.stock.set(row.cellKey, [...row.stock]);
  for (const row of saved.cities) {
    const city = world.cities.get(row.cityId);
    if (!city) continue;
    state.cities.set(row.cityId, row.catchment);
    city.supplyPm = row.catchment.totalPm;
  }
}

export interface CatchmentStore {
  /** 지난 저장 뒤 바뀐 칸 재고·도시 결과를 쓰기 대기열에 넣는다(하루 끝이 지나지 않았으면 아무것도 하지 않는다). 쓴 줄 수 */
  flush(nowMs: number): number;
}

export function createCatchmentStore(o: {
  readonly state: CatchmentState;
  readonly writer: Pick<WorldWriter, "upsert" | "remove">;
  readonly planetId: string;
  readonly saved: CatchmentSaved;
  /** 그 도시가 아직 있나(폐허가 된 도시 행은 쓰지 않는다 — update라 행이 없으면 아무 일도 없지만 쓰기를 줄인다) */
  readonly hasCity: (cityId: number) => boolean;
}): CatchmentStore {
  const { state } = o;
  // 저장한 모습(칸 → 여섯 재고를 이은 글, 도시 → 19칸을 이은 글)
  const savedStock = new Map<number, string>();
  for (const row of o.saved.stock) savedStock.set(row.cellKey, row.stock.join(","));
  const savedCities = new Map<number, string>();
  for (const row of o.saved.cities) savedCities.set(row.cityId, cityCatchmentRow(row.catchment).join(","));
  let flushedDays = state.days;

  const capRow = (cell: number): number[] => {
    const supply = state.settings().supply;
    return CATCHMENT_MATERIALS.map((material) =>
      cellStockCap(state.geometry.capacityPm(cell, material), supply),
    );
  };

  return {
    flush(nowMs) {
      if (state.days === flushedDays) return 0;
      flushedDays = state.days;
      let rows = 0;
      for (const [cell, stock] of [...state.stock].toSorted((a, b) => a[0] - b[0])) {
        const values = CATCHMENT_MATERIALS.map((_, index) => Math.max(0, Math.trunc(stock[index] ?? 0)));
        const full = capRow(cell).every((cap, index) => values[index] === cap);
        const sig = values.join(",");
        if (full) {
          // 상한 = 없는 칸과 같다(메모리에서도 지워 다음 날 다시 상한으로 채운다)
          state.stock.delete(cell);
          if (!savedStock.has(cell)) continue;
          o.writer.remove("catchmentStock", { planet_id: o.planetId, cell_key: cell });
          savedStock.delete(cell);
          rows += 1;
          continue;
        }
        if (savedStock.get(cell) === sig) continue;
        const [ore, wood, herb, crop, livestock, fish] = values;
        o.writer.upsert("catchmentStock", {
          planet_id: o.planetId,
          cell_key: cell,
          ore,
          wood,
          herb,
          crop,
          livestock,
          fish,
          updated_at_ms: nowMs,
        });
        savedStock.set(cell, sig);
        rows += 1;
      }
      // 메모리에 없는 칸(다른 판이 쓴 줄 등)은 지운다
      for (const cell of savedStock.keys()) {
        if (state.stock.has(cell)) continue;
        o.writer.remove("catchmentStock", { planet_id: o.planetId, cell_key: cell });
        savedStock.delete(cell);
        rows += 1;
      }
      for (const [cityId, city] of [...state.cities].toSorted((a, b) => a[0] - b[0])) {
        if (!o.hasCity(cityId)) continue;
        const values = cityCatchmentRow(city);
        const sig = values.join(",");
        if (savedCities.get(cityId) === sig) continue;
        o.writer.upsert("cityCatchment", { id: cityId, catchment: values });
        savedCities.set(cityId, sig);
        rows += 1;
      }
      return rows;
    },
  };
}
