// 2차맵 화면이 열 맵 고르기 — 순수 함수(시험 대상). docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1(D-6017 "지도는 내 사이보그
// 위치에서 연다"). 주소 ?key=가 있으면 그 맵, 없으면 내 사이보그가 있는 맵, 그것도 없으면 서버가 띄운 첫 맵(사이보그 없는 개발 계정 등).
// 카메라("WP7", 기획 정리 D-518 515 "내 사이보그가 없는 맵의 카메라 = 1차맵에서 고른 곳", 572 다 "고른 곳을 보고 [내 사이보그]로 돌아간다"):
// 주소 ?at=(1차맵에서 고른 배치 칸)이 있으면 늘 그곳, 없으면 연 맵의 내 사이보그 자리, 그것도 없으면 그 2차맵 도시의 시청 자리(내가 아는 도시,
// 시작 도시 먼저), 없으면 엔진 기본(맵 가운데). 연 맵에 내 사이보그가 있으면 cyborg에 따로 실어 화면이 [내 사이보그] 단추를 띄운다.
import type { WorldMapCity, WorldPositionResponse } from "@terra/shared/worldMap";
import { parseMapKey } from "./worldMapData.ts";

/** 배치 칸 한 변(@terra/sim PLACEMENT_SIZE — 게임 앱은 sim을 가져오지 않는다) */
const PLACEMENT_SIDE = 256;

/** 카메라를 맞출 곳(배치 칸). 내 사이보그면 엔진이 유닛을 받았을 때 그 유닛의 지금 자리 */
export interface MapFocus {
  /** 내 사이보그 유닛(아니면 null — 칸만) */
  readonly unitId: number | null;
  readonly cellX: number;
  readonly cellY: number;
  /** 무엇에 맞췄나: 내 사이보그·1차맵에서 고른 곳(?at=)·그 2차맵 도시 시청 */
  readonly source: "cyborg" | "picked" | "city";
}

export type MapTarget =
  | {
      readonly kind: "ready";
      readonly mapKey: number;
      readonly focus: MapFocus | null;
      /** 연 맵에 내 사이보그가 있으면 그 자리([내 사이보그] 단추, 572 다). 없으면 null */
      readonly cyborg: MapFocus | null;
    }
  /** 열 수 있는 맵이 없다(서버가 띄운 맵이 없거나 세계 준비 전) */
  | { readonly kind: "none" }
  /** 내 자리를 받지 못했고 주소에도 맵이 없다(다시 시도) */
  | { readonly kind: "failed" };

/** 주소 ?at=<x>,<y> → 배치 칸. 틀리면 null(주소는 고치지 않는다) */
export function parseAtParam(value: string | null | undefined): { x: number; y: number } | null {
  if (typeof value !== "string") return null;
  const found = /^(0|[1-9][0-9]{0,2}),(0|[1-9][0-9]{0,2})$/.exec(value);
  if (!found) return null;
  const x = Number(found[1]);
  const y = Number(found[2]);
  return x < PLACEMENT_SIDE && y < PLACEMENT_SIDE ? { x, y } : null;
}

/** 주소 ?at= 값(1차맵 → 2차맵 들어가기) */
export function formatAtParam(x: number, y: number): string {
  return `${Math.trunc(x)},${Math.trunc(y)}`;
}

/** 내 사이보그가 서버가 띄운 2차맵에 있는 자리(띄우지 않은 2차맵을 건너뛰는 중이면 null — 그 2차맵은 열 수 없다, WP11) */
function onMap(position: WorldPositionResponse | null) {
  const mine = position?.position ?? null;
  return mine && !mine.hidden ? mine : null;
}

/** 내 사이보그가 그 맵에 있나 */
function cyborgFocus(position: WorldPositionResponse | null, mapKey: number): MapFocus | null {
  const mine = onMap(position);
  return mine && mine.mapKey === mapKey
    ? { unitId: mine.unitId, cellX: mine.cellX, cellY: mine.cellY, source: "cyborg" }
    : null;
}

/** 도시 목록(world.cities)이 있어야 카메라를 정할 수 있나: 주소 맵에 내 사이보그가 없고 ?at=도 없을 때 */
export function needsCities(
  keyParam: string | undefined,
  atParam: string | undefined,
  position: WorldPositionResponse | null,
): boolean {
  const asked = parseMapKey(keyParam);
  return asked !== null && parseAtParam(atParam) === null && cyborgFocus(position, asked) === null;
}

/** 그 2차맵 도시의 시청(시작 도시 먼저, 그다음 ID 차례) */
function cityFocus(cities: readonly WorldMapCity[] | null, mapKey: number): MapFocus | null {
  const here = (cities ?? [])
    .filter((city) => city.mapKey === mapKey)
    .toSorted((a, b) => Number(b.start) - Number(a.start) || a.id - b.id)[0];
  return here ? { unitId: null, cellX: here.cellX, cellY: here.cellY, source: "city" } : null;
}

/** position = world.myPosition 응답(받지 못했으면 null), cities = world.cities 도시(받지 않았거나 못 받았으면 null) */
export function chooseMapTarget(
  keyParam: string | undefined,
  position: WorldPositionResponse | null,
  options: { readonly at?: string | undefined; readonly cities?: readonly WorldMapCity[] | null } = {},
): MapTarget {
  const asked = parseMapKey(keyParam);
  const mine = onMap(position);
  if (asked !== null) {
    const picked = parseAtParam(options.at);
    const cyborg = cyborgFocus(position, asked);
    const focus =
      (picked ? { unitId: null, cellX: picked.x, cellY: picked.y, source: "picked" as const } : null) ??
      cyborg ??
      cityFocus(options.cities ?? null, asked);
    return { kind: "ready", mapKey: asked, focus, cyborg };
  }
  if (mine) {
    const cyborg = cyborgFocus(position, mine.mapKey);
    return { kind: "ready", mapKey: mine.mapKey, focus: cyborg, cyborg };
  }
  if (position === null) return { kind: "failed" };
  if (position.fallbackMapKey !== null)
    return { kind: "ready", mapKey: position.fallbackMapKey, focus: null, cyborg: null };
  return { kind: "none" };
}
