// 1차맵 서버 원천 — 목록 정보(GET /api/planets/<ID>)로 행성 설명을 만들고, 타일(GET …/tiles/<타일 ID>?v=…)을 받는
// 타일 원천(TileSource). ADR 2026-10-29-s2-planet-lod "서버 굽기·전송". 같은 출처 쿠키로 받는다(로그인 필요).
// - 목록 정보가 굽는 중(status "generating")이거나 429면 몇 초 뒤 다시 묻는다(Retry-After가 있으면 그 시간, 없으면 5초).
//   화면이 알맞은 안내를 고르게 기다리는 이유를 함께 알린다(onWaiting).
// - 타일은 받은 이진을 그대로 엔진에 넘긴다(EncodedTile): 엔진의 메시 워커가 packages/protocol 해석기로 푼다.
//   타일 주소 = planetTilePath(목록 정보의 주소 틀, planetTileKey(맵 레벨, 면, i0, j0)). 버전이 붙은 불변 주소라
//   다시 열면 브라우저 캐시에서 온다.
// - 429·409(Retry-After)는 그 시간까지 새 타일 요청을 미룬다(엔진은 실패한 타일을 1~30초 뒤 다시 받는다).
// - 타일 404(판이 바뀜: 정의·생성기·형식이 바뀌어 이 주소 틀은 다시 맞지 않는다) 뒤에는 서버에 묻지 않고 바로 거절한다.
//   엔진은 실패한 타일을 계속 다시 받으므로, 그대로 두면 열린 화면마다 [다시 시도]를 누를 때까지 요청(로그인 조회 포함)이 이어진다.
// 실패는 이유 코드로 알린다(화면이 문구를 고른다). 문장은 화면에 쓰지 않는다.
import type { EncodedTile, PlanetDescription, TileSource } from "@terra/engine/planet";
import { planetTileKey } from "@terra/planet";
import {
  type PlanetManifest,
  canReadPlanetTiles,
  planetManifestPath,
  planetManifestSchema,
  planetTilePath,
} from "@terra/protocol";
import { isSameOriginPath } from "../net/sameOrigin.ts";

export type PlanetFailure =
  /** 서버에 닿지 못함(오프라인 등) */
  | "network"
  /** 로그인이 풀림(401) */
  | "sign_in"
  /** 없는 행성(404) 또는 타일 판이 바뀜(타일 404: 목록 정보를 다시 받아야 한다) */
  | "not_found"
  /** 요청이 너무 많음(429) — Retry-After 뒤 다시 */
  | "rate_limited"
  /** 서버가 아직 굽는 중(타일 409) — Retry-After 뒤 다시 */
  | "generating"
  /** 그 밖의 서버 오류 */
  | "server"
  /** 받은 자료를 읽지 못함(목록 정보 형식·이 기기가 모르는 타일 형식) */
  | "invalid";

export class PlanetLoadError extends Error {
  override readonly name = "PlanetLoadError";
  readonly reason: PlanetFailure;

  constructor(reason: PlanetFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

/** 굽는 중일 때 다시 묻기까지(서버 Retry-After가 없을 때, ms) */
export const GENERATING_POLL_MS = 5000;
/** 429·409에 Retry-After가 없을 때 기다리는 시간(ms) */
const DEFAULT_RETRY_AFTER_MS = 5000;
/** Retry-After를 믿는 상한(ms) — 이상한 값에 화면이 오래 멈추지 않게 */
const MAX_RETRY_AFTER_MS = 120_000;

/** signal이 멈추면 거절하는 기다리기 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Retry-After 머리글(초 또는 HTTP 날짜) → ms. 없거나 읽지 못하면 undefined */
export function retryAfterMs(header: string | null, nowMs: number): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const text = header.trim();
  const ms = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - nowMs;
  if (!Number.isFinite(ms)) return undefined;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms));
}

/** HTTP 상태 → 실패 이유(성공이면 null) */
function failureOf(status: number): PlanetFailure | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return "sign_in";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status === 409) return "generating";
  return "server";
}

