// 성벽 뚫기 — 질문 1048 가(성벽·성문 시설이 공격을 늦춘다), D-533 "둘레 건물이 공격을 늦춤", 기획 45 "경로탐색은 건물을 장애물로만 본다.
// 성벽·골목의 방어 가치가 남는다"(D-135). 전투맵에 부술 수 있는 막음(성벽 wall·성문 gateSide)이 있을 때만 쓴다 — 없으면 옛 판정 그대로.
// - 뚫기 거리장: 넥서스 칸에서 넓혀 가는 걸음 비용. 지나갈 수 있는 칸 1, 그 편을 막는 서 있는 성벽·성문 칸은 1 + 뚫기 비용(시작 내구도 ÷
//   BREACH_POINTS_PER_STEP, 올림, 1~BREACH_MAX_STEPS). 다른 건물·막힌 지형은 못 지나간다. 대각선은 양옆 두 칸이 모두 지나가거나 뚫을 수
//   있어야 한다(fields.ts 모서리 규칙). 돌아가는 길이 뚫기보다 짧으면 돌아간다.
// - 공성 공격 편 유닛은 사거리 안 막음 칸 가운데 장 값이 지금 칸보다 작은(넥서스 쪽) 것을 친다. 정수·고정 이웃 차례(같은 입력이면 같은 장).
import type { BattleMap } from "./battleMap.ts";
import { NEIGHBORS, UNREACHABLE } from "./fields.ts";

/** [임시] 뚫기 비용 한 걸음 = 시작 내구도 이만큼(건물 피해 한 번이 수십~수백이라 한 걸음에 몇 대) */
export const BREACH_POINTS_PER_STEP = 100;
/** [임시] 막음 하나의 뚫기 비용 상한(걸음) */
export const BREACH_MAX_STEPS = 200;

/** 전투맵에 부술 수 있는 막음(성벽·성문)이 있나 */
export function hasBreakable(map: BattleMap): boolean {
  return map.buildings.some((building) => building.wall === true || building.gateSide !== undefined);
}

/** 그 칸이 편 side를 막는 서 있는 성벽·성문이면 그 건물, 아니면 undefined */
function blockingBreakable(map: BattleMap, cell: number, side: number, gone: ReadonlySet<number>) {
  const id = map.buildingAt[cell] ?? 0;
  if (id === 0 || gone.has(id)) return undefined;
  const building = map.buildings.find((entry) => entry.id === id);
  if (!building || (building.wall !== true && building.gateSide === undefined)) return undefined;
  return building.gateSide === side ? undefined : building;
}

/** 뚫기 거리장(못 닿으면 UNREACHABLE). 걸음 비용이 정수라 비용 칸 바구니(다이얼) 차례로 넓힌다 */
export function breachField(
  map: BattleMap,
  sources: readonly number[],
  side: number,
  gone: ReadonlySet<number>,
): Int32Array {
  const { size } = map;
  const cells = size * size;
  // 칸에 들어가는 비용: 0 = 못 감, 1 = 지나감, 그 밖 = 뚫기
  const enter = new Int32Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    if (map.passableFor(cell, side, gone)) enter[cell] = 1;
    else {
      const wall = blockingBreakable(map, cell, side, gone);
      if (wall)
        enter[cell] =
          1 + Math.min(BREACH_MAX_STEPS, Math.max(1, Math.ceil(wall.durability / BREACH_POINTS_PER_STEP)));
    }
  }
  const dist = new Int32Array(cells).fill(UNREACHABLE);
  const buckets: number[][] = [[]];
  for (const cell of sources) {
    if (dist[cell] !== UNREACHABLE) continue;
    dist[cell] = 0;
    buckets[0]?.push(cell);
  }
  for (let cost = 0; cost < buckets.length; cost++) {
    const bucket = buckets[cost] ?? [];
    for (let i = 0; i < bucket.length; i++) {
      const cell = bucket[i] ?? 0;
      if (dist[cell] !== cost) continue;
      const x = cell % size;
      const y = (cell - x) / size;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const to = ny * size + nx;
        const step = enter[to] ?? 0;
        if (step === 0) continue;
        if (dx !== 0 && dy !== 0 && ((enter[y * size + nx] ?? 0) === 0 || (enter[ny * size + x] ?? 0) === 0))
          continue;
        const next = cost + step;
        const known = dist[to] ?? UNREACHABLE;
        if (known !== UNREACHABLE && known <= next) continue;
        dist[to] = next;
        while (buckets.length <= next) buckets.push([]);
        buckets[next]?.push(to);
      }
    }
    buckets[cost] = [];
  }
  return dist;
}

/**
 * 칠 막음: 유닛 사거리(체비쇼프) 안 칸 가운데 그 편을 막는 서 있는 성벽·성문이고 장 값이 지금 칸보다 작은 것 — 가장 작은 값, 같으면 작은
 * 건물 ID. 없으면 undefined
 */
export function breachTarget(
  map: BattleMap,
  field: Int32Array,
  unit: { readonly x: number; readonly y: number; readonly range: number; readonly side: number },
  gone: ReadonlySet<number>,
): number | undefined {
  const { size } = map;
  const here = field[unit.y * size + unit.x] ?? UNREACHABLE;
  if (here === UNREACHABLE) return undefined;
  const reach = Math.max(1, unit.range);
  let best: { id: number; value: number } | undefined;
  for (let y = Math.max(0, unit.y - reach); y <= Math.min(size - 1, unit.y + reach); y++)
    for (let x = Math.max(0, unit.x - reach); x <= Math.min(size - 1, unit.x + reach); x++) {
      const cell = y * size + x;
      const value = field[cell] ?? UNREACHABLE;
      if (value === UNREACHABLE || value >= here) continue;
      const wall = blockingBreakable(map, cell, unit.side, gone);
      if (!wall) continue;
      if (!best || value < best.value || (value === best.value && wall.id < best.id))
        best = { id: wall.id, value };
    }
  return best?.id;
}
