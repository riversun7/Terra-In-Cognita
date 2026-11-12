// 2차맵 유닛 외형 잇기 — docs/adr/2026-11-11-character-3d.md 4·5절. 지도 자료의 유닛(자리·크기)에 3D 외형을 붙여 엔진에 넘긴다
// (엔진이 가까운 유닛을 로우폴리 모델로 그린다 — 멀거나 상한 밖이면 지금처럼 캡슐·점). 엔진 값은 타입만 가져온다.
// - 걷는 사람 크기 유닛(키 2.2m·몸 반지름 0.5m 이하 — 탈것·큰 유닛 제외)만 모델이 된다.
// - 외형: tRPC world.unitLooks가 준 것(사이보그 본체 = 고른 외형, NPC 지도자)이 먼저, 나머지는 유닛 ID로 만든 수수한 기본 외형.
//   받은 외형은 목록·범위를 다시 본다(isCharacterLook). 답이 실패해도 지도는 그대로다(기본 외형으로 그린다).
// - 묻는 때: 처음, 유닛 목록(ID 묶음)이 바뀌면 조금 뒤, 그 밖에는 60초마다. 숨긴 탭에서는 쉰다.
// - 발밑 나라 색 고리(질문 963 나): 같은 답의 나라(nations — 보는 유닛, 종류와 상관없이)를 건물 깃발과 같은 국가 색 번호(buildingLooks.ts
//   accentOf, world.cities 국가 차례)로 바꿔 엔진에 넘긴다. 국가 차례는 건물 겉모습이 받은 것을 같이 쓴다(setFactions — 한 번만 묻는다).
//   ?unit-models=0이어도 고리는 그린다(모델만 끈다).
// 바뀜(2026-11-12, 사용자 지적 "큰 유닛들은 캐릭터가 없는 문제. 내 사이보그도 갑자기 기존 노란원통 모델로 돌아가는 문제. 개선. 유닛 이름이 표시되게
// 하자." — docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 유닛 겉모습)"):
// - 모든 유닛이 모델 후보다(unitModelOf): 크기 1 걷는 유닛 = 캐릭터, 크기 2·3 = 사람이면 키에 맞춰 늘린 캐릭터, 아니면 [임시] 크기 2 기계 몸
//   (android 외형)·크기 3 짐승, 탈것(서버 표시 종류 vehicle) = 크기마다 차·짐차·궤도 탈것. 사람인지는 같은 답의 이름표 자료(labels — 종류)로 안다.
// - 옆 2차맵 유닛도 외형을 받는다(neighbours — 붙은 이웃 2차맵마다 같은 조회). 받은 외형은 화면이 바뀌어도(걸어서 2차맵 넘기) 기억한다
//   (LOOK_MEMORY — 넘은 직후 새 답이 오기 전에도 내 사이보그가 고른 외형).
// - 이름표 자료(labels)를 이름표 층(unitNames.ts)에 준다.
import type { SecondMapEngine, UnitModel, UnitRing, UnitSpawn } from "@terra/engine";
import { type CharacterLook, characterLookForUnit, isCharacterLook } from "@terra/shared/characterLook";
import type { MapUnitKind, MapUnitLabel, MapUnitLooksResponse, MapUnitNation } from "@terra/shared/mapUnits";
import type { LocalizedName } from "@terra/shared/roster";
import type { WorldMapFaction } from "@terra/shared/worldMap";
import { api } from "../net/api.ts";
import { accentOf } from "./buildingLooks.ts";
import type { FeedSink } from "./feedTypes.ts";

