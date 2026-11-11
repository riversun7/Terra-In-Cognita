// 행성 범위 저장소 — 개발·운영 화면이 같이 쓰는 "지금 고른 행성"(docs/adr/2026-11-11-planet-scope.md 3절).
// - 목록: tRPC planetScope.list(플레이 행성 + 편집 전용 행성)를 화면을 처음 열 때 한 번 받는다.
// - 고른 행성: 주소 ?planet=<ID>(링크·새로고침에 남는다) → 이 계정이 이 기기에서 마지막에 고른 값 → 대표 플레이 행성.
//   모니터링 묶음은 "전체"(?planet=*)를 더 고를 수 있고 처음 값이 전체다.
// - 주소는 history.replaceState로만 고친다(기록 칸을 쌓지 않는다). 라우터는 모르는 검색어를 지우지 않고, 겹침을 열 때 지금 주소를 다시 읽는다.
// - 기억은 계정마다 localStorage(terra.planetScope.<계정 ID>.<묶음>)에 둔다. 저장소를 못 쓰면 이번 실행 동안만 기억한다.
import {
  ALL_PLANETS,
  type PlanetScopeEntry,
  type PlanetScopeResponse,
  parsePlanetParam,
  resolvePlanetChoice,
} from "@terra/shared/planetScope";
import { useEffect, useSyncExternalStore } from "react";
import { getSessionState } from "../auth/session.ts";
import { api } from "../net/api.ts";
import type { PlanetGroup } from "./scopeRoutes.ts";

/** 주소 검색어 이름 */
export const PLANET_PARAM = "planet";

/** 기억 열쇠 묶음: 편집(edit·lab이 같이 쓴다)과 모니터링 */
type MemoryKey = "edit" | "monitor";
const memoryKeyOf = (group: PlanetGroup): MemoryKey => (group === "monitor" ? "monitor" : "edit");

interface Snapshot {
  readonly status: "idle" | "loading" | "ready" | "failed";
  readonly list: PlanetScopeResponse | null;
  /** 이번 실행에서 고른 값(주소에서 읽었거나 사람이 골랐다). 없으면 기억한 값 → 기본값 */
  readonly chosen: { readonly [K in MemoryKey]: string | null };
}

let snapshot: Snapshot = { status: "idle", list: null, chosen: { edit: null, monitor: null } };
const listeners = new Set<() => void>();

function update(next: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): Snapshot => snapshot;

function storageKey(key: MemoryKey): string | null {
  const session = getSessionState();
  return session.kind === "signed_in" ? `terra.planetScope.${session.user.id}.${key}` : null;
}

function remembered(key: MemoryKey): string | null {
  const name = storageKey(key);
  if (name === null) return null;
  try {
    return localStorage.getItem(name);
  } catch {
    // 저장소를 못 씀(개인 정보 보호 모드 등)
    return null;
  }
}

function remember(key: MemoryKey, planetId: string): void {
  const name = storageKey(key);
  if (name === null) return;
  try {
    localStorage.setItem(name, planetId);
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 기억한다
  }
}

/** 주소(경로 + 검색어)의 ?planet= 값. 행성 ID 모양이거나 "전체"(*)일 때만 */
export function planetOfSearch(url: string): string | null {
  const at = url.indexOf("?");
  const raw = at === -1 ? null : new URLSearchParams(url.slice(at)).get(PLANET_PARAM);
  return raw === ALL_PLANETS ? ALL_PLANETS : parsePlanetParam(raw);
}

/** 지금 주소의 ?planet= 값 */
function planetFromUrl(): string | null {
  return planetOfSearch(window.location.search);
}

/** 주소의 ?planet=을 고친다(기록 칸을 쌓지 않는다). 다른 검색어·#조각은 그대로 둔다 */
function writeUrl(planetId: string): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get(PLANET_PARAM) === planetId) return;
  url.searchParams.set(PLANET_PARAM, planetId);
  // "전체"의 *는 주소에 그대로 둔다(%2A로 바뀌면 읽기 어렵다)
  const search = url.searchParams.toString().replaceAll("%2A", "*");
  window.history.replaceState(window.history.state, "", `${url.pathname}?${search}${url.hash}`);
}

function load(): void {
  update({ status: "loading" });
  api.planetScope.list.query().then(
    (list) => update({ status: "ready", list }),
    () => update({ status: "failed" }),
  );
}

/** 목록을 다시 받는다(실패 뒤 [다시 시도]) */
export function reloadPlanetScope(): void {
  if (snapshot.status !== "loading") load();
}

