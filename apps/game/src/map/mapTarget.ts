// 2차맵 화면이 열 맵 고르기 — 순수 함수(시험 대상). docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1(D-6017 "지도는 내 사이보그
// 위치에서 연다"). 주소 ?key=가 있으면 그 맵, 없으면 내 사이보그가 있는 맵, 그것도 없으면 서버가 띄운 첫 맵(사이보그 없는 개발 계정 등).
// 카메라: 연 맵에 내 사이보그가 있으면 그 자리에 맞춘다(없으면 엔진 기본 = 맵 가운데).
import type { WorldPositionResponse } from "@terra/shared/worldMap";
import { parseMapKey } from "./worldMapData.ts";

/** 카메라를 맞출 내 사이보그(배치 칸, 엔진이 유닛을 받으면 그 유닛의 지금 자리) */
export interface MapFocus {
  readonly unitId: number;
  readonly cellX: number;
  readonly cellY: number;
}

export type MapTarget =
  | { readonly kind: "ready"; readonly mapKey: number; readonly focus: MapFocus | null }
  /** 열 수 있는 맵이 없다(서버가 띄운 맵이 없거나 세계 준비 전) */
  | { readonly kind: "none" }
  /** 내 자리를 받지 못했고 주소에도 맵이 없다(다시 시도) */
  | { readonly kind: "failed" };

/** position = world.myPosition 응답(받지 못했으면 null) */
export function chooseMapTarget(
  keyParam: string | undefined,
  position: WorldPositionResponse | null,
): MapTarget {
  const asked = parseMapKey(keyParam);
  const mine = position?.position ?? null;
  const focusOn = (mapKey: number): MapFocus | null =>
    mine && mine.mapKey === mapKey ? { unitId: mine.unitId, cellX: mine.cellX, cellY: mine.cellY } : null;
  if (asked !== null) return { kind: "ready", mapKey: asked, focus: focusOn(asked) };
  if (mine) return { kind: "ready", mapKey: mine.mapKey, focus: focusOn(mine.mapKey) };
  if (position === null) return { kind: "failed" };
  if (position.fallbackMapKey !== null)
    return { kind: "ready", mapKey: position.fallbackMapKey, focus: null };
  return { kind: "none" };
}
