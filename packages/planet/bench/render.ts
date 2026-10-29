// 생성 결과 눈으로 보기 — 면마다(고도·바이옴·기온) PNG와 등장방형(경위도) 전체 그림, 요약 수치를 낸다.
// 실행: pnpm --filter @terra/planet render <출력 폴더> [면 레벨, 기본 7] [시드(생략 시 팩 값)]
// 또는 packages/planet에서 node bench/render.ts <출력 폴더> 7. pnpm test에 넣지 않는다.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodeCellKey } from "../src/cellKey.ts";
import { buildGrid, neighbors8 } from "../src/generator/grid.ts";
import {
  CELL_DRY,
  type PlanetFields,
  WATER_LAKE,
  WATER_OCEAN,
  runPlanetGenerator,
} from "../src/generator/index.ts";
import { xyzToCell } from "../src/projection.ts";
import { encodePng } from "./png.ts";
import { loadPackPlanet } from "./testPlanet.ts";

type Rgb = [number, number, number];

const outArg = process.argv[2];
if (!outArg) {
  console.error("사용: node bench/render.ts <출력 폴더> [면 레벨] [시드]");
  process.exit(2);
}
const outDir: string = outArg;
const faceLevel = Number(process.argv[3] ?? 7);
const planet = loadPackPlanet("s2_test_planet", faceLevel);
const seedArg = process.argv[4];
const input = seedArg === undefined ? planet.input : { ...planet.input, seed: Number(seedArg) };
const started = performance.now();
const { fields, basinKind } = runPlanetGenerator(input);
const elapsed = performance.now() - started;
const n = 2 ** faceLevel;
mkdirSync(outDir, { recursive: true });

// 칸마다 언덕 그림자(북서쪽 빛): 이웃과의 높이 차로 기울기를 어림한다. 화소가 아니라 칸에서 계산해 계단 무늬가 없다
const grid = buildGrid(faceLevel);
const shade = new Float32Array(grid.cellCount);
{
  const out = new Int32Array(8);
  for (let c = 0; c < grid.cellCount; c++) {
    const x = grid.x[c] ?? 0;
    const y = grid.y[c] ?? 0;
    const z = grid.z[c] ?? 0;
    const horizontal = Math.hypot(x, y) || 1;
    const [ex, ey] = [-y / horizontal, x / horizontal];
    const [nx, ny, nz] = [-z * ey, z * ex, x * ey - y * ex];
    const [lx, ly, lz] = [nx - ex, ny - ey, nz];
    neighbors8(grid, c, out);
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (const other of out) {
      if (other < 0) continue;
      const dx = (grid.x[other] ?? 0) - x;
      const dy = (grid.y[other] ?? 0) - y;
      const dz = (grid.z[other] ?? 0) - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const dh = (fields.elevationM[other] ?? 0) - (fields.elevationM[c] ?? 0);
      gx += (dh * dx) / d2;
      gy += (dh * dy) / d2;
      gz += (dh * dz) / d2;
    }
    const toward = ((gx * lx + gy * ly + gz * lz) / Math.SQRT2) * grid.meanCellAngle;
    shade[c] = Math.min(1.4, Math.max(0.6, 1 - 0.006 * toward));
  }
}

const hexToRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
const biomeColors = planet.colors.map(hexToRgb);
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** 구간별 선형 색 띠: stops는 값 오름차순 [값, 색] */
function ramp(stops: readonly (readonly [number, Rgb])[], value: number): Rgb {
  let previous: readonly [number, Rgb] | undefined;
  for (const stop of stops) {
    if (value <= stop[0])
      return previous ? mix(previous[1], stop[1], (value - previous[0]) / (stop[0] - previous[0])) : stop[1];
    previous = stop;
  }
  return previous ? previous[1] : [255, 0, 255];
}
// 고도(게임 m): 바다는 깊이, 땅은 초록 → 노랑 → 갈색 → 흰색
const OCEAN_STOPS: [number, Rgb][] = [
  [-500, [12, 30, 70]],
  [-250, [25, 60, 120]],
  [-20, [50, 105, 175]],
  [0, [90, 150, 210]],
];
const LAND_STOPS: [number, Rgb][] = [
  [0, [70, 130, 70]],
  [40, [110, 160, 80]],
  [120, [200, 190, 110]],
  [260, [150, 110, 70]],
  [450, [120, 100, 90]],
  [600, [245, 245, 245]],
];
const TEMPERATURE_STOPS: [number, Rgb][] = [
  [-40, [40, 0, 120]],
  [-20, [60, 90, 220]],
  [0, [120, 210, 240]],
  [10, [120, 200, 120]],
  [20, [240, 220, 80]],
  [30, [230, 80, 40]],
  [40, [140, 0, 20]],
];
const PRECIPITATION_STOPS: [number, Rgb][] = [
  [0, [180, 140, 90]],
  [300, [225, 205, 140]],
  [800, [120, 180, 90]],
  [1800, [40, 120, 70]],
  [3500, [30, 70, 160]],
];

type Layer = "elevation" | "biome" | "temperature" | "precipitation" | "humidity";
const LAYERS: readonly Layer[] = ["elevation", "biome", "temperature", "precipitation", "humidity"];

