// 2차맵 확대 단계(1~5) — 카메라 거리로 정한다(순수 함수, 시험 대상). 사용자 지적 2026-11-08 "화면 축소확대배율 표시 없음",
// docs/adr/2026-11-08-map-input.md 3절. 1차맵 확대 단계(planet/zoomStages.ts, ADR 2026-11-07-planet-view 1절)와 같은 규칙이다:
// - 거리 한계 [가장 가까이, 가장 멀리]를 로그 눈금으로 다섯 등분한다(1 = 가장 멀리·2차맵 전체 ~ 5 = 가장 가까이). 단계마다 거리 비가 같아
//   [+]·[−] 한 번의 느낌이 같다. 한계는 화면 크기와 보기 범위(플레이어 카메라 묶기, 기획 정리 630)에 따라 바뀌므로 단계도 그 한계 기준이다.
// - [+]·[−]는 이웃 단계의 대표 거리로 간다(1단계 = 가장 멀리, 2~5단계 = 띠의 기하 평균). 5단계에서 [+]는 가장 가까이까지, 1단계에서 [−]는
//   가장 멀리까지 간 뒤 한 번 더 누르면 끝(null) = 화면이 이 2차맵 자리의 1차맵 5단계로 넘어간다(D-6018).
// 1차맵 모듈을 가져오지 않는다: 2차맵 진입점(@terra/engine)에 행성 타일 코드가 묶이지 않게 같은 식을 따로 둔다.

/** 2차맵 확대 단계 수(1차맵과 같다 — 사다리 점 다섯 개) */
export const LOCAL_ZOOM_STAGES = 5;
/** 끝에 닿았다고 보는 여유(상대값) */
const EDGE_EPSILON = 1e-6;

/** 카메라 거리 한계(m) — CameraLimits의 일부 */
export interface DistanceRange {
  readonly minDistance: number;
  readonly maxDistance: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 단계 s(2~5)가 되는 거리 상한(m): 거리 < 상한이면 s단계 이상 */
function stageBelow(stage: number, range: DistanceRange): number {
  const ratio = range.minDistance / range.maxDistance;
  return range.maxDistance * ratio ** ((stage - 1) / LOCAL_ZOOM_STAGES);
}

/** 거리 → 단계(1 = 가장 멂 ~ 5 = 가장 가까움). 한계가 한 점이면(줄일 수 없음) 5 */
export function localZoomStage(distance: number, range: DistanceRange): number {
  if (range.maxDistance <= range.minDistance * (1 + EDGE_EPSILON)) return LOCAL_ZOOM_STAGES;
  let stage = 1;
  for (let s = 2; s <= LOCAL_ZOOM_STAGES; s++) {
    if (distance < stageBelow(s, range)) stage = s;
  }
  return stage;
}

/** 단계의 대표 거리(m) — 그 단계로 판정되는 거리. 1단계는 가장 멀리 */
export function localStageDistance(stage: number, range: DistanceRange): number {
  const s = clamp(Math.round(stage), 1, LOCAL_ZOOM_STAGES);
  if (s === 1) return range.maxDistance;
  const far = stageBelow(s, range);
  const near = s >= LOCAL_ZOOM_STAGES ? range.minDistance : stageBelow(s + 1, range);
  return Math.sqrt(near * far);
}

/** [+](direction 1)·[−](−1) 한 번에 갈 거리(m). 이미 그쪽 끝이면 null(화면이 1차맵으로 넘어갈지 정한다) */
export function localZoomStepTarget(
  distance: number,
  direction: 1 | -1,
  range: DistanceRange,
): number | null {
  const stage = localZoomStage(distance, range);
  if (direction === 1) {
    if (distance <= range.minDistance * (1 + EDGE_EPSILON)) return null;
    return stage < LOCAL_ZOOM_STAGES ? localStageDistance(stage + 1, range) : range.minDistance;
  }
  if (distance >= range.maxDistance * (1 - EDGE_EPSILON)) return null;
  return stage > 1 ? localStageDistance(stage - 1, range) : range.maxDistance;
}
