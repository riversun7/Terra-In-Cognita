// 2차맵 생성기 측정·그림(ADR 46 5·7절) — node bench/secondMap.ts <출력 폴더> [면 레벨] [자리] [격자 수]
// 자리: river·coast·lake·mountain(그런 칸이 든 블록을 면 0에서 찾는다) 또는 "면,i,j". 기본 river, 격자 4, 면 레벨 9.
// 콘텐츠 팩 S2 시험 행성을 면 레벨로 생성하고, 고른 자리부터 격자 수 × 격자 수 2차맵을 만든다.
// - 시간: 2차맵마다 생성 ms(p50·p95·최대), 행성 생성 ms.
// - 이음매: 이웃 쌍마다 공유 변 꼭짓점 높이·물 높이가 같은지(다르면 종료 코드 1).
// - 그림: 2차맵을 이어 붙인 한 장(높이 음영 + 지표 색 + 물), 경계선 없이(이음매가 보이면 안 된다). 출력 폴더는 저장소 밖 절대 경로.
import { mkdirSync, writeFileSync } from "node:fs";
import { cellKey } from "../src/cellKey.ts";
import { FACES, type Face } from "../src/faces.ts";
import { runPlanetGenerator } from "../src/generator/index.ts";
import {
  NO_WATER,
  SM_SURFACE,
  SM_TERRAIN,
  SM_VERTICES,
  type SecondMapTerrain,
  generateSecondMap,
  planetValuesFromGeneration,
} from "../src/secondMap/index.ts";
import { encodePng } from "./png.ts";
import { loadPackPlanet } from "./testPlanet.ts";

const [outDir, levelArg, placeArg, sizeArg] = process.argv.slice(2);
if (!outDir)
  throw new Error(
    "usage: node bench/secondMap.ts <출력 폴더> [면 레벨] [river|coast|lake|mountain|면,i,j] [격자 수]",
  );
const level = Number(levelArg ?? 9);
const n = 2 ** level;
const grid = Number(sizeArg ?? 4);

const planet = loadPackPlanet("s2_test_planet", level);
let t = performance.now();
const details = runPlanetGenerator(planet.input);
const planetMs = performance.now() - t;
const values = planetValuesFromGeneration(details.fields, details, planet.biomeIds);

/** 블록(면 0, 왼쪽 아래 (i, j))에 든 것 세기 */
function blockScore(kind: string, i0: number, j0: number): number {
  let ocean = 0;
  let river = 0;
  let lake = 0;
  let high = 0;
  for (let j = j0; j < j0 + grid; j++) {
    for (let i = i0; i < i0 + grid; i++) {
      const c = j * n + i;
      const w = values.water[c] ?? 0;
      if (w & 1) ocean++;
      if (w & 2) lake++;
      if (w & 4 && (values.river[c] ?? 0) >= 2) river++;
      if ((values.elevationM[c] ?? 0) > 250) high++;
    }
  }
  const cells = grid * grid;
  if (kind === "coast") return ocean > 0 && ocean < cells / 2 ? ocean + river : -1;
  if (kind === "lake") return lake > 0 && ocean === 0 ? lake * 10 + river : -1;
  if (kind === "mountain") return ocean === 0 ? high * 10 + river : -1;
  return ocean === 0 ? river : -1;
}
let face: Face = 0;
let ci = 0;
let cj = 0;
const place = placeArg ?? "river";
if (place.includes(",")) {
  const [f, i, j] = place.split(",").map(Number);
  face = FACES[f ?? 0] ?? 0;
  ci = i ?? 0;
  cj = j ?? 0;
} else {
  let best = -1;
  for (let j = 0; j + grid <= n; j += grid) {
    for (let i = 0; i + grid <= n; i += grid) {
      const score = blockScore(place, i, j);
      if (score > best) {
        best = score;
        ci = i;
        cj = j;
      }
    }
  }
}

