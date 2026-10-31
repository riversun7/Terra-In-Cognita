// 반복 검사의 생성기 단위 지표(문서 4.1의 12~14, 출력 필드와 무관) — 시험·측정 전용.
// 바람이 멈추는 곳, 노이즈 격자점에서 꺼지는 정도, 열점 사슬 간격의 다양성. 생성기 함수와 생성기의 노이즈 설정
// (NoiseSetup 목록)을 그대로 쓰므로 생성기의 바람·노이즈·열점을 바꾸면 지표도 따라간다.
import type { PlanetSettings } from "@terra/shared";
import { CLIMATE_NOISES } from "./climate.ts";
import { WIND_NOISE } from "./climateWind.ts";
import { type Volcano, hotspotVolcanoes } from "./hotspots.ts";
import { LANDFORM_NOISES } from "./landforms.ts";
import {
  type NoiseSetup,
  fbm3,
  noiseOctaveLattice,
  offsetFbm3,
  offsetFbm3Pair,
  offsetRidged3,
} from "./noise.ts";
import { createPlates } from "./plates.ts";
import { STREAM_PLATE_WARP, mix32, streamSeed } from "./random.ts";
import { TECTONIC_NOISES } from "./tectonics.ts";
import { type VarietyMetric, generatorWind, varietyMetric } from "./testVariety.ts";
import type { VarietyContext } from "./testVarietyMeasures.ts";
import { REFERENCE_RADIUS_KM } from "./util.ts";

/** 격자점 지표: 결정적 표본 수, 표본 상자 한 변(노이즈 격자 단위), "격자점 근처" 반경 */
const LATTICE_SAMPLES = 200_000;
const LATTICE_BOX = 40;
const LATTICE_NEAR = 0.1;
/** 격자점 지표를 재는 노이즈 시드(격자 위치는 시드마다 다르지만 지표는 시드와 거의 무관하다) */
const LATTICE_SEED = 777;

/** 생성기가 쓰는 노이즈 2판 설정 전부(바람·기후·지형 틀·산맥) */
export const GENERATOR_NOISES: readonly NoiseSetup[] = [
  WIND_NOISE,
  ...CLIMATE_NOISES,
  ...LANDFORM_NOISES,
  ...TECTONIC_NOISES,
];

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

/** 표본 k의 좌표([0, 40)³, 정수 해시로 고른다) */
function samplePoint(k: number): [number, number, number] {
  return [
    (mix32(k * 3 + 1) / 4_294_967_296) * LATTICE_BOX,
    (mix32(k * 3 + 2) / 4_294_967_296) * LATTICE_BOX,
    (mix32(k * 3 + 3) / 4_294_967_296) * LATTICE_BOX,
  ];
}

/**
 * 노이즈가 격자점 근처에서 꺼지는 정도: 격자점(좌표 + offset이 정수인 점)에서 LATTICE_NEAR 안인 표본의 RMS ÷ 모든 표본의
 * RMS. 그라디언트 노이즈는 격자점에서 0이라, 옥타브 격자가 겹치면 이 값이 작다(격자 간격마다 평평한 점).
 * center를 주면 값에서 그 수를 뺀 RMS를 견준다(능선 노이즈처럼 0이 평균이 아닌 노이즈: 격자점에서 솟으면 1보다 크다).
 * 표본은 정수 해시로 고른 [0, 40)³의 점이다(결정적)
 */
