// 열점 화산 사슬: 판이 열점 위를 지나며 남긴 화산(오래될수록 낮다) (tectonics.ts가 쓴다)
// 출력 판 3(다양성 고침 3단계): 사슬마다 화산 수·간격·굽음·낮아지는 비율·크기가 다르다. 열점 위치·첫 화산 세기는
// STREAM_HOTSPOTS(판 2와 같은 뽑기 순서), 사슬 모양은 STREAM_HOTSPOT_SHAPE에서 뽑는다.
import { detCos, detExp, detSin } from "@terra/shared";
import type { PlanetGrid } from "./grid.ts";
import { type Plate, plateAt, plateOf, plateVelocity } from "./plates.ts";
import {
  STREAM_HOTSPOTS,
  STREAM_HOTSPOT_SHAPE,
  randomUnitVector,
  streamRng,
  uniform,
  unitFloat,
} from "./random.ts";
import { km } from "./util.ts";

export interface Volcano {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly radius: number;
  /** 사슬 번호(열점 순서). 같은 사슬 안에서는 열점에서 가까운(젊은) 화산부터 */
  readonly chain: number;
}

/** 사슬 하나의 화산 수 범위(양 끝 포함) */
export const HOTSPOT_MIN_CONES = 3;
export const HOTSPOT_MAX_CONES = 12;
/** 이웃 화산 사이 기준 간격과 그 배율 범위(걸음마다 따로 뽑는다) */
const HOTSPOT_SPACING = km(240);
const SPACING_MIN = 0.65;
const SPACING_MAX = 1.35;
/** 걸음마다 사슬 방향이 굽는 각도 범위(도) */
const BEND_DEGREES = 12;
/** 걸음마다 높이가 줄어드는 비율 범위(사슬마다 하나): 높이 × (1 − 비율)^걸음 */
const DECAY_MIN = 0.08;
const DECAY_MAX = 0.2;
/** 화산 반지름 배율 범위(화산마다) */
const RADIUS_MIN = 0.8;
const RADIUS_MAX = 1.2;
const RADIANS_PER_DEGREE = Math.PI / 180;

/**
 * 열점 사슬: 판 이동 반대 방향으로 갈수록 오래되어 낮아지는 화산 3~12개. 걸음마다 간격(240km × 0.65~1.35)과 방향
 * (±12°)이 바뀌어 사슬이 휘고, 낮아지는 비율(걸음마다 8~20%)과 화산 크기(× 0.8~1.2)도 사슬·화산마다 다르다.
 * 바다에서는 섬(오래된 것은 바닷속 산), 대륙에서는 낮은 화산 고원. 열점 위치의 판·지각은 칸이 아니라 점에서 정한다
 * (해상도와 무관하게 같은 사슬).
 */
export function hotspotVolcanoes(
  seed: number,
  plates: readonly Plate[],
  warpSeed: number,
  hotspotCount: number,
  volcanism: number,
  isContinentalAt: (x: number, y: number, z: number, owner: number) => boolean,
): Volcano[] {
  const rng = streamRng(seed, STREAM_HOTSPOTS);
  const shape = streamRng(seed, STREAM_HOTSPOT_SHAPE);
  const volcanoes: Volcano[] = [];
  for (let k = 0; k < hotspotCount; k++) {
    const [hx, hy, hz] = randomUnitVector(rng);
    const peak = uniform(rng, 0.75, 1.15);
    const ownerIndex = plateAt(plates, warpSeed, hx, hy, hz);
    // 사슬 방향: 판이 움직인 반대쪽(접선, 단위 벡터. 판이 멈춘 곳이면 0 → 화산이 한 곳에 겹친다)
    let [dx, dy, dz] = plateVelocity(plateOf(plates, ownerIndex), hx, hy, hz);
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (speed > 1e-9) {
      dx = -dx / speed;
      dy = -dy / speed;
      dz = -dz / speed;
    }
    const scale = isContinentalAt(hx, hy, hz, ownerIndex) ? 0.35 : 1;
    const cones =
      HOTSPOT_MIN_CONES + Math.floor((HOTSPOT_MAX_CONES - HOTSPOT_MIN_CONES + 1) * unitFloat(shape));
    const keep = 1 - uniform(shape, DECAY_MIN, DECAY_MAX);
    let px = hx;
    let py = hy;
    let pz = hz;
    let height = 6200 * volcanism * scale * peak;
    for (let step = 0; step < cones; step++) {
      volcanoes.push({
        x: px,
        y: py,
        z: pz,
        height,
        radius: km(75 + 12 * step) * uniform(shape, RADIUS_MIN, RADIUS_MAX),
        chain: k,
      });
      height *= keep;
      // 다음 화산: 방향을 지금 점의 접평면에서 돌리고(로드리게스, 축 = 점), 간격만큼 나아가 구 위로 되돌린다
      const spacing = HOTSPOT_SPACING * uniform(shape, SPACING_MIN, SPACING_MAX);
      const bend = uniform(shape, -BEND_DEGREES, BEND_DEGREES) * RADIANS_PER_DEGREE;
      const cos = detCos(bend);
      const sin = detSin(bend);
      const ex = py * dz - pz * dy;
      const ey = pz * dx - px * dz;
      const ez = px * dy - py * dx;
      dx = cos * dx + sin * ex;
      dy = cos * dy + sin * ey;
      dz = cos * dz + sin * ez;
      const qx = px + dx * spacing;
      const qy = py + dy * spacing;
      const qz = pz + dz * spacing;
      const length = Math.sqrt(qx * qx + qy * qy + qz * qz);
      px = qx / length;
      py = qy / length;
      pz = qz / length;
      // 새 점의 접평면으로 방향을 다시 맞춘다(길이 1)
      const along = dx * px + dy * py + dz * pz;
      dx -= along * px;
      dy -= along * py;
      dz -= along * pz;
      const norm = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (norm > 1e-12) {
        dx /= norm;
        dy /= norm;
        dz /= norm;
      }
    }
  }
  return volcanoes;
}

