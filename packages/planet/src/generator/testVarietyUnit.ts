// 반복 검사의 생성기 단위 지표(문서 4.1의 12~14, 출력 필드와 무관) — 시험·측정 전용.
// 바람이 멈추는 곳, 노이즈 격자점에서 꺼지는 정도, 열점 사슬 간격의 다양성. 생성기 함수를 직접 부르므로 생성기의
// 바람·노이즈·열점을 바꾸면 여기서 부르는 함수도 함께 바꾼다.
import type { PlanetSettings } from "@terra/shared";
import { hotspotVolcanoes } from "./hotspots.ts";
import { fbm3, noiseOctaveLattice, offsetFbm3 } from "./noise.ts";
import { createPlates } from "./plates.ts";
import { STREAM_PLATE_WARP, mix32, streamSeed } from "./random.ts";
import { type VarietyMetric, generatorWind, varietyMetric } from "./testVariety.ts";
import type { VarietyContext } from "./testVarietyMeasures.ts";
import { REFERENCE_RADIUS_KM } from "./util.ts";

/** 격자점 지표: 결정적 표본 수, 표본 상자 한 변(노이즈 격자 단위), "격자점 근처" 반경 */
const LATTICE_SAMPLES = 200_000;
const LATTICE_BOX = 40;
const LATTICE_NEAR = 0.1;
/** 노이즈 2판 격자점 지표의 시드·흔들기(새 노이즈의 기본값. 1판 fbm3는 같은 시드로 보고만 한다) */
const LATTICE_SEED = 777;
const LATTICE_JITTER = 0.6;

/** 모든 칸에서 생성기 바람 세기의 최솟값(0에 가까우면 그 칸은 바람길이 끊긴다) */
export function windMinSpeed(ctx: VarietyContext, seed: number): number {
  const wind = generatorWind(ctx, seed);
  let minimum = Number.POSITIVE_INFINITY;
  for (let c = 0; c < ctx.grid.cellCount; c++) {
    const { u, v } = wind(c);
    minimum = Math.min(minimum, Math.sqrt(u * u + v * v));
  }
  return minimum;
}

/**
 * 노이즈가 격자점 근처에서 꺼지는 정도: 격자점(좌표 + offset이 정수인 점)에서 LATTICE_NEAR 안인 표본의 RMS ÷ 모든 표본의
 * RMS. 그라디언트 노이즈는 격자점에서 0이라, 옥타브 격자가 겹치면 이 값이 작다(격자 간격마다 평평한 점).
 * 표본은 정수 해시로 고른 [0, 40)³의 점이다(결정적)
 */
export function latticeRmsRatio(
  noise: (x: number, y: number, z: number) => number,
  offset: readonly [number, number, number] = [0, 0, 0],
): number {
  let all = 0;
  let near = 0;
  let nearCount = 0;
  for (let k = 0; k < LATTICE_SAMPLES; k++) {
    const x = (mix32(k * 3 + 1) / 4_294_967_296) * LATTICE_BOX;
    const y = (mix32(k * 3 + 2) / 4_294_967_296) * LATTICE_BOX;
    const z = (mix32(k * 3 + 3) / 4_294_967_296) * LATTICE_BOX;
    const value = noise(x, y, z);
    all += value * value;
    const qx = x + offset[0];
    const qy = y + offset[1];
    const qz = z + offset[2];
    const dx = qx - Math.round(qx);
    const dy = qy - Math.round(qy);
    const dz = qz - Math.round(qz);
    if (dx * dx + dy * dy + dz * dz < LATTICE_NEAR * LATTICE_NEAR) {
      near += value * value;
      nearCount++;
    }
  }
  if (nearCount === 0 || !(all > 0)) return Number.NaN;
  return Math.sqrt(near / nearCount) / Math.sqrt(all / LATTICE_SAMPLES);
}

/** 열점 사슬 안 이웃 화산 사이 거리(실제 환산 km)의 변동 계수(표준편차 ÷ 평균)와 사슬 길이(화산 수) 범위 */
export function hotspotSpacing(
  seed: number,
  settings: PlanetSettings,
): {
  readonly cv: number;
  readonly chains: number;
  readonly meanGapKm: number;
  readonly minCones: number;
  readonly maxCones: number;
} {
  const continentalShare = Math.min(0.97, (settings.landPercent + settings.shelfPercent) / 100);
  const plates = createPlates(seed, settings.plateCount, continentalShare);
  const volcanoes = hotspotVolcanoes(
    seed,
    plates,
    streamSeed(seed, STREAM_PLATE_WARP),
    settings.hotspotCount,
    settings.volcanismPercent / 100,
    () => false,
  );
  const gaps: number[] = [];
  const cones = new Map<number, number>();
  for (let k = 0; k < volcanoes.length; k++) {
    const b = volcanoes[k];
    if (!b) continue;
    cones.set(b.chain, (cones.get(b.chain) ?? 0) + 1);
    const a = volcanoes[k - 1];
    if (!a || a.chain !== b.chain) continue;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    gaps.push(Math.sqrt(dx * dx + dy * dy + dz * dz) * REFERENCE_RADIUS_KM);
  }
  const lengths = [...cones.values()];
  const minCones = lengths.length > 0 ? Math.min(...lengths) : 0;
  const maxCones = lengths.length > 0 ? Math.max(...lengths) : 0;
  if (gaps.length === 0) return { cv: 0, chains: cones.size, meanGapKm: 0, minCones, maxCones };
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) * (gap - mean), 0) / gaps.length;
  return { cv: Math.sqrt(variance) / mean, chains: cones.size, meanGapKm: mean, minCones, maxCones };
}

/** 생성기 단위 지표(시드·설정마다): 최소 풍속, 노이즈 격자점, 열점 간격 */
export function unitMetrics(ctx: VarietyContext, seed: number, settings: PlanetSettings): VarietyMetric[] {
  const hotspots = hotspotSpacing(seed, settings);
  const [ox, oy, oz] = noiseOctaveLattice(LATTICE_SEED, 0);
  return [
    varietyMetric(
      "unit.windMinSpeed",
      windMinSpeed(ctx, seed),
      "minimum generator wind speed over all cells (calm → upwind = self → moisture reset)",
    ),
    varietyMetric(
      "unit.noiseLatticeRmsRatio",
      latticeRmsRatio(
        (x, y, z) => offsetFbm3(LATTICE_SEED, x, y, z, 1, 6, 0.52, LATTICE_JITTER),
        [ox, oy, oz],
      ),
      `noise v2 (offsetFbm3, jitter ${LATTICE_JITTER}) RMS within 0.1 of its octave-0 lattice vertices ÷ global`,
    ),
    varietyMetric(
      "unit.legacyFbmLatticeRmsRatio",
      latticeRmsRatio((x, y, z) => fbm3(LATTICE_SEED, x, y, z, 1, 6, 0.52)),
      "legacy fbm3 (plates, continents, relief, forest) — octave lattices nested → all octaves 0 at vertices",
    ),
    varietyMetric(
      "unit.hotspotSpacingCv",
      hotspots.cv,
      `${hotspots.chains} chains of ${hotspots.minCones}–${hotspots.maxCones} cones, mean gap ${hotspots.meanGapKm.toFixed(0)} km (real-eq)`,
    ),
  ];
}
