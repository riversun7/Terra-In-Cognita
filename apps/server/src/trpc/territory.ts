// territory 라우터 — 영토 조회(docs/adr/2026-11-03-territory-layer.md 5절). 응답 타입은 @terra/shared/territoryApi TerritoryPlanetView다.
// 비콘 놓기·치우기는 게임 상태를 바꾸는 명령이라 여기가 아니라 WebSocket(beacon_place·beacon_remove)으로만 보낸다(AGENTS 4장).
// - mine: 로그인한 본인 세력의 영토 칸·껍질·도시·비콘(세력 영토와 비콘 목록). 세력이 없으면 myFactionId null·빈 목록.
// - planet: 모든 세력(개발 영토 화면 /dev/territory). 권한 territory: observe(dev·admin). 시야(D-103)로 거르지 않는다.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, BAD_REQUEST(입력 형식), PRECONDITION_FAILED("WORLD_NOT_READY": 세계·DB 없음·부팅 전),
// NOT_FOUND("UNKNOWN_PLANET": 영토를 셈하지 않는 행성)
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TerritoryReadServices, TrpcContext } from "./context.ts";
import { permissionProcedure, router, signedInProcedure } from "./init.ts";

const planetInput = z.strictObject({
  planetId: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z][a-z0-9_]*$/),
});

function services(ctx: Pick<TrpcContext, "territory">): TerritoryReadServices {
  const ready = ctx.territory?.();
  if (!ready) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WORLD_NOT_READY" });
  return ready;
}

function found(view: TerritoryPlanetView | undefined): TerritoryPlanetView {
  if (!view) throw new TRPCError({ code: "NOT_FOUND", message: "UNKNOWN_PLANET" });
  return view;
}

export const territoryRouter = router({
  /** 내 세력 영토(칸·껍질·도시·비콘) */
  mine: signedInProcedure
    .input(planetInput)
    .query(async ({ ctx, input }) => found(await services(ctx).mineView(input.planetId, ctx.viewer.id))),
  /** 행성의 모든 세력 영토(개발 화면) */
  planet: permissionProcedure({ territory: ["observe"] })
    .input(planetInput)
    .query(async ({ ctx, input }) => found(await services(ctx).planetView(input.planetId, ctx.viewer.id))),
});