/** 화산이 높이를 더하는 거리 상한: 반지름의 3배(그 밖은 e^-9 미만이라 버린다) */
const VOLCANO_REACH = 3;
/** 묶음 한 변의 칸 수: 면마다 이만큼씩 칸을 묶어 묶음에 닿을 수 있는 화산만 본다 */
const BLOCK_CELLS = 16;
/** 묶음 거르기 여유(단위 구 거리). 실수 반올림으로 경계의 화산을 빠뜨리지 않게 */
const BLOCK_MARGIN = 1e-6;

/**
 * 화산 높이를 더한다: 칸마다 반지름 3배 안의 화산마다 높이 × e^(−거리²/반지름²). 좌표는 무늬 공간(sx, sy, sz).
 * 칸을 면마다 16 × 16 묶음으로 나누고, 묶음에 닿을 수 있는 화산만 화산 번호 순서로 본다. 빠지는 화산은 그 묶음의
 * 모든 칸에서 거리가 3배 반지름을 넘어 어차피 더하지 않던 것이라, 결과는 모든 화산을 보는 계산과 비트까지 같다
 * (시험: hotspots.test.ts). 화산이 많아도(열점 64개 × 12) 칸마다 가까운 몇 개만 본다.
 */
export function addVolcanoes(
  grid: PlanetGrid,
  sx: Float64Array,
  sy: Float64Array,
  sz: Float64Array,
  elevation: Float32Array,
  volcanoes: readonly Volcano[],
): void {
  if (volcanoes.length === 0) return;
  const { n, faceCells } = grid;
  const blocksPerSide = Math.ceil(n / BLOCK_CELLS);
  const candidates: number[] = [];
  for (let face = 0; face < 6; face++) {
    for (let bj = 0; bj < blocksPerSide; bj++) {
      for (let bi = 0; bi < blocksPerSide; bi++) {
        const j0 = bj * BLOCK_CELLS;
        const i0 = bi * BLOCK_CELLS;
        const j1 = Math.min(n, j0 + BLOCK_CELLS);
        const i1 = Math.min(n, i0 + BLOCK_CELLS);
        // 묶음 중심(칸 중심들의 평균)과 그 중심에서 가장 먼 칸까지 거리
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const c = face * faceCells + j * n + i;
            cx += sx[c] ?? 0;
            cy += sy[c] ?? 0;
            cz += sz[c] ?? 0;
          }
        }
        const cells = (j1 - j0) * (i1 - i0);
        cx /= cells;
        cy /= cells;
        cz /= cells;
        let spread2 = 0;
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const c = face * faceCells + j * n + i;
            const ex = (sx[c] ?? 0) - cx;
            const ey = (sy[c] ?? 0) - cy;
            const ez = (sz[c] ?? 0) - cz;
            spread2 = Math.max(spread2, ex * ex + ey * ey + ez * ez);
          }
        }
        const spread = Math.sqrt(spread2);
        candidates.length = 0;
        for (let v = 0; v < volcanoes.length; v++) {
          const volcano = volcanoes[v];
          if (!volcano) continue;
          const ex = volcano.x - cx;
          const ey = volcano.y - cy;
          const ez = volcano.z - cz;
          const reach = spread + VOLCANO_REACH * volcano.radius + BLOCK_MARGIN;
          if (ex * ex + ey * ey + ez * ez <= reach * reach) candidates.push(v);
        }
        if (candidates.length === 0) continue;
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const c = face * faceCells + j * n + i;
            const x = sx[c] ?? 0;
            const y = sy[c] ?? 0;
            const z = sz[c] ?? 0;
            let add = 0;
            for (const v of candidates) {
              const volcano = volcanoes[v];
              if (!volcano) continue;
              const ex = x - volcano.x;
              const ey = y - volcano.y;
              const ez = z - volcano.z;
              const d2 = ex * ex + ey * ey + ez * ez;
              const r2 = volcano.radius * volcano.radius;
              if (d2 < VOLCANO_REACH * VOLCANO_REACH * r2) add += volcano.height * detExp(-d2 / r2);
            }
            if (add !== 0) elevation[c] = (elevation[c] ?? 0) + add;
          }
        }
      }
    }
  }
}