function colorOf(layer: Layer, c: number, data: PlanetFields): Rgb {
  const water = data.water[c] ?? 0;
  const river = data.river[c] ?? 0;
  const riverColor: Rgb = [40, 90, 200];
  switch (layer) {
    case "elevation": {
      const h = data.elevationM[c] ?? 0;
      if (water & WATER_OCEAN) return ramp(OCEAN_STOPS, h);
      if (water & WATER_LAKE) return [70, 140, 220];
      const s = shade[c] ?? 1;
      const [r, g, b] = ramp(LAND_STOPS, h);
      const land: Rgb = [r * s, g * s, b * s];
      if (river >= 2) return mix(land, riverColor, Math.min(1, 0.35 + 0.15 * river));
      return land;
    }
    case "biome": {
      const base = biomeColors[data.biome[c] ?? 0] ?? [255, 0, 255];
      if (basinKind[c] === CELL_DRY) return mix(base, [255, 255, 255], 0.35);
      if (river >= 2 && !(water & (WATER_OCEAN | WATER_LAKE)))
        return mix(base, riverColor, Math.min(1, 0.3 + 0.15 * river));
      return base;
    }
    case "temperature":
      return ramp(TEMPERATURE_STOPS, data.temperatureC[c] ?? 0);
    case "precipitation":
      return ramp(PRECIPITATION_STOPS, data.precipitationMm[c] ?? 0);
    default: {
      const h = data.humidity[c] ?? 0;
      return water & WATER_OCEAN ? [30, 40, 60] : ramp(PRECIPITATION_STOPS, (h / 255) * 3500);
    }
  }
}

function save(name: string, width: number, height: number, rgb: Uint8Array): void {
  writeFileSync(path.join(outDir, name), encodePng(width, height, rgb));
}

// 면마다: 2배로 키워 저장(행 = j, 위가 j 큰 쪽)
const scale = n <= 128 ? 2 : 1;
for (let face = 0; face < 6; face++) {
  for (const layer of ["elevation", "biome", "temperature"] as const) {
    const size = n * scale;
    const rgb = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) {
      const j = n - 1 - Math.floor(y / scale);
      for (let x = 0; x < size; x++) {
        const i = Math.floor(x / scale);
        const [r, g, b] = colorOf(layer, face * n * n + j * n + i, fields);
        const at = (y * size + x) * 3;
        // 언덕 그림자(× 최대 1.4)로 255를 넘으면 바이트에 넣을 때 돌아가 엉뚱한 색이 된다: 자른다
        rgb[at] = Math.min(255, r);
        rgb[at + 1] = Math.min(255, g);
        rgb[at + 2] = Math.min(255, b);
      }
    }
    save(`face${face}-${layer}.png`, size, size, rgb);
  }
}

// 등장방형 전체 그림(경도 −180~180, 위도 90~−90). 고도에는 언덕 그림자를 더한다. 적도에서 칸 하나 ≈ 화소 하나
const width = Math.max(1024, 4 * n);
const height = width / 2;
const cellAt = new Int32Array(width * height);
for (let py = 0; py < height; py++) {
  const lat = Math.PI / 2 - ((py + 0.5) / height) * Math.PI;
  for (let px = 0; px < width; px++) {
    const lon = ((px + 0.5) / width) * 2 * Math.PI - Math.PI;
    const key = xyzToCell(
      [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)],
      faceLevel,
    );
    const { face, i, j } = decodeCellKey(key);
    cellAt[py * width + px] = face * n * n + j * n + i;
  }
}
for (const layer of LAYERS) {
  const rgb = new Uint8Array(width * height * 3);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const c = cellAt[py * width + px] ?? 0;
      const [r, g, b] = colorOf(layer, c, fields);
      const at = (py * width + px) * 3;
      rgb[at] = Math.min(255, r);
      rgb[at + 1] = Math.min(255, g);
      rgb[at + 2] = Math.min(255, b);
    }
  }
  save(`equirect-${layer}.png`, width, height, rgb);
}

// 요약 수치
const total = 6 * n * n;
let land = 0;
let lakes = 0;
let rivers = 0;
let dry = 0;
let maxH = -Infinity;
let minH = Infinity;
let maxOrder = 0;
const biomeCount = Array.from({ length: planet.biomeIds.length }, () => 0);
for (let c = 0; c < total; c++) {
  const water = fields.water[c] ?? 0;
  if (!(water & WATER_OCEAN)) land++;
  if (water & WATER_LAKE) lakes++;
  if ((fields.river[c] ?? 0) > 0) rivers++;
  if (basinKind[c] === CELL_DRY) dry++;
  maxOrder = Math.max(maxOrder, fields.river[c] ?? 0);
  maxH = Math.max(maxH, fields.elevationM[c] ?? 0);
  minH = Math.min(minH, fields.elevationM[c] ?? 0);
  biomeCount[fields.biome[c] ?? 0] = (biomeCount[fields.biome[c] ?? 0] ?? 0) + 1;
}
const pct = (value: number) => `${((100 * value) / total).toFixed(1)}%`;
console.log(
  `면 레벨 ${faceLevel} (칸 ${total.toLocaleString()}), 시드 ${input.seed}, ${elapsed.toFixed(0)} ms, 해시 ${fields.meta.hash}`,
);
console.log(
  `육지(칸 수) ${pct(land)}, 호수 ${pct(lakes)}, 강 칸 ${pct(rivers)} (최대 등급 ${maxOrder}), 마른 분지 ${pct(dry)}`,
);
console.log(`고도 ${minH} ~ ${maxH} 게임 m (실제 환산 ${minH * 12} ~ ${maxH * 12} m)`);
console.log(
  `바이옴: ${planet.biomeIds.map((id, index) => `${id} ${pct(biomeCount[index] ?? 0)}`).join(", ")}`,
);
console.log(`그림: ${outDir}`);
