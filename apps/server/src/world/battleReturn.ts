// 전투에서 진 유닛·포로가 안전한 곳으로 실제로 걸어 돌아간다 — 사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다",
// 질문 2655(기획 정리: D-351·D-381이 정한 돌아갈 곳은 그대로, 방법만 바뀐다 — 바로 옮기기 → 실제 이동).
// - 돌아갈 곳: 그 2차맵에서 가장 가까운 안전 도시의 시청 칸 둘레(포로는 잡은 쪽 세력의 도시 — battleStart.ts safeCellFor, 도시가 없으면 2차맵 가운데).
//   같은 2차맵 안이라 2차맵 사이 이동(플레이어 = 이동 서비스, NPC = 2차맵 사이 NPC 이동 길)은 쓰지 않는다 — 2차맵 안 길 찾기(secondMap walkToSafety)로 걷는다.
// - 걷는 동안은 쓰지 못한다(유닛 상태 returningUntilMs — 명령·일·전투·파견에 들지 않는다, unitCondition.ts unavailable). 길 결과가 오기 전에는
//   RETURN_PLAN_HOLD_MS 동안 잡아 두고, 길이 나오면 닿는 시각으로, 길이 없으면 풀고 그 자리에 남긴다(순간이동하지 않는다).
// - 표시는 world_units.returning_until_ms에 저장해 다시 켜도 이어진다(움직임도 저장된다).
// - 바뀜(fixes-1117i, 사용자 결정 D-594 "부상입고 주거지 귀환"): 사이보그 본체는 자기 사는 곳으로 실제로 돌아갔다 — 아래 return-home이 대신한다.
// - 바뀜(return-home, D-594 보충·보충 2·보충 3): 적색 부상(빨강)으로 진 유닛(모든 유닛)만 강제 귀환하고, 그 귀환은 **순간이동**이다(D-591의 유일한 예외 —
//   returnHome → unitHome.ts teleport). 돌아갈 곳 = 사는 곳 → 소속 도시 → 소속 국가 정부 건물 → 적대 세력이 아닌 가까운 도시. 빨강이 아니면 그 자리에 남아 다시 싸운다.
//   걸어 돌아가기(walkBack)는 이제 포로만 쓴다(잡은 쪽 세력의 가장 가까운 안전 도시 — D-381·D-591).
import { type Motion, type SizeClass, anchorAt, positionAt } from "@terra/sim";
import type { SecondMap } from "./secondMap.ts";
import type { HomeTier, UnitHome } from "./unitHome.ts";

/** 길 결과가 오기 전 돌아가는 중으로 잡아 두는 시간(ms) [임시 — 길 찾기는 보통 수 ms] */
export const RETURN_PLAN_HOLD_MS = 60_000;

/** 그 유닛의 돌아가는 중 표시를 바꾼다(undefined = 지움). 지금 상태를 다시 읽어 다른 칸은 그대로 둔다 */
function markReturning(map: SecondMap, unitId: number, untilMs: number | undefined): void {
  const info = map.unitInfo(unitId);
  if (!info) return;
  const { returningUntilMs: _old, ...rest } = info.condition;
  map.setCondition(unitId, untilMs === undefined ? rest : { ...rest, returningUntilMs: untilMs });
}

/**
 * 진 유닛 하나를 안전한 곳으로 걸어 보낸다. 걷기 시작했으면 true(닿는 시각은 길 결과가 오면 상태에 적는다). 유닛·설 자리가 없으면 false(그 자리에 남는다).
 * 결과 적용(battleResults.ts) 안에서 동기로 부른다 — 잡아 두기는 같은 쓰기 묶음, 길 결과는 그 뒤
 */
export function walkBack(
  map: SecondMap,
  unitId: number,
  near: { readonly x: number; readonly y: number } | undefined,
  nowMs: number,
): boolean {
  if (!map.unitInfo(unitId)) return false;
  markReturning(map, unitId, nowMs + RETURN_PLAN_HOLD_MS);
  const started = map.walkToSafety(unitId, near, (arriveAtMs) => markReturning(map, unitId, arriveAtMs));
  if (!started) markReturning(map, unitId, undefined);
  return started;
}

/** returnHome이 읽는 세계 몫(battleResults.ts BattleWorld) */
interface HomeWorld {
  unitHome?: (() => UnitHome | undefined) | undefined;
}

/**
 * 적색 부상으로 진 유닛을 돌아갈 곳(사는 곳 → 소속 도시 → 소속 국가 정부 건물, unitHome.ts)으로 바로 옮긴다(D-594 보충 3 — D-591 "순간이동 없음"의
 * 유일한 예외). 옮겼으면 그 차례, 돌아갈 곳이 없거나 설 자리가 없으면 undefined(그 자리에 남는다). 결과 적용 안에서 동기로 부른다(같은 쓰기 묶음)
 */
export function returnHome(
  world: HomeWorld,
  map: SecondMap,
  unitId: number,
  info: { readonly ownerId: number; readonly size: SizeClass; readonly motion: Motion },
  nowMs: number,
): HomeTier | undefined {
  const home = world.unitHome?.();
  const here = anchorAt(positionAt(info.motion, nowMs), info.size);
  const target = home?.homeOf(unitId, info.ownerId, { mapKey: map.mapKey, ...here });
  if (!home || !target) return undefined;
  return home.teleport(map, unitId, info.ownerId, target, nowMs) ? target.tier : undefined;
}
