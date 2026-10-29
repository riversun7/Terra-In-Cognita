// 1차맵 서버 원천 시험 — 목록 정보 받기(굽는 중 기다리기·Retry-After), 행성 설명, 타일 주소·취소·실패 이유
import type { TileRequest } from "@terra/engine/planet";
import { planetTileKey } from "@terra/planet";
import {
  PLANET_TILE_FORMAT_VERSION,
  type PlanetManifest,
  planetTilePath,
  planetTileUrlTemplate,
  planetTileVersion,
} from "@terra/protocol";
import { describe, expect, it, vi } from "vitest";
import {
  GENERATING_POLL_MS,
  PlanetLoadError,
  abortableSleep,
  createServerTileSource,
  loadPlanetManifest,
  planetDescriptionOf,
  retryAfterMs,
} from "./planetSource.ts";

const HASH = "ab".repeat(32);
const manifest: PlanetManifest = {
  id: "s2_test_planet",
  name: { ko: "S2 시험 행성", en: "S2 test planet" },
  faceLevel: 9,
  radiusM: 531_000,
  generatorVersion: 1,
  definitionHash: HASH,
  status: "ready",
  tileFormatVersion: PLANET_TILE_FORMAT_VERSION,
  tileUrlTemplate: planetTileUrlTemplate("s2_test_planet", planetTileVersion(1, HASH)),
  biomes: [
    { index: 0, id: "ocean_deep", colour: "#1c3d6e", name: { ko: "심해", en: "Deep ocean" } },
    { index: 2, id: "tundra", colour: "#a0b0a8", name: { ko: "툰드라", en: "Tundra" } },
  ],
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** 기다리지 않는 기다리기(얼마를 기다렸는지 적는다) */
function instantSleep() {
  const waits: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    waits.push(ms);
    return Promise.resolve();
  };
  return { waits, sleep };
}

/** 상태 코드만 있는 JSON 응답을 주는 가짜 fetch */
const jsonStatus = (status: number) => async () => json({ error: "X" }, status);
/** 본문 하나를 주는 가짜 fetch */
const answer = (body: unknown) => async () => json(body);
/** 본문 없는 응답(타일) */
const tileStatus = (status: number) => async () => new Response(null, { status });
/** 닿지 못하는 fetch */
async function offline(): Promise<Response> {
  throw new TypeError("Failed to fetch");
}
/** JSON이 아닌 본문 */
async function notJson(): Promise<Response> {
  return new Response("<html>", { status: 200 });
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PlanetLoadError) return error.reason;
    throw error;
  }
  throw new Error("expected a failure");
}

describe("목록 정보 받기", () => {
  it("굽는 중이면 Retry-After(없으면 5초)만큼 기다리며 다시 묻고, 준비되면 돌려준다", async () => {
    const replies = [
      json({ ...manifest, status: "generating" }),
      json({ ...manifest, status: "generating" }, 200, { "retry-after": "2" }),
      json(manifest),
    ];
    const fetchImpl = vi.fn(async () => replies.shift() ?? json(manifest));
    const { waits, sleep } = instantSleep();
    const onGenerating = vi.fn();
    const signal = new AbortController().signal;
    const loaded = await loadPlanetManifest("s2_test_planet", {
      signal,
      fetch: fetchImpl,
      sleep,
      onGenerating,
    });
    expect(loaded).toEqual(manifest);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith("/api/planets/s2_test_planet", {
      credentials: "same-origin",
      signal,
    });
    expect(waits).toEqual([GENERATING_POLL_MS, 2000]);
    expect(onGenerating).toHaveBeenNthCalledWith(1, GENERATING_POLL_MS);
  });

  it("429는 Retry-After 뒤 다시, 401·404·5xx·네트워크는 이유 코드로 실패", async () => {
    const { waits, sleep } = instantSleep();
    const replies = [json({ error: "RATE_LIMITED" }, 429, { "retry-after": "3" }), json(manifest)];
    const signal = new AbortController().signal;
    await loadPlanetManifest("s2_test_planet", {
      signal,
      sleep,
      fetch: async () => replies.shift() ?? json(manifest),
    });
    expect(waits).toEqual([3000]);
    expect(await failure(loadPlanetManifest("p_x", { signal, fetch: jsonStatus(401) }))).toBe("sign_in");
    expect(await failure(loadPlanetManifest("p_x", { signal, fetch: jsonStatus(404) }))).toBe("not_found");
    expect(await failure(loadPlanetManifest("p_x", { signal, fetch: jsonStatus(503) }))).toBe("server");
    expect(await failure(loadPlanetManifest("p_x", { signal, fetch: offline }))).toBe("network");
  });

  it("스키마가 틀리거나, 다른 행성이거나, 모르는 타일 형식·다른 출처 주소면 invalid", async () => {
    const signal = new AbortController().signal;
    const id = "s2_test_planet";
    expect(await failure(loadPlanetManifest(id, { signal, fetch: answer({ id }) }))).toBe("invalid");
    expect(await failure(loadPlanetManifest("other_planet", { signal, fetch: answer(manifest) }))).toBe(
      "invalid",
    );
    const newer = { ...manifest, tileFormatVersion: PLANET_TILE_FORMAT_VERSION + 1 };
    expect(await failure(loadPlanetManifest(id, { signal, fetch: answer(newer) }))).toBe("invalid");
    const elsewhere = { ...manifest, tileUrlTemplate: "/\\example.test/{tileKey}" };
    expect(await failure(loadPlanetManifest(id, { signal, fetch: answer(elsewhere) }))).toBe("invalid");
    expect(await failure(loadPlanetManifest(id, { signal, fetch: notJson }))).toBe("invalid");
  });

  it("멈추면(abort) 기다리던 다시 묻기를 그만둔다", async () => {
    const controller = new AbortController();
    const pending = loadPlanetManifest("s2_test_planet", {
      signal: controller.signal,
      fetch: async () => json({ ...manifest, status: "generating" }),
    });
    controller.abort(new DOMException("closed", "AbortError"));
    await expect(pending).rejects.toThrow(/closed/);
  });
});

