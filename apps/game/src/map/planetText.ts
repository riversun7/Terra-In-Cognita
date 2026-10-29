// 1차맵 시험 화면 문구 — 누른 칸(PickedCell)을 지금 언어의 문장으로. 1차맵 조각에만 들어간다.
// 바이옴 이름은 화면 문구가 아니라 자료(행성 범례, 지금은 [임시] 가짜 행성 표)라 부르는 쪽이 넘긴다.
import { type PickedCell, WATER_BITS, waterDepthClass } from "@terra/engine/planet";
import { m } from "../paraglide/messages.js";

/** 바다 칸의 수심 등급 이름(물 비트 4~5: 1 연안, 2 대륙붕, 3 심해, 0 모름) */
export function seaName(water: number): string {
  const depth = waterDepthClass(water);
  if (depth === 1) return m.planet_water_coastal();
  if (depth === 2) return m.planet_water_shelf();
  if (depth === 3) return m.planet_water_deep();
  return m.planet_water_ocean();
}

/** 바다가 아닌 물 비트 → 이름들(호수·강·해안) */
export function waterNames(water: number): string[] {
  const names: string[] = [];
  if (water & WATER_BITS.lake) names.push(m.planet_water_lake());
  if (water & WATER_BITS.river) names.push(m.planet_water_river());
  if (water & WATER_BITS.coast) names.push(m.planet_water_coast());
  return names;
}

/**
 * 누른 칸 안내 줄: 자리(면·칸·단계), 땅(바이옴·높이, 바다면 수심 등급·수심) + 물, 기후(기온·습도).
 * biomeName은 바이옴 번호의 이름(모르면 null → "바이옴 N").
 */
export function cellLines(cell: PickedCell, biomeName: (id: number) => string | null): string[] {
  const place = m.planet_cell_place({ face: cell.face, i: cell.i, j: cell.j, level: cell.primaryLevel });
  const height = Math.round(cell.heightM);
  const ground =
    cell.water & WATER_BITS.ocean
      ? m.planet_cell_sea({ name: seaName(cell.water), depth: Math.max(0, -height) })
      : m.planet_cell_ground({
          biome: biomeName(cell.biome) ?? m.planet_cell_biome_unknown({ id: cell.biome }),
          height,
        });
  const water = waterNames(cell.water);
  const climate = m.planet_cell_climate({
    temp: cell.temperatureC,
    humidity: Math.round((cell.humidity / 255) * 100),
  });
  return [place, water.length > 0 ? `${ground} · ${water.join(" · ")}` : ground, climate];
}
