// 1차맵 확대 단계(1~5) — 카메라 거리로 정한다(순수 함수, 시험 대상). 기획 D-107(1차맵 단계별 정보 층 1~5),
// D-6018(5단계에서 더 키우면 2차맵, 사용자 요청 2026-11-07: 1단계에서 더 줄이면 항성계), ADR 2026-11-07-planet-view 1절.
// - 단계는 카메라 거리 한계 [가장 가까이, 가장 멀리]를 로그 눈금으로 다섯 등분한다(1 = 행성 전체 ~ 5 = 2차맵 몇 장).
//   LOD 단계(타일 맵 레벨, stats.primaryLevel)와는 다르다: 1:12 행성을 휴대폰 세로로 보면 가장 멀리서도 LOD가 3단계 타일을 그려
//   LOD로는 1·2단계를 볼 수 없다(2026-11-07 계산: 반지름 531km, 가장 멀리 약 3,150km, 3단계 경계 약 3,480km). 그래서 화면 단계는
//   거리만 보고, 타일을 받는 중에도 흔들리지 않는다.
// - [+]·[−]는 이웃 단계의 대표 거리로 간다(1단계 = 가장 멀리, 2~5단계 = 띠의 기하 평균). 5단계에서 [+]는 가장 가까이까지,
//   1단계에서 [−]는 가장 멀리까지 간 뒤 한 번 더 누르면 끝(null) = 화면이 2차맵·항성계로 넘어간다.
import type { GlobeLimits } from "./globeCamera.ts";
import { PRIMARY_LEVELS } from "./tileTree.ts";

/** 끝에 닿았다고 보는 여유(상대값) */
const EDGE_EPSILON = 1e-6;

export interface ZoomStages {
  /** 단계 s(2~5)가 되는 거리 상한(m): 거리 < below[s − 2]이면 s단계 이상(늘 줄어든다) */
  readonly below: readonly number[];
  readonly minDistance: number;
  readonly maxDistance: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 거리 한계를 로그 눈금으로 다섯 등분한 단계 경계 */
export function zoomStages(limits: GlobeLimits): ZoomStages {
  const { minDistance, maxDistance } = limits;
  const ratio = minDistance / maxDistance;
  const below: number[] = [];
  for (let stage = 2; stage <= PRIMARY_LEVELS; stage++) {
    below.push(maxDistance * ratio ** ((stage - 1) / PRIMARY_LEVELS));
  }
  return { below, minDistance, maxDistance };
}

/** 거리 → 단계(1 = 가장 멂 ~ 5 = 가장 가까움) */
export function zoomStageOf(distance: number, stages: ZoomStages): number {
  let stage = 1;
  stages.below.forEach((limit, index) => {
    if (distance < limit) stage = index + 2;
  });
  return stage;
}

/** 단계의 대표 거리(m) — 그 단계로 판정되는 거리. 1단계는 가장 멀리(행성 전체) */
export function stageDistance(stage: number, stages: ZoomStages): number {
  const s = clamp(Math.round(stage), 1, PRIMARY_LEVELS);
  if (s === 1) return stages.maxDistance;
  const far = stages.below[s - 2] ?? stages.maxDistance;
  const near = s >= PRIMARY_LEVELS ? stages.minDistance : (stages.below[s - 1] ?? stages.minDistance);
  return Math.sqrt(near * far);
}

export function atNearEdge(distance: number, stages: ZoomStages): boolean {
  return distance <= stages.minDistance * (1 + EDGE_EPSILON);
}

export function atFarEdge(distance: number, stages: ZoomStages): boolean {
  return distance >= stages.maxDistance * (1 - EDGE_EPSILON);
}

/**
 * [+](direction 1)·[−](−1) 한 번에 갈 거리(m). 이미 그쪽 끝이면 null(화면이 2차맵·항성계로 넘어갈지 정한다)
 */
export function zoomStepTarget(distance: number, direction: 1 | -1, stages: ZoomStages): number | null {
  const stage = zoomStageOf(distance, stages);
  if (direction === 1) {
    if (atNearEdge(distance, stages)) return null;
    return stage < PRIMARY_LEVELS ? stageDistance(stage + 1, stages) : stages.minDistance;
  }
  if (atFarEdge(distance, stages)) return null;
  return stage > 1 ? stageDistance(stage - 1, stages) : stages.maxDistance;
}
