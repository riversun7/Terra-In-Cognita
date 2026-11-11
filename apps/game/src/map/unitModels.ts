// 2차맵 유닛 외형 잇기 — docs/adr/2026-11-11-character-3d.md 4·5절. 지도 자료의 유닛(자리·크기)에 3D 외형을 붙여 엔진에 넘긴다
// (엔진이 가까운 유닛을 로우폴리 모델로 그린다 — 멀거나 상한 밖이면 지금처럼 캡슐·점). 엔진 값은 타입만 가져온다.
// - 걷는 사람 크기 유닛(키 2.2m·몸 반지름 0.5m 이하 — 탈것·큰 유닛 제외)만 모델이 된다.
// - 외형: tRPC world.unitLooks가 준 것(사이보그 본체 = 고른 외형, NPC 지도자)이 먼저, 나머지는 유닛 ID로 만든 수수한 기본 외형.
//   받은 외형은 목록·범위를 다시 본다(isCharacterLook). 답이 실패해도 지도는 그대로다(기본 외형으로 그린다).
// - 묻는 때: 처음, 유닛 목록(ID 묶음)이 바뀌면 조금 뒤, 그 밖에는 60초마다. 숨긴 탭에서는 쉰다.
import type { SecondMapEngine, UnitModel, UnitSpawn } from "@terra/engine";
import { type CharacterLook, characterLookForUnit, isCharacterLook } from "@terra/shared/characterLook";
import type { MapUnitLooksResponse } from "@terra/shared/mapUnits";
import { api } from "../net/api.ts";
import type { FeedSink } from "./feedTypes.ts";

const REQUEST_TIMEOUT_MS = 10_000;
/** 다시 묻는 간격(ms) — 외형은 거의 바뀌지 않는다 */
export const UNIT_LOOKS_POLL_MS = 60_000;
/** 유닛 목록이 바뀐 뒤 묻기까지 기다리는 시간(ms, 스냅샷 조각·연달은 바뀜을 모은다) */
export const UNIT_LOOKS_SETTLE_MS = 800;
/** 모델로 그리는 유닛 크기 상한(걷는 사람 크기): 키·몸 반지름(m) */
export const WALKER_MAX_HEIGHT_M = 2.2;
export const WALKER_MAX_RADIUS_M = 0.5;
/** 기본 외형 캐시 상한(유닛 ID → 외형). 넘으면 비운다 */
const DEFAULT_CACHE_LIMIT = 4096;

/**
 * [시험용] 주소에 ?unit-models=0을 붙이면 유닛을 모델로 그리지 않는다(모두 캡슐·점 — 앞뒤를 견줘 재는 데 쓴다, pixelRatioParam.ts와 같은 방식)
 */
export const UNIT_MODELS_PARAM = "unit-models";
export function wantsUnitModels(search: string): boolean {
  return new URLSearchParams(search).get(UNIT_MODELS_PARAM) !== "0";
}

