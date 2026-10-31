// 반복 검사의 모은 맵 레벨 지표(출력 판 3 검토 뒤) — 측정 스크립트(bench/variety.ts) 전용. 기기는 생성기 출력(면 레벨
// F)을 그대로 보지 않고 서버가 모은 타일(맵 레벨 F−4 ~ F, ADR 36)을 본다. 첫 화면은 F−4·F−3(F9면 L5·L6)이다.
// 모으기(src/tiles/aggregate.ts)는 바이옴 4칸 최빈값이고 동점이면 작은 번호라, 고운 모자이크에서는 번호가 작은 바이옴
// (빙상)이 늘고 큰 바이옴(열대우림)이 준다. 모으기 규칙은 타일 형식 1판의 일부라 바꾸면 타일 형식 판을 올려야 한다
// (packages/protocol planetTile.ts). 여기서는 그 결과를 잰다.
import { type PlanetLevel, aggregatePlanetLevels } from "../tiles/aggregate.ts";
import { type PlanetFields, WATER_LAKE } from "../tiles/fields.ts";
import { type VarietyMetric, varietyMetric } from "./testVariety.ts";
import {
  type VarietyContext,
  isLandCell,
  isOceanCell,
  landPatches,
  singleBiomeWindowShare,
  topShare,
  varietyContext,
} from "./testVarietyMeasures.ts";
import type { PlanetBiome } from "./types.ts";

/** 모은 레벨에서 바이옴 하나뿐인지 보는 창의 한 변(그 레벨의 칸 수): 화면에서 같은 크기로 보이는 범위 */
const LEVEL_WINDOW_CELLS = 4;
/** 재는 레벨: 면 레벨 F에서 이만큼 낮은 맵 레벨(F9면 L5·L6·L7) */
const LEVEL_OFFSETS: readonly number[] = [4, 3, 2];

/** 땅(바다·호수 아님) 넓이로 잰 바이옴 몫(번호 순서) */
function landShares(
  ctx: VarietyContext,
  level: Pick<PlanetLevel, "biome" | "water">,
  biomeCount: number,
): number[] {
  const shares = Array.from({ length: biomeCount }, () => 0);
  let land = 0;
  for (let c = 0; c < ctx.grid.cellCount; c++) {
    if (!isLandCell(level, c)) continue;
    const area = ctx.area[c] ?? 0;
    const biome = level.biome[c] ?? 0;
    shares[biome] = (shares[biome] ?? 0) + area;
    land += area;
  }
  return shares.map((value) => (land > 0 ? value / land : 0));
}

export interface LevelVariety {
  readonly metrics: readonly VarietyMetric[];
  /** "F-4" 등 → 바이옴 ID → 땅 몫(0 ~ 1) */
  readonly shares: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/**
 * 생성기 출력을 타일과 같은 방식으로 모아 맵 레벨 F−4·F−3·F−2에서 잰다: 가장 크게 바뀐 땅 바이옴 몫(면 레벨 F 대비),
 * 빙상 몫 변화, 큰 덩어리 10개, 4×4칸 창이 바이옴 하나뿐인 몫, 바다 아닌 넓이 중 호수 몫.
 * @param ctx 면 레벨 F의 격자 자료(fieldMetrics와 같은 것)
 */
export function levelMetrics(
  ctx: VarietyContext,
  fields: PlanetFields,
  biomes: readonly PlanetBiome[],
): LevelVariety {
  const faceLevel = fields.meta.faceLevel;
  const levels = aggregatePlanetLevels(fields);
  const top = levels[levels.length - 1];
  const ice = biomes.findIndex((biome) => biome.id === "ice_sheet");
  const metrics: VarietyMetric[] = [];
  const shares: Record<string, Record<string, number>> = {};
  if (!top) return { metrics, shares };
  const topShares = landShares(ctx, top, biomes.length);
  for (const offset of LEVEL_OFFSETS) {
    const level = levels.find((entry) => entry.level === faceLevel - offset);
    if (!level) continue;
    const levelCtx = varietyContext(level.level);
    const here = landShares(levelCtx, level, biomes.length);
    let worst = 0;
    let worstId = "";
    biomes.forEach((biome, k) => {
      if (biome.rule.kind !== "land") return;
      const shift = (here[k] ?? 0) - (topShares[k] ?? 0);
      if (Math.abs(shift) > Math.abs(worst)) {
        worst = shift;
        worstId = biome.id;
      }
    });
    let nonOcean = 0;
    let lakes = 0;
    for (let c = 0; c < levelCtx.grid.cellCount; c++) {
      if (isOceanCell(level, c)) continue;
      nonOcean += levelCtx.area[c] ?? 0;
      if ((level.water[c] ?? 0) & WATER_LAKE) lakes += levelCtx.area[c] ?? 0;
    }
    const name = `levels.F-${offset}`;
    const patches = landPatches(levelCtx, level);
    const windows = singleBiomeWindowShare(
      levelCtx,
      (c) => isLandCell(level, c),
      level.biome,
      LEVEL_WINDOW_CELLS,
    );
    metrics.push(
      varietyMetric(
        `${name}.maxShareShift`,
        Math.abs(worst),
        `map level ${level.level}: largest |land biome share − face level ${faceLevel}| (${worstId} ${(100 * worst).toFixed(2)}%p)`,
      ),
      varietyMetric(
        `${name}.iceShareShift`,
        ice >= 0 ? (here[ice] ?? 0) - (topShares[ice] ?? 0) : 0,
        "ice-sheet land share minus the face-level share (mode-of-4 ties favour low biome indices)",
      ),
      varietyMetric(`${name}.top10ShareOfLand`, topShare(patches.area, 10), "10 largest land biome patches"),
      varietyMetric(
        `${name}.singleBiomeWindowShare`,
        windows.share,
        `${LEVEL_WINDOW_CELLS}×${LEVEL_WINDOW_CELLS}-cell windows (${windows.windows} land windows) holding one biome`,
      ),
      varietyMetric(`${name}.lakeShare`, nonOcean > 0 ? lakes / nonOcean : 0, "lake area ÷ non-ocean area"),
    );
    shares[`F-${offset}`] = Object.fromEntries(
      biomes.flatMap((biome, k) => (biome.rule.kind === "land" ? [[biome.id, here[k] ?? 0]] : [])),
    );
  }
  return { metrics, shares };
}
