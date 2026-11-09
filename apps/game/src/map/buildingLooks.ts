// 2차맵 건물 겉모습 잇기 — ADR 2026-11-08-building-art. 지도 자료의 건물(칸·크기·돌림)에 tRPC facilities.mapLooks의
// 시설 ID·레벨·상태·국가를 붙여 엔진에 넘긴다(엔진이 시설 종류별 모델을 그린다). 엔진 값은 타입만 가져온다.
// - 묻는 때: 처음, 건물 목록(ID 묶음)이 바뀌면 조금 뒤, 그 밖에는 30초마다(짓기·레벨업 끝, 손상). 숨긴 탭에서는 쉰다.
// - 국가 색 번호: 1차맵 도시 판과 같은 차례(world.cities의 국가 차례대로 0~5). 그 목록에 없는 국가는 세력 ID로 돌려 쓴다.
// - 겉모습을 아직 모르는 건물은 그대로 넘긴다(엔진은 일반 집으로 그린다). 답이 실패해도 지도는 그대로다.
import type { BuildingFootprint, BuildingLook } from "@terra/engine";
import type { MapBuildingLook, MapLooksResponse } from "@terra/shared/mapLooks";
import type { WorldMapFaction } from "@terra/shared/worldMap";
import { api } from "../net/api.ts";
import type { FeedSink } from "./feedTypes.ts";
import { FACTION_COLORS, loadWorldCities } from "./worldMapData.ts";

const REQUEST_TIMEOUT_MS = 10_000;
/** 다시 묻는 간격(ms) */
export const LOOKS_POLL_MS = 30_000;
/** 건물 목록이 바뀐 뒤 묻기까지 기다리는 시간(ms, 스냅샷 조각·연달은 바뀜을 모은다) */
export const LOOKS_SETTLE_MS = 800;

export function loadMapLooks(mapKey: number, signal?: AbortSignal): Promise<MapLooksResponse> {
  return api.facilities.mapLooks.query(
    { mapKey },
    { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
}

/** 국가 색 번호(world.cities 국가 차례, 없으면 세력 ID로 돌려 쓴다). 국가가 없으면 null */
export function accentOf(factions: readonly WorldMapFaction[], factionId: number | null): number | null {
  if (factionId === null) return null;
  const index = factions.findIndex((faction) => faction.id === factionId);
  return (index >= 0 ? index : Math.abs(factionId)) % FACTION_COLORS;
}

/** 응답 한 줄 → 엔진 겉모습 */
export function lookOf(look: MapBuildingLook, factions: readonly WorldMapFaction[]): BuildingLook {
  return {
    facility: look.facilityId,
    level: look.level,
    state: look.state,
    upgrading: look.upgrading,
    accent: accentOf(factions, look.factionId),
    // 실효 팩 겉모습(건물 편집기가 바꾼 모델·색·높이). 없으면 엔진이 시설 ID로 고른다
    ...(look.art ? { art: look.art } : {}),
  };
}

/** 건물 목록에 겉모습을 붙인다(모르는 건물은 그대로) */
export function withLooks(
  buildings: readonly BuildingFootprint[],
  looks: ReadonlyMap<number, BuildingLook>,
): BuildingFootprint[] {
  return buildings.map((building) => {
    const look = looks.get(building.id);
    return look ? { ...building, look } : building;
  });
}

/** 건물 ID 묶음 표지(바뀌었는지 보려고) */
export function idsKey(buildings: readonly BuildingFootprint[]): string {
  const ids = buildings.map((building) => building.id);
  // toSorted는 Firefox 115부터라(지원 하한 114) map이 새로 만든 배열을 바로 정렬한다
  // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 배열이라 원본을 바꿔도 된다
  return ids.sort((a, b) => a - b).join(",");
}

export interface BuildingLooks {
  /** 엔진 앞에 끼우는 자료 받는 쪽(건물만 겉모습을 붙인다) */
  readonly sink: FeedSink;
  stop(): void;
}

export interface BuildingLooksOptions {
  readonly load?: (mapKey: number, signal: AbortSignal) => Promise<MapLooksResponse>;
  readonly loadFactions?: (signal: AbortSignal) => Promise<readonly WorldMapFaction[]>;
  /** 새 겉모습 답을 받았을 때(근처 목록 건물 탭의 이름·내 것) */
  readonly onLooks?: (rows: readonly MapBuildingLook[]) => void;
}

/** 엔진(engine)에 건물 겉모습을 이어 준다. 화면을 닫을 때 stop */
export function startBuildingLooks(
  engine: FeedSink,
  mapKey: number,
  options: BuildingLooksOptions = {},
): BuildingLooks {
  const load = options.load ?? loadMapLooks;
  const loadFactions =
    options.loadFactions ?? ((signal) => loadWorldCities(signal).then((world) => world.factions));
  const controller = new AbortController();
  let buildings: readonly BuildingFootprint[] = [];
  let looks = new Map<number, BuildingLook>();
  let factions: readonly WorldMapFaction[] = [];
  let lastIds = "";
  let lastSignature = "";
  let settle: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let stopped = false;

  const push = (): void => {
    if (!stopped) engine.setBuildings(withLooks(buildings, looks));
  };

  const refresh = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      // 화면을 닫으면 결과를 버린다(AbortSignal.any는 지원 하한 브라우저에 없어 시간 제한만 건다)
      const response = await load(mapKey, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      if (stopped || response.status !== "ok") return;
      const signature = JSON.stringify(response.buildings);
      if (signature === lastSignature) return;
      lastSignature = signature;
      looks = new Map(response.buildings.map((row) => [row.buildingId, lookOf(row, factions)]));
      options.onLooks?.(response.buildings);
      push();
    } catch {
      // 겉모습은 그림만 바꾼다: 실패하면 다음 차례에 다시 묻는다
    } finally {
      inFlight = false;
    }
  };

  const schedule = (): void => {
    if (settle !== undefined) clearTimeout(settle);
    settle = setTimeout(() => {
      settle = undefined;
      void refresh();
    }, LOOKS_SETTLE_MS);
  };

  // 국가 차례를 먼저 받아 두면 첫 겉모습부터 1차맵과 같은 색이다(실패하면 세력 ID로 돌려 쓴다)
  void loadFactions(controller.signal)
    .then((list) => {
      factions = list;
      lastSignature = "";
    })
    .catch(() => undefined)
    .finally(() => void refresh());
  const timer = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState === "visible") void refresh();
  }, LOOKS_POLL_MS);

  const sink: FeedSink = {
    setTerrain: (terrain) => engine.setTerrain(terrain),
    setUnits: (units) => engine.setUnits(units),
    setUnitPath: (id, path) => engine.setUnitPath(id, path),
    setBuildings: (list) => {
      buildings = list;
      push();
      const ids = idsKey(list);
      if (ids !== lastIds) {
        lastIds = ids;
        schedule();
      }
    },
    setExplored: (bits) => engine.setExplored(bits),
    select: (id) => engine.select(id),
    selected: () => engine.selected(),
  };

  return {
    sink,
    stop() {
      stopped = true;
      controller.abort();
      clearInterval(timer);
      if (settle !== undefined) clearTimeout(settle);
    },
  };
}
