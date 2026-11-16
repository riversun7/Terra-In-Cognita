// 띄운 2차맵 위 조우 찾기(순수) — 기획 D-564 1641("적끼리 만나면 자동 조우" — 질문 1901 가: 띄운 2차맵 위에서도)·D-570(1904 "다른 나라면 모두
// 대상, 일정 거리 안에 유닛이나 분대가 들면 AI 판단"), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-570, 좌표 이동 3)".
// - 만남 = 한 2차맵에서 다른 나라 두 유닛이 체비쇼프 거리 radius칸 안. 적어도 한쪽은 판단하는 유닛(decider — 봇 아닌 전투 유닛)이어야 한다(NPC
//   휴먼·경비대끼리는 판단하지 않는다 — 질문 2024).
// - 부하(NAS: 유닛 3,297, 2차맵 55): 칸 격자(한 변 radius칸)에 유닛을 넣고, 판단하는 유닛만 둘레 3×3 칸을 본다. 판단하는 유닛이 없거나 나라가
//   하나뿐인 2차맵은 격자를 만들지 않는다. 그래서 NPC 도시 2차맵(봇뿐)은 유닛 수만큼 한 번 훑고 끝난다.
// - 결과 = 두 나라 짝마다 편 둘(그 짝의 상대 유닛과 만난 유닛, 유닛 ID 차례). 짝은 나라 ID 차례. 같은 입력이면 같은 답.

export interface ClashUnit {
  readonly unitId: number;
  readonly ownerId: number;
  readonly nation: number;
  /** 배치 칸 */
  readonly x: number;
  readonly y: number;
  /** 스스로 판단하는 유닛(봇 아닌 전투 유닛) */
  readonly decider: boolean;
}

export interface ClashContact {
  /** [작은 나라 ID, 큰 나라 ID] */
  readonly nations: readonly [number, number];
  /** nations 차례의 편 둘(유닛 ID 차례) */
  readonly sides: readonly [readonly ClashUnit[], readonly ClashUnit[]];
}

/** 격자 칸 키(배치 칸 0 ~ 255라 칸 수는 작다) */
const bucketKey = (bx: number, by: number): number => bx * 4096 + by;

export function findClashes(units: readonly ClashUnit[], radius: number): ClashContact[] {
  const reach = Math.max(1, Math.floor(radius));
  const nations = new Set<number>();
  let deciders = 0;
  for (const unit of units) {
    nations.add(unit.nation);
    if (unit.decider) deciders += 1;
  }
  if (deciders === 0 || nations.size < 2) return [];
  const grid = new Map<number, ClashUnit[]>();
  for (const unit of units) {
    const key = bucketKey(Math.floor(unit.x / reach), Math.floor(unit.y / reach));
    const list = grid.get(key);
    if (list) list.push(unit);
    else grid.set(key, [unit]);
  }
  // 짝 키 → [작은 나라 편, 큰 나라 편](유닛 ID → 유닛)
  const pairs = new Map<
    string,
    { nations: [number, number]; sides: [Map<number, ClashUnit>, Map<number, ClashUnit>] }
  >();
  const add = (a: ClashUnit, b: ClashUnit): void => {
    const low = a.nation < b.nation ? a : b;
    const high = low === a ? b : a;
    const key = `${low.nation}:${high.nation}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = { nations: [low.nation, high.nation], sides: [new Map(), new Map()] };
      pairs.set(key, pair);
    }
    pair.sides[0].set(low.unitId, low);
    pair.sides[1].set(high.unitId, high);
  };
  for (const unit of units) {
    if (!unit.decider) continue;
    const bx = Math.floor(unit.x / reach);
    const by = Math.floor(unit.y / reach);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(bucketKey(bx + dx, by + dy)) ?? []) {
          if (other.nation === unit.nation) continue;
          // 판단하는 유닛끼리는 한 번만(작은 유닛 ID 쪽에서)
          if (other.decider && other.unitId < unit.unitId) continue;
          if (Math.max(Math.abs(other.x - unit.x), Math.abs(other.y - unit.y)) > reach) continue;
          add(unit, other);
        }
      }
    }
  }
  const out: ClashContact[] = [];
  for (const pair of pairs.values()) {
    const byId = (side: Map<number, ClashUnit>) => [...side.values()].toSorted((a, b) => a.unitId - b.unitId);
    out.push({ nations: pair.nations, sides: [byId(pair.sides[0]), byId(pair.sides[1])] });
  }
  return out.toSorted((a, b) => a.nations[0] - b.nations[0] || a.nations[1] - b.nations[1]);
}