const REQUEST_TIMEOUT_MS = 10_000;
/** 다시 묻는 간격(ms) — 외형은 거의 바뀌지 않는다 */
export const UNIT_LOOKS_POLL_MS = 60_000;
/** 유닛 목록이 바뀐 뒤 묻기까지 기다리는 시간(ms, 스냅샷 조각·연달은 바뀜을 모은다) */
export const UNIT_LOOKS_SETTLE_MS = 800;
/** 걷는 사람 크기(크기 등급을 모를 때 키로 짐작): 키·몸 반지름(m) */
export const WALKER_MAX_HEIGHT_M = 2.2;
export const WALKER_MAX_RADIUS_M = 0.5;
/** 크기 등급 2와 3을 가르는 키(m) — 크기 등급을 모를 때 */
const SIZE_TWO_MAX_HEIGHT_M = 8;
/** 기본 외형 캐시 상한(유닛 ID → 외형). 넘으면 비운다 */
const DEFAULT_CACHE_LIMIT = 4096;
/** 캐릭터 모델의 기준 키(m) — 유닛 키 ÷ 이것 = 배율(엔진 캡슐 기준 키와 같다) */
export const CHARACTER_REFERENCE_HEIGHT_M = 1.8;
/** [임시] 짐승 모델 키(머리 꼭대기, m)와 유닛 키 가운데 짐승이 차지하는 몫(네 발이라 캡슐보다 낮고 길다) */
const BEAST_MODEL_HEIGHT_M = 1.6;
const BEAST_HEIGHT_SHARE = 0.7;
/** 사람 종류(크기와 상관없이 캐릭터 모델) */
const PERSON_KINDS: ReadonlySet<MapUnitKind> = new Set([
  "cyborg_body",
  "cyborg",
  "human",
  "guardian",
  "npc_leader",
]);
/** 크기 등급별 탈것 몸 */
const VEHICLE_BODIES = { 1: "car", 2: "truck", 3: "crawler" } as const;
/** 화면이 바뀌어도 기억하는 서버 외형(유닛 ID → 외형). 상한을 넘으면 비운다 */
const LOOK_MEMORY = new Map<number, CharacterLook>();
const LOOK_MEMORY_LIMIT = 2048;

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

/** 걷는 사람 크기 유닛인가(크기 등급 1 걷는 유닛) */
export function isWalker(unit: Pick<UnitSpawn, "look">): boolean {
  return unit.look.form !== "vehicle" && sizeClassOf(unit) === 1;
}

/** 크기 등급(전송 값, 없으면 키·굵기로 짐작) */
export function sizeClassOf(unit: Pick<UnitSpawn, "look">): 1 | 2 | 3 {
  const { look } = unit;
  if (look.sizeClass !== undefined) return look.sizeClass;
  if (look.heightM <= WALKER_MAX_HEIGHT_M && look.radiusM <= WALKER_MAX_RADIUS_M) return 1;
  return look.heightM <= SIZE_TWO_MAX_HEIGHT_M ? 2 : 3;
}

/** 외형이 없는 유닛의 기본 외형 만들기(유닛 ID, 모습) */
export type FallbackLook = (unitId: number, style: "commoner" | "android") => CharacterLook;

/**
 * 유닛 하나의 모델([임시] 규칙 — 유닛 종(콘텐츠 팩)이 지도에 오면 그 종의 모델로 바꾼다):
 * - 탈것: 크기 1·2·3 = 차·짐차·궤도 탈것(실제 크기 모델, 배율 1)
 * - 크기 1 걷는 유닛: 서버 외형(사이보그 본체·지도자) 또는 수수한 기본 외형
 * - 크기 2·3: 사람(서버 외형이 있거나 이름표 종류가 사람)이면 키에 맞춰 늘린 캐릭터, 아니면 크기 2 = 기계 몸(android 외형), 크기 3 = 짐승
 */
export function unitModelOf(
  unit: UnitSpawn,
  known: ReadonlyMap<number, CharacterLook>,
  kind: MapUnitKind | undefined,
  fallback: FallbackLook,
): UnitModel {
  const size = sizeClassOf(unit);
  if (unit.look.form === "vehicle")
    return { id: unit.id, body: { kind: VEHICLE_BODIES[size], seed: unit.id } };
  const look = known.get(unit.id);
  if (size === 1) return { id: unit.id, look: look ?? fallback(unit.id, "commoner") };
  const scale = unit.look.heightM / CHARACTER_REFERENCE_HEIGHT_M;
  if (look || (kind !== undefined && PERSON_KINDS.has(kind)))
    return { id: unit.id, look: look ?? fallback(unit.id, "commoner"), scale };
  if (size === 2) return { id: unit.id, look: fallback(unit.id, "android"), scale };
  return {
    id: unit.id,
    body: { kind: "beast", seed: unit.id },
    scale: (unit.look.heightM * BEAST_HEIGHT_SHARE) / BEAST_MODEL_HEIGHT_M,
  };
}

