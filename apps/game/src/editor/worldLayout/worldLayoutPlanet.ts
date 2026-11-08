// 세계 배치 화면의 행성 평면 지도 자료 받기 — 1차맵과 같은 목록 정보(GET /api/planets/<ID>)·타일(…/tiles/<타일 ID>?v=…).
// 1차맵 원천(map/planetSource.ts)은 엔진 꾸러미를 함께 가져와 이 화면 조각이 커지므로, 같은 주소·같은 해석기(@terra/protocol/planetTile)로
// 짧게 다시 쓴다(엔진 없음). 굽는 중(status generating)·429·409는 Retry-After(없으면 5초) 뒤 다시 묻는다. 실패는 이유 코드로 알린다.
import { planetTileKey } from "@terra/planet";
import { canReadPlanetTiles, planetManifestPath, planetManifestSchema } from "@terra/protocol";
import { type PlanetTileData, decodePlanetTile, planetTilePath } from "@terra/protocol/planetTile";
import type { FlatMapFields } from "../planet/flatMapRender.ts";
import { MAP_LEVEL_DROP, assembleFlatFields, tileSlots } from "./worldLayoutModel.ts";

export type PlanetLoadFailure = "network" | "sign_in" | "server" | "invalid";

export class FlatPlanetError extends Error {
  override readonly name = "FlatPlanetError";
  readonly reason: PlanetLoadFailure;
  constructor(reason: PlanetLoadFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface FlatPlanet {
  readonly fields: FlatMapFields;
  /** 바이옴 번호별 색(0xRRGGBB) — 1차맵과 같은 범례 */
  readonly biomeColors: readonly number[];
  /** 2차맵 칸 키의 면 레벨 */
  readonly faceLevel: number;
}

/** 다시 묻기 전 기다림(Retry-After가 없을 때, ms) */
const RETRY_MS = 5000;
/** 동시에 받는 타일 수 */
const CONCURRENCY = 4;
/** 한 요청을 다시 묻는 횟수 상한(429·409·굽는 중) */
const MAX_TRIES = 12;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

const retryAfter = (response: Response): number => {
  const text = response.headers.get("retry-after");
  const seconds = text !== null && /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined;
  return seconds === undefined ? RETRY_MS : Math.min(120_000, seconds * 1000);
};

/** 받기(429·409는 기다렸다 다시). 닿지 못하면 network, 401이면 sign_in, 그 밖 실패는 server */
async function fetchOk(url: string, signal: AbortSignal): Promise<Response> {
  for (let tries = 0; ; tries++) {
    let response: Response;
    try {
      response = await fetch(url, { credentials: "same-origin", signal });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new FlatPlanetError("network", error instanceof Error ? error.message : String(error));
    }
    if (response.ok) return response;
    if (response.status === 401) throw new FlatPlanetError("sign_in", `HTTP 401 ${url}`);
    if ((response.status === 429 || response.status === 409) && tries < MAX_TRIES) {
      await sleep(retryAfter(response), signal);
      continue;
    }
    throw new FlatPlanetError("server", `HTTP ${response.status} ${url}`);
  }
}

/** 행성 평면 지도 자료를 받는다(목록 정보가 굽는 중이면 끝날 때까지 기다린다) */
export async function loadFlatPlanet(planetId: string, signal: AbortSignal): Promise<FlatPlanet> {
  let manifest;
  for (let tries = 0; ; tries++) {
    const response = await fetchOk(planetManifestPath(planetId), signal);
    const parsed = planetManifestSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || parsed.data.id !== planetId || !canReadPlanetTiles(parsed.data))
      throw new FlatPlanetError("invalid", "planet manifest does not match");
    if (parsed.data.status === "ready") {
      manifest = parsed.data;
      break;
    }
    if (tries >= MAX_TRIES) throw new FlatPlanetError("server", "planet still generating");
    await sleep(retryAfter(response), signal);
  }
  const mapLevel = Math.max(manifest.faceLevel - 4, manifest.faceLevel - MAP_LEVEL_DROP);
  const slots = tileSlots(mapLevel);
  const tiles: PlanetTileData[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < slots.length) {
      const slot = slots[next];
      next += 1;
      if (!slot) continue;
      const key = planetTileKey(mapLevel, slot.face, slot.i0, slot.j0);
      const response = await fetchOk(planetTilePath(manifest.tileUrlTemplate, key), signal);
      try {
        tiles.push(decodePlanetTile(await response.arrayBuffer()));
      } catch (error) {
        if (signal.aborted) throw error;
        throw new FlatPlanetError("invalid", error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const biomeColors: number[] = [];
  for (const biome of manifest.biomes) biomeColors[biome.index] = Number.parseInt(biome.colour.slice(1), 16);
  return { fields: assembleFlatFields(tiles, mapLevel), biomeColors, faceLevel: manifest.faceLevel };
}
