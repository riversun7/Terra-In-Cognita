// Zod 4 + tRPC 11 연동 확인 (ADR 2026-10-28-stack-baseline의 "골격 단계에서 확인" 항목)
// 시험 전용 라우터를 우리 tRPC 구성(init.ts)과 Fastify 연결(plugin.ts)에 그대로 붙여 본다.
// 확인한 것:
// - 타입: 입력·출력 타입이 Zod 스키마에서 추론된다(Standard Schema 경유). 변환(transform)이 있으면 입력과 출력이 다르다.
// - 실행: tRPC는 Zod 스키마를 Standard Schema가 아니라 Zod 자체의 parseAsync로 검사한다 → 실패 원인(cause)은 ZodError.
// - HTTP: 형식이 틀린 입력은 400 BAD_REQUEST. 예상하지 못한 오류는 500이고 원문 메시지를 숨긴다.
import { TRPC_PATH } from "@terra/protocol";
import { TRPCError, type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createContextFactory } from "./context.ts";
import { INTERNAL_ERROR_MESSAGE, createCallerFactory, publicProcedure, router } from "./init.ts";
import { registerTrpc } from "./plugin.ts";

const testRouter = router({
  greet: publicProcedure
    .input(z.object({ name: z.string().min(1).max(20), times: z.int().min(1).max(3).default(1) }))
    .query(({ input }) => input.name.repeat(input.times)),
  // 입력은 문자열, 프로시저 안에서는 변환된 숫자(글자 수)
  double: publicProcedure
    .input(z.string().transform((text) => text.length))
    .mutation(({ input }) => input * 2),
  fail: publicProcedure.query(() => {
    throw new Error("db password=secret");
  }),
});
type TestRouter = typeof testRouter;

const createContext = createContextFactory({ contentVersion: "test", now: () => 0 });
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function makeServer(): Promise<FastifyInstance> {
  app = Fastify({ logger: false });
  await registerTrpc(app, { router: testRouter, createContext });
  await app.ready();
  return app;
}

/** GET 조회의 입력은 JSON을 주소에 넣는다(httpLink 형식) */
const queryUrl = (path: string, input: unknown) =>
  `${TRPC_PATH}/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;

/** POST 변경의 입력은 JSON 본문 */
const mutate = (server: FastifyInstance, path: string, input: unknown) =>
  server.inject({
    method: "POST",
    url: `${TRPC_PATH}/${path}`,
    payload: JSON.stringify(input),
    headers: { "content-type": "application/json" },
  });

describe("Zod 4 입력 검사 (tRPC 11)", () => {
  it("타입: 입력·출력이 Zod 스키마에서 추론된다", () => {
    type Inputs = inferRouterInputs<TestRouter>;
    type Outputs = inferRouterOutputs<TestRouter>;
    // 기본값이 있는 필드는 입력에서 생략할 수 있다
    expectTypeOf<Inputs["greet"]>().toEqualTypeOf<{ name: string; times?: number | undefined }>();
    expectTypeOf<Outputs["greet"]>().toEqualTypeOf<string>();
    // 변환 전(입력)과 후(프로시저가 받는 값)가 다르다
    expectTypeOf<Inputs["double"]>().toEqualTypeOf<string>();
    expectTypeOf<Outputs["double"]>().toEqualTypeOf<number>();
  });

  it("맞는 입력은 200, 기본값과 변환이 적용된다", async () => {
    const server = await makeServer();
    const greet = await server.inject({ method: "GET", url: queryUrl("greet", { name: "ab" }) });
    expect(greet.statusCode).toBe(200);
    expect(greet.json()).toEqual({ result: { data: "ab" } });

    const double = await mutate(server, "double", "abc");
    expect(double.statusCode).toBe(200);
    expect(double.json()).toEqual({ result: { data: 6 } });
  });

  it("틀린 입력은 HTTP 400 BAD_REQUEST (조회·변경 모두)", async () => {
    const server = await makeServer();
    const query = await server.inject({ method: "GET", url: queryUrl("greet", { name: "", times: 9 }) });
    expect(query.statusCode).toBe(400);
    expect(query.json()).toMatchObject({ error: { data: { code: "BAD_REQUEST", httpStatus: 400 } } });

    const mutation = await mutate(server, "double", 42);
    expect(mutation.statusCode).toBe(400);
    expect(mutation.json()).toMatchObject({ error: { data: { code: "BAD_REQUEST" } } });
  });

  it("실패 원인은 ZodError이고 문제 위치(path)를 담는다", async () => {
    const caller = createCallerFactory(testRouter)(createContext());
    const error = await caller.greet({ name: "" }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(TRPCError);
    const cause = error instanceof TRPCError ? error.cause : undefined;
    expect(cause).toBeInstanceOf(z.ZodError);
    const issues = cause instanceof z.ZodError ? cause.issues : [];
    expect(issues.map((issue) => issue.path)).toEqual([["name"]]);
  });

  it("예상하지 못한 오류는 500이고 원문 메시지·스택을 보내지 않는다", async () => {
    const server = await makeServer();
    const res = await server.inject({ method: "GET", url: `${TRPC_PATH}/fail` });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret");
    expect(res.json()).toMatchObject({
      error: { message: INTERNAL_ERROR_MESSAGE, data: { code: "INTERNAL_SERVER_ERROR" } },
    });
    expect(res.json().error.data.stack).toBeUndefined();
  });
});