/** 유닛 목록 → 모델 목록(모든 유닛 — 엔진이 가까운 것만 모델로 그린다) */
export function unitModelsOf(
  units: readonly UnitSpawn[],
  known: ReadonlyMap<number, CharacterLook>,
  fallback: FallbackLook,
  kinds: ReadonlyMap<number, MapUnitKind> = new Map(),
): UnitModel[] {
  return units.map((unit) => unitModelOf(unit, known, kinds.get(unit.id), fallback));
}

/** 나라 목록 → 유닛 발밑 고리(국가 색 번호, 건물 깃발과 같은 번호). 나라가 없는 유닛은 목록에 없다 */
export function unitRingsOf(
  nations: readonly MapUnitNation[],
  factions: readonly WorldMapFaction[],
): UnitRing[] {
  const out: UnitRing[] = [];
  for (const nation of nations) {
    const accent = accentOf(factions, nation.factionId);
    if (accent === null) continue;
    for (const id of nation.unitIds) out.push({ id, accent });
  }
  return out;
}

/** 이름표 층(unitNames.ts)이 읽는 유닛 이름·종류·키 */
export interface UnitLabels {
  /** 이름(없으면 null) */
  nameOf(unitId: number): LocalizedName | null;
  /** 이름표 종류(답에 없으면 undefined) */
  kindOf(unitId: number): MapUnitKind | undefined;
  /** 유닛 키(m, 엔진 겉모습 — 모르면 1.8) */
  heightOf(unitId: number): number;
  /** 이름이 있는 유닛(ID 차례) */
  named(): readonly number[];
  /** 자료가 바뀔 때마다 1씩 는다 */
  readonly version: number;
}

export interface UnitModels {
  /** 엔진 앞에 끼우는 자료 받는 쪽(유닛 목록을 볼 뿐 바꾸지 않는다) */
  readonly sink: FeedSink;
  /** 이름표 자료 */
  readonly labels: UnitLabels;
  /** 국가 차례(world.cities — 건물 겉모습이 받은 것). 받으면 고리 색을 다시 정한다 */
  setFactions(list: readonly WorldMapFaction[]): void;
  stop(): void;
}

export interface UnitModelsOptions {
  readonly load?: (mapKey: number, signal: AbortSignal) => Promise<MapUnitLooksResponse>;
  /** false면 외형을 넘기지 않는다(유닛 목록만 지나간다 — 시험용 ?unit-models=0). 기본 true */
  readonly enabled?: boolean;
  /** 같이 물을 옆 2차맵(붙은 이웃 흐름 — 그 유닛도 지도에 보인다). 기본 없음 */
  readonly neighbours?: () => readonly number[];
  /** 이름표 자료가 바뀌었다(카메라가 멈춰 있어도 다시 그리게) */
  readonly onLabels?: () => void;
  /** 화면이 바뀌어도 기억하는 외형(기본 이 모듈의 LOOK_MEMORY — 시험은 따로 준다) */
  readonly memory?: Map<number, CharacterLook>;
}

