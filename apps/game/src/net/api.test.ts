// tRPC 클라이언트 시험 — 서버 없이 가짜 fetch로 요청 주소, 응답 해석, 출력 타입 추론을 본다.
// 서버와 실제로 주고받는 시험은 apps/server/src/trpc/system.test.ts에 있다(같은 httpBatchLink 사용).
import { TRPC_MAX_BATCH_SIZE, TRPC_PATH } from "@terra/protocol";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createApiClient } from "./api.ts";

const info = { protocolVersion: 1, simVersion: 1, contentVersion: "test", serverTime: 5 };

/** fetch가 받은 주소 (문자열·URL·Request 모두) */
const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

describe("API 클라이언트", () => {
  it("system.info를 /api/trpc/system.info로 묻고 결과를 돌려준다", async () => {
    const urls: string[] = [];
    const client = createApiClient({
      url: `http://game.test${TRPC_PATH}`,
      fetch: async (url) => {
        urls.push(urlOf(url));
        // 묶음 요청의 응답은 요청 순서대로 담긴 배열이다
        return new Response(JSON.stringify([{ result: { data: info } }]), {
          headers: { "content-type": "application/json" },
        });
      },
    });

    const result = await client.system.info.query();
    expect(result).toEqual(info);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.startsWith(`http://game.test${TRPC_PATH}/system.info?batch=1`)).toBe(true);
    // 출력 타입은 서버 프로시저(AppRouter 선언 파일)에서 추론된다
    expectTypeOf(result).toEqualTypeOf<{
      protocolVersion: number;
      simVersion: number;
      contentVersion: string;
      serverTime: number;
    }>();
  });

  it(`같은 틱의 요청은 서버 묶음 상한(${TRPC_MAX_BATCH_SIZE}개)에서 나눠 보낸다`, async () => {
    const urls: string[] = [];
    const client = createApiClient({
      url: `http://game.test${TRPC_PATH}`,
      fetch: async (url) => {
        const href = urlOf(url);
        urls.push(href);
        const count = (href.split("?")[0]?.split("/").at(-1) ?? "").split(",").length;
        return new Response(
          JSON.stringify(Array.from({ length: count }, () => ({ result: { data: info } }))),
        );
      },
    });
    const count = TRPC_MAX_BATCH_SIZE * 2 + 1;
    const results = await Promise.all(Array.from({ length: count }, () => client.system.info.query()));
    expect(results).toHaveLength(count);
    expect(urls).toHaveLength(3);
    const sizes = urls.map((href) => (href.split("?")[0]?.split("/").at(-1) ?? "").split(",").length);
    expect(sizes).toEqual([TRPC_MAX_BATCH_SIZE, TRPC_MAX_BATCH_SIZE, 1]);
  });

  it("기본 주소는 같은 출처의 /api/trpc", async () => {
    const urls: string[] = [];
    const client = createApiClient({
      fetch: async (url) => {
        urls.push(urlOf(url));
        return new Response(JSON.stringify([{ result: { data: info } }]));
      },
    });
    await client.system.info.query();
    expect(urls[0]?.startsWith(`${TRPC_PATH}/system.info?`)).toBe(true);
  });
});
