// 경기장 = 2차맵 구역 — docs/adr/2026-11-01-battle-replay.md 3절, ADR 35 "전투맵 만들기"(2차맵 구역 복사).
// 2차맵 배치 칸(256²) 지형 비용(0 = 막힘)·엄폐 층(ADR 46: 0 없음·1 수풀·2 막힘)·꼭짓점 높이(cm, 지형 칸 128² → 꼭짓점 129²)에서
// 원점·한 변의 전투맵(battleMap.ts 모양: 통과 u8, 엄폐 u8, 높이 i32 16배 cm)을 만든다. 정수만 쓴다.
import type { BattleMapInput } from "./battleMap.ts";

export interface SecondMapLayers {
  /** 배치 칸 한 변(2차맵 256) */
  readonly size: number;
  /** 배치 칸 지형 비용(천분율, 0 = 막힘), size² */
  readonly costs: ArrayLike<number>;
  /** 배치 칸 엄폐 값, size². 없으면 모두 0 */
  readonly cover: ArrayLike<number> | null;
  /** 지형 칸 한 변(128). 배치 칸 한 변 = 지형 칸 × 2 */
  readonly terrainSize: number;
  /** 꼭짓점 높이(cm), (terrainSize + 1)², 행 우선 */
  readonly vertexHeightsCm: ArrayLike<number>;
}

/** 창을 보는 간격(칸) */
const ORIGIN_STEP = 16;

function checkLayers(layers: SecondMapLayers, arenaSize: number): void {
  const cells = layers.size * layers.size;
  if (layers.costs.length !== cells) throw new RangeError("costs must be size × size");
  if (layers.cover && layers.cover.length !== cells) throw new RangeError("cover must be size × size");
  if (layers.size !== layers.terrainSize * 2) throw new RangeError("placement size must be terrain size × 2");
  if (layers.vertexHeightsCm.length !== (layers.terrainSize + 1) * (layers.terrainSize + 1))
    throw new RangeError("vertex heights must be (terrain size + 1)²");
  if (arenaSize > layers.size) throw new RangeError("arena larger than the second map");
}

/**
 * 경기장 원점: ORIGIN_STEP 간격 창마다 지나갈 수 있는 칸 수가 가장 많은 곳. 같으면 수풀 칸이 많은 곳(엄폐가 보이게),
 * 그다음 작은 (y, x)
 */
export function pickArenaOrigin(layers: SecondMapLayers, arenaSize: number): { x: number; y: number } {
  checkLayers(layers, arenaSize);
  let best = { x: 0, y: 0, open: -1, bush: -1 };
  for (let oy = 0; oy + arenaSize <= layers.size; oy += ORIGIN_STEP) {
    for (let ox = 0; ox + arenaSize <= layers.size; ox += ORIGIN_STEP) {
      let open = 0;
      let bush = 0;
      for (let y = oy; y < oy + arenaSize; y++) {
        for (let x = ox; x < ox + arenaSize; x++) {
          const cell = y * layers.size + x;
          if ((layers.costs[cell] ?? 0) > 0) open += 1;
          if ((layers.cover?.[cell] ?? 0) === 1) bush += 1;
        }
      }
      if (open > best.open || (open === best.open && bush > best.bush)) best = { x: ox, y: oy, open, bush };
    }
  }
  return { x: best.x, y: best.y };
}

/** 2차맵 구역 → 전투맵. 높이 = 배치 칸이 든 지형 칸 꼭짓점 넷의 평균 × 16(16배 cm, 버림) */
export function arenaFromSecondMap(
  layers: SecondMapLayers,
  origin: { readonly x: number; readonly y: number },
  arenaSize: number,
): BattleMapInput {
  checkLayers(layers, arenaSize);
  if (
    origin.x < 0 ||
    origin.y < 0 ||
    origin.x + arenaSize > layers.size ||
    origin.y + arenaSize > layers.size
  )
    throw new RangeError("arena outside the second map");
  const cells = arenaSize * arenaSize;
  const passable = new Uint8Array(cells);
  const cover = new Uint8Array(cells);
  const height = new Int32Array(cells);
  const side = layers.terrainSize + 1;
  for (let y = 0; y < arenaSize; y++) {
    for (let x = 0; x < arenaSize; x++) {
      const px = origin.x + x;
      const py = origin.y + y;
      const source = py * layers.size + px;
      const cell = y * arenaSize + x;
      passable[cell] = (layers.costs[source] ?? 0) > 0 ? 1 : 0;
      cover[cell] = layers.cover?.[source] ?? 0;
      const tx = Math.floor(px / 2);
      const ty = Math.floor(py / 2);
      const sum =
        (layers.vertexHeightsCm[ty * side + tx] ?? 0) +
        (layers.vertexHeightsCm[ty * side + tx + 1] ?? 0) +
        (layers.vertexHeightsCm[(ty + 1) * side + tx] ?? 0) +
        (layers.vertexHeightsCm[(ty + 1) * side + tx + 1] ?? 0);
      height[cell] = sum * 4;
    }
  }
  // 구역 최저점을 0으로(battleMap.ts "바닥 높이: 구역 최저점 0")
  let lowest = Number.POSITIVE_INFINITY;
  for (const value of height) lowest = Math.min(lowest, value);
  for (let i = 0; i < cells; i++) height[i] = (height[i] ?? 0) - lowest;
  return { size: arenaSize, passable, cover, height, buildings: [] };
}