describe("행성 설명", () => {
  it("면 레벨·반지름, 바이옴 번호별 색(범례 index 자리)", () => {
    const description = planetDescriptionOf(manifest);
    expect(description.faceLevel).toBe(9);
    expect(description.radiusM).toBe(531_000);
    expect(description.biomeColors[0]).toBe(0x1c3d6e);
    expect(description.biomeColors[1]).toBeUndefined();
    expect(description.biomeColors[2]).toBe(0xa0b0a8);
  });
});

describe("타일 원천", () => {
  const request: TileRequest = { face: 3, mapLevel: 7, i0: 64, j0: 32, size: 32 };
  const url = planetTilePath(manifest.tileUrlTemplate, planetTileKey(7, 3, 64, 32));

  it("타일 ID 주소를 signal과 함께 받아 이진 그대로 돌려준다(엔진 워커가 푼다)", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async () => new Response(bytes, { status: 200 }));
    const source = createServerTileSource(manifest, { fetch: fetchImpl });
    const signal = new AbortController().signal;
    const tile = await source(request, signal);
    expect(fetchImpl).toHaveBeenCalledWith(url, { credentials: "same-origin", signal });
    expect(tile).toMatchObject({ kind: "encoded" });
    expect("bytes" in tile && new Uint8Array(tile.bytes)).toEqual(bytes);
    // 면이 32칸보다 작은 단계는 그 맵 레벨의 (0, 0) 칸 키(타일 작업 규칙)
    await source({ face: 1, mapLevel: 4, i0: 0, j0: 0, size: 16 }, signal);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      planetTilePath(manifest.tileUrlTemplate, planetTileKey(4, 1, 0, 0)),
      {
        credentials: "same-origin",
        signal,
      },
    );
  });

  it("429·409는 Retry-After까지 새 요청을 미루고, 실패 이유를 화면에 알린다", async () => {
    let clock = 1_000_000;
    const { waits, sleep } = instantSleep();
    const replies = [
      new Response("{}", { status: 429, headers: { "retry-after": "4" } }),
      new Response(new Uint8Array([9]), { status: 200 }),
    ];
    const onFailure = vi.fn();
    const source = createServerTileSource(manifest, {
      fetch: async () => replies.shift() ?? new Response(null, { status: 500 }),
      sleep,
      now: () => clock,
      onFailure,
    });
    const signal = new AbortController().signal;
    expect(await failure(source(request, signal))).toBe("rate_limited");
    expect(onFailure).toHaveBeenCalledWith("rate_limited");
    clock += 1000;
    await source(request, signal);
    expect(waits).toEqual([3000]);
  });

  it("401·404·5xx·네트워크는 이유 코드로 거절하고, 멈춘 받기는 그대로 거절한다", async () => {
    const signal = new AbortController().signal;
    const onFailure = vi.fn();
    expect(
      await failure(createServerTileSource(manifest, { fetch: tileStatus(401), onFailure })(request, signal)),
    ).toBe("sign_in");
    expect(
      await failure(createServerTileSource(manifest, { fetch: tileStatus(404), onFailure })(request, signal)),
    ).toBe("not_found");
    expect(await failure(createServerTileSource(manifest, { fetch: tileStatus(502) })(request, signal))).toBe(
      "server",
    );
    expect(onFailure.mock.calls).toEqual([["sign_in"], ["not_found"]]);
    expect(await failure(createServerTileSource(manifest, { fetch: offline })(request, signal))).toBe(
      "network",
    );
    const controller = new AbortController();
    const aborted = async (): Promise<Response> => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    };
    await expect(
      createServerTileSource(manifest, { fetch: aborted })(request, controller.signal),
    ).rejects.toBeInstanceOf(DOMException);
  });
});

describe("도우미", () => {
  it("Retry-After: 초·HTTP 날짜, 읽지 못하면 undefined, 상한 2분", () => {
    const now = Date.parse("2026-10-29T00:00:00Z");
    expect(retryAfterMs("5", now)).toBe(5000);
    expect(retryAfterMs("Thu, 29 Oct 2026 00:00:10 GMT", now)).toBe(10_000);
    expect(retryAfterMs(null, now)).toBeUndefined();
    expect(retryAfterMs("soon", now)).toBeUndefined();
    expect(retryAfterMs("99999", now)).toBe(120_000);
  });

  it("기다리기는 멈추면 그 이유로 거절한다", async () => {
    const controller = new AbortController();
    const pending = abortableSleep(60_000, controller.signal);
    controller.abort(new Error("stop"));
    await expect(pending).rejects.toThrow("stop");
    await expect(abortableSleep(1, controller.signal)).rejects.toThrow("stop");
  });
});
