// 편마다 시야 — ADR 35 "시야 판정"(틱 시작 위치), D-208·D-224 ⑥·D-227·D-235·D-5037
// 적 유닛 하나가 그 편 유닛 누구에게라도 보이면 그 편에 보인다(첫 관측자에서 멈춘다: 결과는 같고 계산만 준다).
// - 거리: dx² + dy² ≤ r² + r(정수), r = 시야 반지름(공식 모듈, 높이 보너스 포함). 공중 유닛은 높이 보너스를 받지 않는다.
// - 수풀(엄폐 1) 속 지상 유닛은 C24 거리(1칸) 안에서만 보인다. 수풀에서 공격하면 C25 틱 동안 드러난다.
//   공중 유닛은 수풀에 숨지 못한다(질문 25 기본안). "같은 수풀 안"은 아직 보지 않는다(R3 범위).
// - 시선: los.ts(차폐·언덕·건물, 공중은 늘 보임).
import type { BattleMap } from "./battleMap.ts";
import { COVER_BUSH } from "./battleMap.ts";
import type { CombatCoefficients } from "./coefficients.ts";
import { sightRadius } from "./formula.ts";
import { lineClear } from "./los.ts";

export interface Sighted {
  readonly id: number;
  readonly side: number;
  readonly x: number;
  readonly y: number;
  readonly wis: number;
  readonly agi: number;
  readonly eye: number;
  readonly air: boolean;
  readonly revealUntil: number;
}

/** 편 side에 보이는 적 ID(오름차순). observers·targets는 살아 있고 빠지지 않은 유닛만 넘긴다 */
export function visibleEnemies(
  map: BattleMap,
  side: number,
  observers: readonly Sighted[],
  targets: readonly Sighted[],
  tick: number,
  destroyed: ReadonlySet<number>,
  c: CombatCoefficients,
): number[] {
  const seen: number[] = [];
  const size = map.size;
  for (const target of targets) {
    if (target.side === side) continue;
    const hidden =
      !target.air && map.cover[target.y * size + target.x] === COVER_BUSH && target.revealUntil < tick;
    const gTarget = map.height[target.y * size + target.x] ?? 0;
    for (const observer of observers) {
      if (observer.side !== side) continue;
      const dx = observer.x - target.x;
      const dy = observer.y - target.y;
      const cheb = Math.max(dx < 0 ? -dx : dx, dy < 0 ? -dy : dy);
      if (hidden && cheb > c.bushSenseCells) continue;
      const heightDiff = observer.air ? 0 : (map.height[observer.y * size + observer.x] ?? 0) - gTarget;
      const r = sightRadius(observer.wis, observer.agi, heightDiff, c);
      if (dx * dx + dy * dy > r * r + r) continue;
      if (!lineClear(map, observer, target, destroyed)) continue;
      seen.push(target.id);
      break;
    }
  }
  return seen.toSorted((a, b) => a - b);
}
