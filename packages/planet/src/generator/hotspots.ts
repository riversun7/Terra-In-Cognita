// 열점 화산 사슬: 판이 열점 위를 지나며 남긴 화산(오래될수록 낮다) (tectonics.ts가 쓴다)
import { detExp } from "@terra/shared";
import { type Plate, plateAt, plateOf, plateVelocity } from "./plates.ts";
import { STREAM_HOTSPOTS, randomUnitVector, streamRng, uniform } from "./random.ts";
import { km } from "./util.ts";

export interface Volcano {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly radius: number;
}

/**
 * 열점 사슬: 판 이동 반대 방향으로 갈수록 낮아지는 화산 6개씩. 바다에서는 섬, 대륙에서는 낮은 화산 고원.
 * 열점 위치의 판·지각은 칸이 아니라 점에서 정한다(해상도와 무관하게 같은 사슬).
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
  const volcanoes: Volcano[] = [];
  for (let k = 0; k < hotspotCount; k++) {
    const [hx, hy, hz] = randomUnitVector(rng);
    const peak = uniform(rng, 0.75, 1.15);
    const ownerIndex = plateAt(plates, warpSeed, hx, hy, hz);
    let [vx, vy, vz] = plateVelocity(plateOf(plates, ownerIndex), hx, hy, hz);
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed > 1e-9) {
      vx /= speed;
      vy /= speed;
      vz /= speed;
    }
    const scale = isContinentalAt(hx, hy, hz, ownerIndex) ? 0.35 : 1;
    for (let step = 0; step < 6; step++) {
      // 판이 움직인 반대쪽으로 갈수록 오래된(낮은) 화산
      const back = step * km(240);
      const px = hx - vx * back;
      const py = hy - vy * back;
      const pz = hz - vz * back;
      const length = Math.sqrt(px * px + py * py + pz * pz);
      volcanoes.push({
        x: px / length,
        y: py / length,
        z: pz / length,
        height: 6200 * volcanism * scale * peak * (1 - 0.16 * step),
        radius: km(75 + 12 * step),
      });
    }
  }
  return volcanoes;
}

export function addVolcanoes(
  count: number,
  sx: Float64Array,
  sy: Float64Array,
  sz: Float64Array,
  elevation: Float32Array,
  volcanoes: readonly Volcano[],
): void {
  if (volcanoes.length === 0) return;
  for (let c = 0; c < count; c++) {
    const x = sx[c] ?? 0;
    const y = sy[c] ?? 0;
    const z = sz[c] ?? 0;
    let add = 0;
    for (const volcano of volcanoes) {
      const dx = x - volcano.x;
      const dy = y - volcano.y;
      const dz = z - volcano.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const r2 = volcano.radius * volcano.radius;
      if (d2 < 9 * r2) add += volcano.height * detExp(-d2 / r2);
    }
    if (add !== 0) elevation[c] = (elevation[c] ?? 0) + add;
  }
}