/** 엔진(engine)에 유닛 외형을 이어 준다. 화면을 닫을 때 stop */
export function startUnitModels(
  engine: FeedSink & Pick<SecondMapEngine, "setUnitModels" | "setUnitRings">,
  mapKey: number,
  options: UnitModelsOptions = {},
): UnitModels {
  const load = options.load ?? loadUnitLooks;
  // 모델을 끄면(시험용) 외형은 넘기지 않고 나라 색 고리만 넘긴다
  const models = options.enabled !== false;
  const memory = options.memory ?? LOOK_MEMORY;
  let nations: readonly MapUnitNation[] = [];
  let factions: readonly WorldMapFaction[] = [];
  let units: readonly UnitSpawn[] = [];
  let heights = new Map<number, number>();
  /** 받은 외형(이번 화면) — 없으면 기억한 외형 */
  let known = new Map<number, CharacterLook>(memory);
  let kinds = new Map<number, MapUnitKind>();
  let names = new Map<number, LocalizedName>();
  let named: readonly number[] = [];
  let labelVersion = 0;
  const defaults = new Map<string, CharacterLook>();
  let lastIds = "";
  let lastSignature = "";
  let settle: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let stopped = false;

  const fallback: FallbackLook = (unitId, style) => {
    const key = `${style}:${unitId}`;
    const found = defaults.get(key);
    if (found) return found;
    if (defaults.size >= DEFAULT_CACHE_LIMIT) defaults.clear();
    const look = characterLookForUnit(unitId, style);
    defaults.set(key, look);
    return look;
  };

  const push = (): void => {
    if (!stopped && models) engine.setUnitModels(unitModelsOf(units, known, fallback, kinds));
  };
  const pushRings = (): void => {
    if (!stopped) engine.setUnitRings(unitRingsOf(nations, factions));
  };

  /** 지금 2차맵 + 옆 2차맵 답을 모은다(옆 2차맵이 실패해도 지금 2차맵 답은 쓴다) */
  const loadAll = async (): Promise<MapUnitLooksResponse[]> => {
    const keys = [mapKey, ...(options.neighbours?.() ?? []).filter((key) => key !== mapKey)];
    const settled = await Promise.allSettled(
      keys.map((key) => load(key, AbortSignal.timeout(REQUEST_TIMEOUT_MS))),
    );
    const main = settled[0];
    if (!main || main.status === "rejected") throw main?.reason ?? new Error("no answer");
    return settled.flatMap((entry) =>
      entry.status === "fulfilled" && entry.value.status === "ready" ? [entry.value] : [],
    );
  };

  const refresh = async (): Promise<void> => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const responses = await loadAll();
      if (stopped || responses[0]?.mapKey !== mapKey) return;
      const signature = JSON.stringify(
        responses.map((r) => [r.mapKey, r.units, r.nations ?? [], r.labels ?? []]),
      );
      if (signature === lastSignature) return;
      lastSignature = signature;
      // 받은 외형은 다시 본다(목록 밖 ID·범위 밖 값은 버린다 — 그 유닛은 기본 외형). 기억한 외형 위에 얹는다
      const next = new Map<number, CharacterLook>();
      const nextKinds = new Map<number, MapUnitKind>();
      const nextNames = new Map<number, LocalizedName>();
      const nextNations: MapUnitNation[] = [];
      for (const response of responses) {
        for (const row of response.units) if (isCharacterLook(row.look)) next.set(row.unitId, row.look);
        for (const label of response.labels ?? []) addLabel(label, nextKinds, nextNames);
        nextNations.push(...(response.nations ?? []));
      }
      if (memory.size + next.size > LOOK_MEMORY_LIMIT) memory.clear();
      for (const [id, look] of next) memory.set(id, look);
      known = new Map(memory);
      kinds = nextKinds;
      names = nextNames;
      named = [...nextNames.keys()].toSorted((a, b) => a - b);
      labelVersion += 1;
      nations = nextNations;
      push();
      pushRings();
      options.onLabels?.();
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
      heights = new Map(list.map((unit) => [unit.id, unit.look.heightM]));
      // 외형을 먼저 넣는다(엔진은 유닛 목록이 바뀔 때 칸 ↔ 외형을 다시 잇는다)
      push();
      engine.setUnits(list);
      const ids = list
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

  const labels: UnitLabels = {
    nameOf: (unitId) => names.get(unitId) ?? null,
    kindOf: (unitId) => kinds.get(unitId),
    heightOf: (unitId) => heights.get(unitId) ?? CHARACTER_REFERENCE_HEIGHT_M,
    named: () => named,
    get version() {
      return labelVersion;
    },
  };

  return {
    sink,
    labels,
    setFactions(list) {
      factions = list;
      pushRings();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      if (settle !== undefined) clearTimeout(settle);
    },
  };
}

/** 이름표 한 줄을 종류·이름 표에 넣는다(이름이 빈 글자면 이름 없음) */
function addLabel(
  label: MapUnitLabel,
  kinds: Map<number, MapUnitKind>,
  names: Map<number, LocalizedName>,
): void {
  kinds.set(label.unitId, label.kind);
  if (label.name && (label.name.ko.trim() !== "" || label.name.en.trim() !== ""))
    names.set(label.unitId, label.name);
}
