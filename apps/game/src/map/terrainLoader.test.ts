// 지형 받기 시험 — 같은 출처 쿠키로 받기, HTTP 상태·읽기 실패를 이유 코드로
import { encodeTerrain, terrainPath } from "@terra/protocol";
import { describe, expect, it, vi } from "vitest";
import { TerrainLoadError, fetchTerrain, isSameOriginPath } from "./terrainLoader.ts";

const url = terrainPath(2 ** 48 + 9, 1);
/** 상태 코드만 있는 응답을 주는 가짜 fetch */
const reply = (status: number) => async () => new Response("{}", { status });

/** 응답 본문(Response는 ArrayBuffer 위의 보기만 받는다) */
function terrainBytes(): Uint8Array<ArrayBuffer> {
  const heights = new Int32Array(129 * 129).fill(250);
  const surface = new Uint8Array(128 * 128).fill(1);
  return Uint8Array.from(
    encodeTerrain({
      mapKey: 2 ** 48 + 9,
      generatorVersion: 1,
      seed: 3,
      hash: 0,
      terrainSize: 128,
      heights,
      surface,
    }),
  );
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TerrainLoadError) return error.reason;
    throw error;
  }
  throw new Error("expected a failure");
}

describe("지형 받기", () => {
  it("같은 출처 쿠키로 받아 엔진 입력으로 바꾼다", async () => {
    const fetchImpl = vi.fn(async () => new Response(terrainBytes(), { status: 200 }));
    const input = await fetchTerrain(url, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(url, { credentials: "same-origin" });
    expect(input.heights[0]).toBe(25);
    expect(input.surface[0]).toBe(1);
  });

  it("HTTP 상태를 이유로: 401 로그인, 404 판 없음, 그 밖 서버 오류", async () => {
    expect(await failure(fetchTerrain(url, reply(401)))).toBe("sign_in");
    expect(await failure(fetchTerrain(url, reply(404)))).toBe("not_found");
    expect(await failure(fetchTerrain(url, reply(503)))).toBe("server");
  });

  it("닿지 못하면 network, 읽지 못하면 invalid", async () => {
    expect(
      await failure(
        fetchTerrain(url, async () => {
          throw new TypeError("Failed to fetch");
        }),
      ),
    ).toBe("network");
    expect(await failure(fetchTerrain(url, async () => new Response("not terrain", { status: 200 })))).toBe(
      "invalid",
    );
  });

  it("다른 출처로 가는 주소는 받지 않는다", async () => {
    const fetchImpl = vi.fn(async () => new Response(terrainBytes()));
    expect(await failure(fetchTerrain("https://example.test/terrain", fetchImpl))).toBe("invalid");
    expect(await failure(fetchTerrain("//example.test/terrain", fetchImpl))).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(isSameOriginPath("/api/maps/1/terrain?v=1")).toBe(true);
    expect(isSameOriginPath("/\\example.test")).toBe(false);
  });
});