export function latticeRmsRatio(
  noise: (x: number, y: number, z: number) => number,
  offset: readonly [number, number, number] = [0, 0, 0],
  center = 0,
): number {
  let all = 0;
  let near = 0;
  let nearCount = 0;
  for (let k = 0; k < LATTICE_SAMPLES; k++) {
    const [x, y, z] = samplePoint(k);
    const value = noise(x, y, z) - center;
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

/** 설정 하나의 노이즈 함수들(기본 주파수 1 = 격자 단위 좌표, 가장 많은 옥타브). 두 채널이면 둘 */
function setupNoises(setup: NoiseSetup): ((x: number, y: number, z: number) => number)[] {
  const { octaves, gain, jitter } = setup;
  if (setup.kind === "ridged")
    return [(x, y, z) => offsetRidged3(LATTICE_SEED, x, y, z, 1, octaves, gain, jitter)];
  if (setup.kind === "fbm") return [(x, y, z) => offsetFbm3(LATTICE_SEED, x, y, z, 1, octaves, gain, jitter)];
  const out = new Float64Array(2);
  return [0, 1].map((channel) => (x: number, y: number, z: number) => {
    offsetFbm3Pair(LATTICE_SEED, x, y, z, 1, octaves, gain, jitter, out);
    return out[channel] ?? 0;
  });
}

/** 표본 평균(능선 노이즈의 격자점 지표 기준) */
function sampleMean(noise: (x: number, y: number, z: number) => number): number {
  let sum = 0;
  for (let k = 0; k < LATTICE_SAMPLES; k++) {
    const [x, y, z] = samplePoint(k);
    sum += noise(x, y, z);
  }
  return sum / LATTICE_SAMPLES;
}

export interface LatticeSummary {
  /** fBm·두 채널 설정 중 가장 작은 격자점 RMS 비와 그 설정 */
  readonly worst: number;
  readonly worstName: string;
  /** 능선 설정 중 1에서 가장 먼 비(평균을 뺀 RMS 비)와 그 설정 */
  readonly ridged: number;
  readonly ridgedName: string;
  /** 설정마다 값(보고) */
  readonly bySetup: Readonly<Record<string, number>>;
}

let latticeCache: LatticeSummary | undefined;

/** 생성기 노이즈 2판 설정마다 격자점 지표(시드와 무관해서 한 번만 잰다) */
export function generatorLattice(): LatticeSummary {
  if (latticeCache) return latticeCache;
  const [ox, oy, oz] = noiseOctaveLattice(LATTICE_SEED, 0);
  const bySetup: Record<string, number> = {};
  let worst = Number.POSITIVE_INFINITY;
  let worstName = "";
  let ridged = 1;
  let ridgedName = "";
  for (const setup of GENERATOR_NOISES) {
    for (const [channel, noise] of setupNoises(setup).entries()) {
      const name = setup.kind === "pair" ? `${setup.name} ${channel === 0 ? "A" : "B"}` : setup.name;
      if (setup.kind === "ridged") {
        const ratio = latticeRmsRatio(noise, [ox, oy, oz], sampleMean(noise));
        bySetup[name] = ratio;
        if (Math.abs(ratio - 1) > Math.abs(ridged - 1)) {
          ridged = ratio;
          ridgedName = name;
        }
      } else {
        const ratio = latticeRmsRatio(noise, [ox, oy, oz]);
        bySetup[name] = ratio;
        if (ratio < worst) {
          worst = ratio;
          worstName = name;
        }
      }
    }
  }
  latticeCache = { worst, worstName, ridged, ridgedName, bySetup };
  return latticeCache;
}

export interface HotspotSpacing {
  /** 모든 사슬의 이웃 화산 사이 거리를 한데 모은 변동 계수 */
  readonly cv: number;
  /** 사슬마다(간격 2개 이상) 변동 계수의 평균: 사슬 하나가 고르게 늘어서면 작다 */
  readonly chainCvMean: number;
  /** 사슬마다(화산 3개 이상) 첫 화산 → 끝 화산 현 길이 ÷ 걸음 길이 합의 평균(1 = 곧은 줄) */
  readonly straightness: number;
  readonly chains: number;
  readonly meanGapKm: number;
  readonly minCones: number;
  readonly maxCones: number;
}

const chordKm = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * REFERENCE_RADIUS_KM;
};

const coefficientOfVariation = (values: readonly number[]): number => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return mean > 0 ? Math.sqrt(variance) / mean : 0;
};