const maps: { gx: number; gy: number; terrain: SecondMapTerrain }[] = [];
const times: number[] = [];
for (let gy = 0; gy < grid; gy++) {
  for (let gx = 0; gx < grid; gx++) {
    const key = cellKey(face, level, ci + gx, cj + grid - 1 - gy);
    t = performance.now();
    maps.push({ gx, gy, terrain: generateSecondMap(values, key) });
    times.push(performance.now() - t);
  }
}
const sorted = times.toSorted((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;

// 이음매: 오른쪽·아래 이웃과 공유 변(면 하나 안이라 열·행이 바로 맞는다)
let mismatches = 0;
const at = (gx: number, gy: number) => maps.find((m) => m.gx === gx && m.gy === gy)?.terrain;
for (const { gx, gy, terrain } of maps) {
  const right = at(gx + 1, gy);
  const below = at(gx, gy + 1);
  for (let k = 0; k < SM_VERTICES; k++) {
    if (right) {
      const a = k * SM_VERTICES + SM_TERRAIN;
      const b = k * SM_VERTICES;
      if (terrain.heightsCm[a] !== right.heightsCm[b] || terrain.waterLevelCm[a] !== right.waterLevelCm[b])
        mismatches++;
    }
    if (below) {
      const a = SM_TERRAIN * SM_VERTICES + k;
      if (terrain.heightsCm[a] !== below.heightsCm[k] || terrain.waterLevelCm[a] !== below.waterLevelCm[k])
        mismatches++;
    }
  }
}

// 그림: 지형 칸 하나 = 2화소
const SCALE = 2;
const width = grid * SM_TERRAIN * SCALE;
const rgb = new Uint8Array(width * width * 3);
const COLORS: Record<number, [number, number, number]> = {
  [SM_SURFACE.water]: [124, 190, 220],
  [SM_SURFACE.grass]: [143, 204, 115],
  [SM_SURFACE.dirt]: [201, 171, 125],
  [SM_SURFACE.rock]: [161, 161, 171],
  [SM_SURFACE.sand]: [230, 214, 163],
  [SM_SURFACE.gravel]: [178, 173, 158],
  [SM_SURFACE.snow]: [240, 245, 250],
  [SM_SURFACE.ice]: [204, 230, 242],
  [SM_SURFACE.mud]: [140, 128, 107],
  [SM_SURFACE.ash]: [115, 112, 117],
  [SM_SURFACE.shallowWater]: [158, 209, 214],
};
for (const { gx, gy, terrain } of maps) {
  for (let r = 0; r < SM_TERRAIN; r++) {
    for (let c = 0; c < SM_TERRAIN; c++) {
      const h = terrain.heightsCm;
      const v = r * SM_VERTICES + c;
      // 왼쪽 위 빛 음영(높이 차)
      const dx = (h[v + 1] ?? 0) - (h[v] ?? 0);
      const dy = (h[v + SM_VERTICES] ?? 0) - (h[v] ?? 0);
      const shade = Math.max(0.55, Math.min(1.3, 1 - (dx + dy) / 900));
      const water = (terrain.waterLevelCm[v] ?? NO_WATER) > (h[v] ?? 0);
      const base = COLORS[terrain.surface[r * SM_TERRAIN + c] ?? 1] ?? [255, 0, 255];
      const color = water ? [base[0] * 0.85, base[1] * 0.9, base[2]] : base.map((x) => x * shade);
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const px = (gx * SM_TERRAIN + c) * SCALE + sx;
          const py = (gy * SM_TERRAIN + r) * SCALE + sy;
          const o = (py * width + px) * 3;
          rgb[o] = Math.max(0, Math.min(255, Math.round(color[0] ?? 0)));
          rgb[o + 1] = Math.max(0, Math.min(255, Math.round(color[1] ?? 0)));
          rgb[o + 2] = Math.max(0, Math.min(255, Math.round(color[2] ?? 0)));
        }
      }
    }
  }
}
mkdirSync(outDir, { recursive: true });
const name = `second-map-F${level}-f${face}-${ci}-${cj}-${grid}x${grid}.png`;
writeFileSync(`${outDir}/${name}`, encodePng(width, width, rgb));
console.log(
  JSON.stringify(
    {
      level,
      face,
      cell: [ci, cj],
      maps: maps.length,
      planetMs: Math.round(planetMs),
      mapMs: { p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), max: +pct(1).toFixed(1) },
      seamMismatches: mismatches,
      image: `${outDir}/${name}`,
    },
    null,
    2,
  ),
);
if (mismatches > 0) process.exitCode = 1;