/** 받기 — 닿지 못하면 network. 멈춘(abort) 받기는 그대로 거절한다 */
async function send(fetchImpl: FetchLike, url: string, signal: AbortSignal): Promise<Response> {
  try {
    return await fetchImpl(url, { credentials: "same-origin", signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new PlanetLoadError("network", error instanceof Error ? error.message : String(error));
  }
}

/** 목록 정보를 다시 묻기 전에 기다리는 이유 */
export type ManifestWait =
  /** 서버가 아직 굽는 중(status "generating") */
  | "generating"
  /** 요청이 너무 많음(429) */
  | "rate_limited";

export interface ManifestOptions {
  signal: AbortSignal;
  fetch?: FetchLike;
  sleep?: Sleep;
  now?: () => number;
  /** 다시 묻기 전에 기다릴 때마다(이유, 다음에 묻기까지 ms) */
  onWaiting?: (reason: ManifestWait, retryInMs: number) => void;
}

/**
 * 목록 정보를 받는다. 굽는 중이면 끝날 때까지 기다리며 다시 묻는다(signal로 멈춘다).
 * 이 기기가 읽을 수 없는 타일 형식이면 invalid(새 버전 앱이 필요하다).
 */
export async function loadPlanetManifest(
  planetId: string,
  options: ManifestOptions,
): Promise<PlanetManifest> {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? abortableSleep;
  const now = options.now ?? Date.now;
  const { signal } = options;
  const url = planetManifestPath(planetId);
  for (;;) {
    const response = await send(fetchImpl, url, signal);
    const failure = failureOf(response.status);
    if (failure === "rate_limited") {
      const wait = retryAfterMs(response.headers.get("retry-after"), now()) ?? DEFAULT_RETRY_AFTER_MS;
      options.onWaiting?.("rate_limited", wait);
      await sleep(wait, signal);
      continue;
    }
    if (failure)
      throw new PlanetLoadError(failure, `planet manifest request failed: HTTP ${response.status}`);
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PlanetLoadError("invalid", "planet manifest is not JSON");
    }
    const parsed = planetManifestSchema.safeParse(body);
    if (!parsed.success || parsed.data.id !== planetId) {
      throw new PlanetLoadError("invalid", "planet manifest does not match the schema");
    }
    const manifest = parsed.data;
    if (!canReadPlanetTiles(manifest) || !isSameOriginPath(manifest.tileUrlTemplate)) {
      throw new PlanetLoadError(
        "invalid",
        `planet tile format ${manifest.tileFormatVersion} is not supported`,
      );
    }
    if (manifest.status === "ready") return manifest;
    const wait = retryAfterMs(response.headers.get("retry-after"), now()) ?? GENERATING_POLL_MS;
    options.onWaiting?.("generating", wait);
    await sleep(wait, signal);
  }
}

/**
 * 목록 정보 → 엔진 행성 설명(면 레벨·반지름·바이옴 번호별 색·가장 높은 땅). 범례에 없는 번호는 엔진이 회색으로 그린다.
 * 가장 높은 땅이 없으면(옛 서버) 엔진 기본값을 쓰고, 받은 타일이 더 높으면 엔진이 늘린다
 */
export function planetDescriptionOf(manifest: PlanetManifest): PlanetDescription {
  const biomeColors: number[] = [];
  for (const biome of manifest.biomes) biomeColors[biome.index] = Number.parseInt(biome.colour.slice(1), 16);
  const base = { faceLevel: manifest.faceLevel, radiusM: manifest.radiusM, biomeColors };
  return manifest.maxElevationM === undefined ? base : { ...base, maxElevationM: manifest.maxElevationM };
}

export interface TileSourceOptions {
  fetch?: FetchLike;
  sleep?: Sleep;
  now?: () => number;
  /** 화면이 알아야 할 타일 실패(로그인 풀림·판 바뀜·요청 많음). 엔진은 실패한 타일을 저절로 다시 받는다 */
  onFailure?: (reason: PlanetFailure) => void;
  /** 타일 하나를 받았을 때(잠깐 실패했던 안내를 지우는 데 쓴다) */
  onSuccess?: () => void;
}

/** 서버 타일 원천. 엔진이 동시에 몇 개씩 부르고, 원하지 않게 된 요청은 signal로 멈춘다 */
export function createServerTileSource(
  manifest: PlanetManifest,
  options: TileSourceOptions = {},
): TileSource {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? abortableSleep;
  const now = options.now ?? Date.now;
  /** 이 시각(ms)까지 새 타일 요청을 미룬다(429·409의 Retry-After) */
  let blockedUntil = 0;
  /** 타일 404를 받았다: 이 목록 정보의 주소 틀로는 더 받지 않는다(목록 정보부터 다시 받아야 한다) */
  let outdated = false;
  return async (request, signal): Promise<EncodedTile> => {
    const key = planetTileKey(request.mapLevel, request.face, request.i0, request.j0);
    if (outdated)
      throw new PlanetLoadError("not_found", `planet tiles are outdated (tile ${key} not requested)`);
    const wait = blockedUntil - now();
    if (wait > 0) await sleep(wait, signal);
    const response = await send(fetchImpl, planetTilePath(manifest.tileUrlTemplate, key), signal);
    const failure = failureOf(response.status);
    if (failure === "rate_limited" || failure === "generating") {
      const delay = retryAfterMs(response.headers.get("retry-after"), now()) ?? DEFAULT_RETRY_AFTER_MS;
      blockedUntil = Math.max(blockedUntil, now() + delay);
    }
    if (failure === "not_found") outdated = true;
    if (failure) {
      options.onFailure?.(failure);
      throw new PlanetLoadError(failure, `planet tile ${key} request failed: HTTP ${response.status}`);
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await response.arrayBuffer();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PlanetLoadError("network", error instanceof Error ? error.message : String(error));
    }
    options.onSuccess?.();
    return { kind: "encoded", bytes };
  };
}