/** 그 묶음에서 고를 수 있는 행성 ID(목록 차례) */
function allowedIds(group: PlanetGroup, list: PlanetScopeResponse): string[] {
  const playable = list.planets.filter((planet) => planet.status === "playable").map((planet) => planet.id);
  if (group === "monitor") return [ALL_PLANETS, ...playable];
  if (group === "lab") return list.planets.map((planet) => planet.id);
  return playable;
}

export interface PlanetScope {
  readonly status: "loading" | "ready" | "failed";
  /** 고를 수 있는 행성(모니터링의 "전체"는 여기 없다 — allowAll을 본다) */
  readonly planets: readonly PlanetScopeEntry[];
  /** 이 세계의 플레이 행성(대표가 맨 앞) */
  readonly playable: readonly PlanetScopeEntry[];
  /** 모니터링 묶음: "전체"를 고를 수 있다 */
  readonly allowAll: boolean;
  /** 고른 값: 행성 ID, "전체"(ALL_PLANETS), 아직 모르면 null */
  readonly selected: string | null;
  /** 고른 행성(전체·모름이면 null) */
  readonly planet: PlanetScopeEntry | null;
  /** 서버 조회에 넣을 값: 고른 행성 ID. 전체·모름이면 undefined(서버 기본값·거르지 않음) */
  readonly planetId: string | undefined;
  select(planetId: string): void;
}

/**
 * 그 묶음의 행성 범위. 처음 쓰는 화면이 목록을 받고, 주소의 ?planet=을 읽어 고른 값으로 삼는다(틀린 값은 버린다).
 * syncUrl이면 고른 값을 주소에 적는다(범위 줄이 켠다 — 한 화면에 한 곳만)
 */
export function usePlanetScope(
  group: PlanetGroup,
  options?: {
    readonly syncUrl?: boolean;
    /** 라우터의 지금 주소: 화면이 주소를 바꾸면(검색어 갈아 끼우기) ?planet=을 다시 적는다 */
    readonly url?: string;
  },
): PlanetScope {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const key = memoryKeyOf(group);
  const syncUrl = options?.syncUrl === true;
  useEffect(() => {
    if (snapshot.status === "idle") load();
  }, []);
  // 주소로 바로 연 화면·뒤로/앞으로: ?planet= 값을 고른 값으로
  useEffect(() => {
    if (!syncUrl) return undefined;
    const adopt = (): void => {
      const fromUrl = planetFromUrl();
      if (fromUrl !== null && snapshot.chosen[key] !== fromUrl)
        update({ chosen: { ...snapshot.chosen, [key]: fromUrl } });
    };
    adopt();
    window.addEventListener("popstate", adopt);
    return () => window.removeEventListener("popstate", adopt);
  }, [syncUrl, key]);

  const list = state.list;
  const allowed = list ? allowedIds(group, list) : [];
  const selected = list
    ? resolvePlanetChoice({
        fromUrl: state.chosen[key],
        remembered: remembered(key),
        primary: group === "monitor" ? ALL_PLANETS : list.primaryPlanetId,
        allowed,
      })
    : null;
  const routerUrl = options?.url;
  useEffect(() => {
    if (!syncUrl || selected === null) return;
    // 라우터가 아는 주소에 고른 행성이 없으면(화면이 검색어를 갈아 끼웠다) 다시 적는다. 이미 맞으면 writeUrl이 아무것도 하지 않는다
    if (routerUrl === undefined || planetOfSearch(routerUrl) !== selected) writeUrl(selected);
  }, [syncUrl, selected, routerUrl]);

  const planets = list ? list.planets.filter((planet) => allowed.includes(planet.id)) : [];
  const planet = planets.find((entry) => entry.id === selected) ?? null;
  return {
    status: state.status === "ready" ? "ready" : state.status === "failed" ? "failed" : "loading",
    planets,
    playable: list ? list.planets.filter((entry) => entry.status === "playable") : [],
    allowAll: group === "monitor",
    selected,
    planet,
    planetId: planet?.id,
    select(planetId) {
      if (!allowed.includes(planetId)) return;
      remember(key, planetId);
      update({ chosen: { ...snapshot.chosen, [key]: planetId } });
    },
  };
}

/** 시험용: 저장소를 처음 상태로 */
export function resetPlanetScopeForTest(): void {
  snapshot = { status: "idle", list: null, chosen: { edit: null, monitor: null } };
}