/** 평균(빈 목록은 0) */
const meanOf = (values: readonly number[]): number =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** 열점 사슬 안 이웃 화산 사이 거리(실제 환산 km)의 다양성, 사슬 모양, 사슬 길이(화산 수) 범위 */
export function hotspotSpacing(seed: number, settings: PlanetSettings): HotspotSpacing {
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
  const byChain = new Map<number, Volcano[]>();
  for (const volcano of volcanoes) {
    const chain = byChain.get(volcano.chain);
    if (chain) chain.push(volcano);
    else byChain.set(volcano.chain, [volcano]);
  }
  const gaps: number[] = [];
  const chainCvs: number[] = [];
  const straight: number[] = [];
  for (const chain of byChain.values()) {
    const steps = chain.slice(1).map((volcano, k) => chordKm(chain[k] ?? volcano, volcano));
    gaps.push(...steps);
    if (steps.length >= 2) chainCvs.push(coefficientOfVariation(steps));
    const path = steps.reduce((sum, step) => sum + step, 0);
    const first = chain[0];
    const last = chain[chain.length - 1];
    if (chain.length >= 3 && first && last && path > 0) straight.push(chordKm(first, last) / path);
  }
  const lengths = [...byChain.values()].map((chain) => chain.length);
  return {
    cv: gaps.length > 0 ? coefficientOfVariation(gaps) : 0,
    chainCvMean: meanOf(chainCvs),
    straightness: meanOf(straight),
    chains: byChain.size,
    meanGapKm: meanOf(gaps),
    minCones: lengths.length > 0 ? Math.min(...lengths) : 0,
    maxCones: lengths.length > 0 ? Math.max(...lengths) : 0,
  };
}

/** 생성기 단위 지표(시드·설정마다): 최소 풍속, 노이즈 격자점(생성기 설정 전부), 열점 간격·모양 */
export function unitMetrics(ctx: VarietyContext, seed: number, settings: PlanetSettings): VarietyMetric[] {
  const hotspots = hotspotSpacing(seed, settings);
  const lattice = generatorLattice();
  return [
    varietyMetric(
      "unit.windMinSpeed",
      windMinSpeed(ctx, seed),
      "minimum generator wind speed over all cells (calm → upwind = self → moisture reset)",
    ),
    varietyMetric(
      "unit.noiseLatticeRmsRatio",
      lattice.worst,
      `worst of the generator's noise v2 fBm/pair setups (${GENERATOR_NOISES.length} setups, worst: ${lattice.worstName}): RMS within 0.1 of octave-0 lattice vertices ÷ global`,
    ),
    varietyMetric(
      "unit.ridgedLatticeRmsRatio",
      lattice.ridged,
      `ridged setups (worst: ${lattice.ridgedName}): same ratio of (value − mean); > 1 = ridges peak at lattice vertices`,
    ),
    varietyMetric(
      "unit.legacyFbmLatticeRmsRatio",
      latticeRmsRatio((x, y, z) => fbm3(LATTICE_SEED, x, y, z, 1, 6, 0.52)),
      "legacy fbm3 (plates, continents, relief, forest) — octave lattices nested → all octaves 0 at vertices",
    ),
    varietyMetric(
      "unit.hotspotSpacingCv",
      hotspots.cv,
      `${hotspots.chains} chains of ${hotspots.minCones}–${hotspots.maxCones} cones, mean gap ${hotspots.meanGapKm.toFixed(0)} km (real-eq), all gaps pooled`,
    ),
    varietyMetric(
      "unit.hotspotChainCvMean",
      hotspots.chainCvMean,
      "mean over chains (≥ 2 gaps) of the gap CV inside one chain",
    ),
    varietyMetric(
      "unit.hotspotChainStraightness",
      hotspots.straightness,
      "mean over chains (≥ 3 cones) of end-to-end chord ÷ path length (1 = straight row)",
    ),
  ];
}
