// 행성 면적 가중 요약(summarizePlanet) — 편집기 바이옴 면적표·아래 줄(ADR 38 8·12절)
// 저장 필드(물 비트·기온·고도·바이옴)와 바이옴 표만 읽는다. 칸마다 칸 면적(faceAreaTable, 스테라디안)으로 가중한다:
// 정육면체 투영이라 칸 면적이 면 가운데와 모서리에서 다르다(칸 수로 세면 모서리 쪽 바이옴이 커 보인다).
// 비율은 0~1 실수다(화면이 %로 적는다). 결정적 계산만 쓴다(사칙연산, 면적 표는 detAtan): 같은 결과면 엔진과 무관하게 같은 값.
// 구조화 복제로 넘길 수 있는 값만 담는다(편집기 워커가 결과와 함께 화면으로 보낸다).
// 해수면(실제 m)은 저장 필드가 아니라 요약에 없다: 미리보기 결과(seaLevelRealM)가 따로 싣는다.
import { faceAreaTable } from "./grid.ts";
import {
  DEPTH_COASTAL,
  DEPTH_DEEP,
  DEPTH_SHELF,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  type PlanetFields,
} from "../tiles/fields.ts";
import type { PlanetBiome } from "./types.ts";

/** 바이옴 하나의 면적 몫 */
export interface PlanetBiomeArea {
  /** 바이옴 표 번호(행성 biomes 순서) */
  readonly index: number;
  readonly id: string;
  /** 행성 면적 대비(0~1) */
  readonly planetShare: number;
  /** 육지 면적 대비(0~1). 육지 규칙이 아닌 바이옴(바다·호수)은 null */
  readonly landShare: number | null;
}

export interface PlanetSummary {
  readonly faceLevel: number;
  readonly cellCount: number;
  /** 바이옴 표 순서(표에 없는 번호의 칸은 넣지 않는다 — 생성기는 표 밖 번호를 내지 않는다) */
  readonly biomes: readonly PlanetBiomeArea[];
  /** 육지(바다·호수가 아닌 칸) 몫 */
  readonly landShare: number;
  readonly lakeShare: number;
  readonly oceanShare: number;
  /** 강 칸(물 비트 WATER_RIVER, 육지 칸) 몫(행성 대비) */
  readonly riverShare: number;
  /** 바다 수심 등급별 몫(행성 대비). 합 = oceanShare(등급 0인 바다 칸은 생성기가 내지 않는다) */
  readonly oceanDepthShares: { readonly coastal: number; readonly shelf: number; readonly deep: number };
  /** 면적 평균 연평균 기온(°C): 행성 전체, 육지만(육지가 없으면 null) */
  readonly meanTemperatureC: number;
  readonly landMeanTemperatureC: number | null;
  /** 가장 높은 칸·가장 낮은 칸(게임 m, 실제 환산은 × 12) */
  readonly maxElevationM: number;
  readonly minElevationM: number;
}

function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** 결과 하나의 면적 가중 요약. biomes는 그 결과를 만든 생성기 입력의 바이옴 표다(출력 biome 값 = 표 번호) */
export function summarizePlanet(fields: PlanetFields, biomes: readonly PlanetBiome[]): PlanetSummary {
  const { faceLevel } = fields.meta;
  const area = faceAreaTable(faceLevel);
  const faceCells = area.length;
  const count = fields.biome.length;
  const biomeArea = new Float64Array(biomes.length);
  const biomeLandArea = new Float64Array(biomes.length);
  let total = 0;
  let land = 0;
  let lake = 0;
  let river = 0;
  const depthArea = [0, 0, 0, 0];
  let temperatureSum = 0;
  let landTemperatureSum = 0;
  let maxElevation = Number.NEGATIVE_INFINITY;
  let minElevation = Number.POSITIVE_INFINITY;
  for (let c = 0; c < count; c++) {
    const a = area[c % faceCells] ?? 0;
    total += a;
    const water = fields.water[c] ?? 0;
    const temperature = fields.temperatureC[c] ?? 0;
    temperatureSum += a * temperature;
    const elevation = fields.elevationM[c] ?? 0;
    if (elevation > maxElevation) maxElevation = elevation;
    if (elevation < minElevation) minElevation = elevation;
    const biome = fields.biome[c] ?? 0;
    if (biome < biomes.length) biomeArea[biome] = (biomeArea[biome] ?? 0) + a;
    if ((water & WATER_OCEAN) !== 0) {
      const depth = (water & WATER_DEPTH_MASK) >> WATER_DEPTH_SHIFT;
      depthArea[depth] = (depthArea[depth] ?? 0) + a;
    } else if ((water & WATER_LAKE) !== 0) {
      lake += a;
    } else {
      land += a;
      landTemperatureSum += a * temperature;
      if ((water & WATER_RIVER) !== 0) river += a;
      if (biome < biomes.length) biomeLandArea[biome] = (biomeLandArea[biome] ?? 0) + a;
    }
  }
  const ocean = total - land - lake;
  return {
    faceLevel,
    cellCount: count,
    biomes: biomes.map((biome, index) => ({
      index,
      id: biome.id,
      planetShare: share(biomeArea[index] ?? 0, total),
      landShare: biome.rule.kind === "land" ? share(biomeLandArea[index] ?? 0, land) : null,
    })),
    landShare: share(land, total),
    lakeShare: share(lake, total),
    oceanShare: share(ocean, total),
    riverShare: share(river, total),
    oceanDepthShares: {
      coastal: share(depthArea[DEPTH_COASTAL] ?? 0, total),
      shelf: share(depthArea[DEPTH_SHELF] ?? 0, total),
      deep: share(depthArea[DEPTH_DEEP] ?? 0, total),
    },
    meanTemperatureC: share(temperatureSum, total),
    landMeanTemperatureC: land > 0 ? landTemperatureSum / land : null,
    maxElevationM: Number.isFinite(maxElevation) ? maxElevation : 0,
    minElevationM: Number.isFinite(minElevation) ? minElevation : 0,
  };
}
