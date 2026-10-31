// 반복 검사의 물 지표(출력 판 3 검토 뒤) — 시험·측정 전용. 가장 긴 강, 등급 3 이상 강 칸, 마른 분지·호수 몫,
// 빙상 기후 칸 중 호수 몫. 안쪽 고원·분지(3단계)가 큰 강을 끊고 마른 분지·얼음 위 호수를 늘린 것(검토 지적)을 잰다.
import type { GeneratorDetails } from "./generate.ts";
import { chordBetween } from "./grid.ts";
import { CELL_DRY, FROZEN_BASIN_MAX_C } from "./hydrology.ts";
import { type VarietyContext, isLandCell, isOceanCell, waterOf } from "./testVarietyMeasures.ts";
import { REFERENCE_RADIUS_KM } from "./util.ts";
import { WATER_LAKE, WATER_OCEAN } from "../tiles/fields.ts";

export interface WaterMetrics {
  /** 강이 끝날 때까지(바다·호수·마른 분지, 또는 강이 아닌 칸) 흘러가는 길이의 최댓값(실제 환산 km) */
  readonly longestRiverKm: number;
  /** 하천 등급 3 이상인 칸 넓이 ÷ 땅 넓이 */
  readonly order3PlusShare: number;
  /** 마른 분지 칸 넓이 ÷ 바다가 아닌 넓이 */
  readonly dryBasinShare: number;
  /** 호수 칸 넓이 ÷ 바다가 아닌 넓이 */
  readonly lakeShare: number;
  /** 저장 기온이 빙상 기후(FROZEN_BASIN_MAX_C 이하)인 바다 아닌 칸 중 호수 넓이 몫 */
  readonly iceClimateLakeShare: number;
}

export function waterMetrics(ctx: VarietyContext, details: GeneratorDetails): WaterMetrics {
  const { fields, receiver, basinKind } = details;
  const count = ctx.grid.cellCount;
  let land = 0;
  let nonOcean = 0;
  let order3 = 0;
  let dry = 0;
  let lakes = 0;
  let cold = 0;
  let coldLakes = 0;
  for (let c = 0; c < count; c++) {
    if (isOceanCell(fields, c)) continue;
    const area = ctx.area[c] ?? 0;
    nonOcean += area;
    if (basinKind[c] === CELL_DRY) dry += area;
    const isLake = (waterOf(fields, c) & WATER_LAKE) !== 0;
    const frozen = (fields.temperatureC[c] ?? 0) <= FROZEN_BASIN_MAX_C;
    if (frozen) cold += area;
    if (isLake) {
      lakes += area;
      if (frozen) coldLakes += area;
    }
    if (isLandCell(fields, c)) {
      land += area;
      if ((fields.river[c] ?? 0) >= 3) order3 += area;
    }
  }
  // 강 길이: 강 칸마다 끝까지 남은 길이를 아래쪽부터 한 번씩 구한다(-1 = 아직 모름)
  const remaining = new Float64Array(count).fill(-1);
  const ends = (r: number): boolean =>
    r < 0 ||
    (fields.river[r] ?? 0) === 0 ||
    (waterOf(fields, r) & (WATER_OCEAN | WATER_LAKE)) !== 0 ||
    basinKind[r] === CELL_DRY;
  const stepKm = (a: number, b: number): number => chordBetween(ctx.grid, a, b) * REFERENCE_RADIUS_KM;
  const path: number[] = [];
  let longest = 0;
  for (let start = 0; start < count; start++) {
    if ((fields.river[start] ?? 0) === 0 || (remaining[start] ?? 0) >= 0) continue;
    path.length = 0;
    let c = start;
    while ((remaining[c] ?? 0) < 0) {
      const r = receiver[c] ?? -1;
      if (ends(r)) {
        remaining[c] = r >= 0 ? stepKm(c, r) : 0;
        break;
      }
      path.push(c);
      c = r;
    }
    for (let k = path.length - 1; k >= 0; k--) {
      const a = path[k] ?? 0;
      const r = receiver[a] ?? -1;
      remaining[a] = (remaining[r] ?? 0) + stepKm(a, r);
    }
    longest = Math.max(longest, remaining[start] ?? 0);
  }
  return {
    longestRiverKm: longest,
    order3PlusShare: land > 0 ? order3 / land : 0,
    dryBasinShare: nonOcean > 0 ? dry / nonOcean : 0,
    lakeShare: nonOcean > 0 ? lakes / nonOcean : 0,
    iceClimateLakeShare: cold > 0 ? coldLakes / cold : 0,
  };
}