export function loadUnitLooks(mapKey: number, signal?: AbortSignal): Promise<MapUnitLooksResponse> {
  return api.world.unitLooks.query({ mapKey }, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** 걷는 사람 크기 유닛인가(모델로 그릴 수 있는 유닛) */
export function isWalker(unit: Pick<UnitSpawn, "look">): boolean {
  return unit.look.heightM <= WALKER_MAX_HEIGHT_M && unit.look.radiusM <= WALKER_MAX_RADIUS_M;
}

/** 유닛 목록 → 외형 목록(걷는 유닛만): 서버가 준 외형이 먼저, 없으면 유닛 ID로 만든 기본 외형 */
export function unitModelsOf(
  units: readonly UnitSpawn[],
  known: ReadonlyMap<number, CharacterLook>,
  fallback: (unitId: number) => CharacterLook,
): UnitModel[] {
  const out: UnitModel[] = [];
  for (const unit of units) {
    if (!isWalker(unit)) continue;
    out.push({ id: unit.id, look: known.get(unit.id) ?? fallback(unit.id) });
  }
  return out;
}

export interface UnitModels {
  /** 엔진 앞에 끼우는 자료 받는 쪽(유닛 목록을 볼 뿐 바꾸지 않는다) */
  readonly sink: FeedSink;
  stop(): void;
}

export interface UnitModelsOptions {
  readonly load?: (mapKey: number, signal: AbortSignal) => Promise<MapUnitLooksResponse>;
  /** false면 외형을 넘기지 않는다(유닛 목록만 지나간다 — 시험용 ?unit-models=0). 기본 true */
  readonly enabled?: boolean;
}

/** 엔진(engine)에 유닛 외형을 이어 준다. 화면을 닫을 때 stop */
export function startUnitModels(
  engine: FeedSink & Pick<SecondMapEngine, "setUnitModels">,
  mapKey: number,
  options: UnitModelsOptions = {},
): UnitModels {
  const load = options.load ?? loadUnitLooks;
  // 끈 채로는 아무것도 묻지 않고 그대로 넘긴다
  if (options.enabled === false) return { sink: engine, stop: () => undefined };
  let units: readonly UnitSpawn[] = [];
  let known = new Map<number, CharacterLook>();
  const defaults = new Map<number, CharacterLook>();
  let lastIds = "";
  let lastSignature = "";
  let settle: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let stopped = false;

  const fallback = (unitId: number): CharacterLook => {
    const found = defaults.get(unitId);
    if (found) return found;
    if (defaults.size >= DEFAULT_CACHE_LIMIT) defaults.clear();
    const look = characterLookForUnit(unitId, "commoner");
    defaults.set(unitId, look);
    return look;
  };

  const push = (): void => {
    if (!stopped) engine.setUnitModels(unitModelsOf(units, known, fallback));
  };

  const refresh = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const response = await load(mapKey, AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      if (stopped || response.status !== "ready") return;
      const signature = JSON.stringify(response.units);
      if (signature === lastSignature) return;
      lastSignature = signature;
      // 받은 외형은 다시 본다(목록 밖 ID·범위 밖 값은 버린다 — 그 유닛은 기본 외형)
      known = new Map(
        response.units.filter((row) => isCharacterLook(row.look)).map((row) => [row.unitId, row.look]),
      );
      push();
    } catch {
      // 외형은 그림만 바꾼다: 실패하면 다음 차례에 다시 묻는다
    } finally {
      inFlight = false;
    }
  };

  const schedule = (): void => {
    if (settle !== undefined) clearTimeout(settle);
    settle = setTimeout(() => {
      settle = undefined;
      void refresh();
    }, UNIT_LOOKS_SETTLE_MS);
  };

  void refresh();
  const timer = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState === "visible") void refresh();
  }, UNIT_LOOKS_POLL_MS);

  const sink: FeedSink = {
    setTerrain: (terrain) => engine.setTerrain(terrain),
    setUnits: (list) => {
      units = list;
      // 외형을 먼저 넣는다(엔진은 유닛 목록이 바뀔 때 칸 ↔ 외형을 다시 잇는다)
      push();
      engine.setUnits(list);
      const ids = list
        .filter(isWalker)
        .map((unit) => unit.id)
        // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 배열이라 원본을 바꿔도 된다(toSorted는 Firefox 115부터)
        .sort((a, b) => a - b)
        .join(",");
      if (ids !== lastIds) {
        lastIds = ids;
        schedule();
      }
    },
    setUnitPath: (id, path) => engine.setUnitPath(id, path),
    setBuildings: (list) => engine.setBuildings(list),
    setExplored: (bits) => engine.setExplored(bits),
    select: (id) => engine.select(id),
    selected: () => engine.selected(),
  };

  return {
    sink,
    stop() {
      stopped = true;
      clearInterval(timer);
      if (settle !== undefined) clearTimeout(settle);
    },
  };
}
