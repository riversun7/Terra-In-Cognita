// 2차맵 근처 목록 상태(React 밖) — docs/adr/2026-11-08-seamless-second-map.md WP-2(사용자 지적 2026-11-08 "자원 오브젝트를 항상 표시하지 않는다.
// … 근처의 자원, 건물, 유닛 등의 탭을 선택하여 목록으로 보여주고 해당 탭에 해당하는 오브젝트를 보여주는 방식").
// 채집 덧그림(gather/gatherOverlay.ts)과 근처 판(NearbyPanel.tsx)이 같은 상태를 본다: 덧그림은 프레임마다 읽고, React는 판 번호(version)를 구독한다.
// - 탭: 자원·건물·유닛. null이면 판이 닫혀 지도 위 표시(자원 점·건물 단추)가 없다. 고른 탭 것만 지도에 보인다.
// - 줄 수: 20개씩(사용자 답 Q4 "20개씩 스크롤하여 더 보이게"). 탭을 바꾸면 20개로 돌아간다.
// - 기준 유닛: 거리를 재는 유닛(anchorUnit.ts — 고른 내 유닛, 기본 내 사이보그). 칸 크기(m)는 거리 글자에 쓴다.
// - 건물 겉모습 답(시설 이름·내 것): 건물 탭 이름.
import type { MapBuildingLook } from "@terra/shared/mapLooks";

export type NearbyTab = "resources" | "buildings" | "units";

export const NEARBY_TABS: readonly NearbyTab[] = ["resources", "buildings", "units"];

/** 한 번에 더 보이는 줄 수 */
export const NEARBY_PAGE = 20;

export interface NearbyState {
  /** 고른 탭(null = 판 닫힘, 지도 표시 없음) */
  readonly tab: NearbyTab | null;
  /** 목록을 펼쳤나(접으면 탭 줄만 — 고른 탭 표시는 지도에 남는다) */
  readonly expanded: boolean;
  /** 보이는 줄 수(NEARBY_PAGE씩 는다) */
  readonly limit: number;
  /** 거리를 재는 유닛(없으면 null — 운영자 자유 시점: 화면 가운데) */
  readonly anchor: number | null;
  /** 배치 칸 한 변(m). 지형을 받기 전 0 */
  readonly cellM: number;
  /** 건물 ID → 겉모습 답(시설 이름·내 것) */
  readonly looks: ReadonlyMap<number, MapBuildingLook>;
  readonly version: number;
  subscribe(listener: () => void): () => void;
  /** 탭을 고른다(같은 탭이면 펼침만 바꾼다). null이면 닫는다 */
  setTab(tab: NearbyTab | null): void;
  setExpanded(expanded: boolean): void;
  /** NEARBY_PAGE개 더 */
  more(): void;
  setAnchor(anchor: number | null): void;
  setCellM(cellM: number): void;
  setLooks(rows: readonly MapBuildingLook[]): void;
}

export function createNearbyState(initial: { tab: NearbyTab | null; expanded: boolean }): NearbyState {
  const listeners = new Set<() => void>();
  const state = {
    tab: initial.tab,
    expanded: initial.expanded,
    limit: NEARBY_PAGE,
    anchor: null as number | null,
    cellM: 0,
    looks: new Map<number, MapBuildingLook>() as ReadonlyMap<number, MapBuildingLook>,
    version: 0,
  };
  const changed = (): void => {
    state.version += 1;
    for (const listener of listeners) listener();
  };
  return {
    get tab() {
      return state.tab;
    },
    get expanded() {
      return state.expanded;
    },
    get limit() {
      return state.limit;
    },
    get anchor() {
      return state.anchor;
    },
    get cellM() {
      return state.cellM;
    },
    get looks() {
      return state.looks;
    },
    get version() {
      return state.version;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTab(tab) {
      if (tab !== null && tab === state.tab) {
        state.expanded = !state.expanded;
      } else {
        state.tab = tab;
        state.expanded = tab !== null;
        state.limit = NEARBY_PAGE;
      }
      changed();
    },
    setExpanded(expanded) {
      if (state.expanded === expanded) return;
      state.expanded = expanded;
      changed();
    },
    more() {
      state.limit += NEARBY_PAGE;
      changed();
    },
    setAnchor(anchor) {
      if (state.anchor === anchor) return;
      state.anchor = anchor;
      changed();
    },
    setCellM(cellM) {
      if (state.cellM === cellM) return;
      state.cellM = cellM;
      changed();
    },
    setLooks(rows) {
      state.looks = new Map(rows.map((row) => [row.buildingId, row]));
      changed();
    },
  };
}
