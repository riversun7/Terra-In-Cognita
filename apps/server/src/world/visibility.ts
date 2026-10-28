// 2차맵을 볼 수 있는지 — ADR 2026-10-28-fog-and-map-visibility(26): 2차맵 상세(지형 포함)와 건물·유닛은
// 서버가 그 플레이어의 탐사·시야를 확인한 뒤에만 보낸다.
// S1은 확인하는 자리만 두고 모두 통과시킨다. 탐사 기록 표·시야 전송(남의 경로는 보이는 구간만)은 S3에서 만든다.
// 구독(src/world/gateway.ts)·명령·지형 파일(src/world/terrainRoute.ts)이 모두 이 함수를 거친다.
import type { Viewer } from "../trpc/context.ts";

export function canViewSecondMap(_viewer: Viewer, _mapKey: number): boolean {
  return true;
}
