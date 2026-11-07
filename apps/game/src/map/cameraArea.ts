// 플레이어 2차맵 카메라 범위 — 기획 정리 630(D-519 "운영자는 … 시야 자유이동이 가능": 플레이어 카메라는 맵 어디든이 아니라 내 유닛·내 세력 시야
// 둘레로 묶는다), docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)". 순수 함수(시험 대상, cameraArea.test.ts) — 엔진은 원 목록만 받는다.
// - 원(배치 칸): 내 유닛마다(엔진의 지금 자리, 반지름 = 서버가 준 유닛 시야 + 여유)·내 건물마다(건물 시야 + 여유).
// - 이 2차맵에 내 유닛·건물이 없으면(정찰로 본 2차맵 — U3, 1차맵 [들어가기]) 탐사한 시야 칸마다 작은 원(그 칸 둘레). 그것도 없으면 범위 없음(null —
//   온통 어두운 안내가 뜬다).
// - 운영자 모드는 범위 없음(시야 자유 이동). 카메라를 묶는 것은 화면 편의다: 서버는 시야 밖 유닛을 보내지 않는다(S3 시야 전송).
// - 세력 시야(같은 국가 전체)는 서버 시야 묶음이 사용자 하나라 아직 없다(S3-Q1, 확인 대기 질문 701).
import type { MapViewArea } from "@terra/shared/mapUnits";

/** 시야 칸 한 변(배치 칸, @terra/sim VISION_CELL과 같다)·한 줄 칸 수(256 ÷ 8) */
const VISION_CELL = 8;
const VISION_SIDE = 32;
/** 탐사 칸 원의 반지름(배치 칸): 칸 가운데에서 꼭짓점까지(약 5.7)보다 조금 크게 — 이웃 칸 원과 겹쳐 이어진다 */
const EXPLORED_RADIUS = 6;

export interface AreaDisc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export function cameraArea(input: {
  readonly operator: boolean;
  /** 서버가 준 범위(받기 전 null — 범위를 걸지 않는다) */
  readonly view: MapViewArea | null;
  /** 내 유닛의 지금 자리(배치 칸, 실수) */
  readonly units: readonly { readonly x: number; readonly y: number }[];
  /** 탐사 칸 비트(시야 칸 32×32, 128바이트). 없으면 null */
  readonly explored: Uint8Array | null;
}): AreaDisc[] | null {
  const { view } = input;
  if (input.operator || view === null) return null;
  const discs: AreaDisc[] = [];
  for (const unit of input.units) discs.push({ x: unit.x, y: unit.y, r: view.unitRadius });
  for (const building of view.buildings)
    discs.push({ x: building.x + 0.5, y: building.y + 0.5, r: view.buildingRadius });
  if (discs.length > 0) return discs;
  const bits = input.explored;
  if (!bits) return null;
  for (let index = 0; index < VISION_SIDE * VISION_SIDE; index++) {
    if (((bits[index >> 3] ?? 0) & (1 << (index & 7))) === 0) continue;
    const cx = index % VISION_SIDE;
    const cy = Math.floor(index / VISION_SIDE);
    discs.push({
      x: cx * VISION_CELL + VISION_CELL / 2,
      y: cy * VISION_CELL + VISION_CELL / 2,
      r: EXPLORED_RADIUS,
    });
  }
  return discs.length > 0 ? discs : null;
}

/** 원 목록 열쇠(바뀔 때만 엔진에 넘긴다 — 1초마다 같은 범위를 다시 계산하지 않게). 자리는 칸 단위로 반올림한다 */
export function areaKey(area: readonly AreaDisc[] | null): string {
  if (area === null) return "";
  return area.map((disc) => `${Math.round(disc.x)},${Math.round(disc.y)},${disc.r}`).join(";");
}
