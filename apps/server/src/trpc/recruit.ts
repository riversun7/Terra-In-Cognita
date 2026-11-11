// 구인 카드 라우터 — recruit.board(조회). 기획 D-469(출생 없음, 인구는 정부기관(행정 건물) 구인 카드로만), 49 N45,
// docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)". 응답 타입은 @terra/shared/recruit다.
// 고용(바꾸는 명령)은 여기가 아니라 WebSocket recruit_hire(프로토콜 7)다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(입력 형식),
// PRECONDITION_FAILED(data.reason world_not_ready: 세계가 없거나 부팅 복구 전이거나 NPC 사회 런타임이 꺼짐),
// NOT_FOUND("UNKNOWN_PLANET": planetId가 대표 플레이 행성이 아님 — NPC 사회 런타임은 대표 행성 하나만 돈다, docs/adr/2026-11-11-planet-scope.md)
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { rolesAllow } from "../auth/permissions.ts";
import { primaryPlanetId } from "../world/playablePlanets.ts";
import { reasonedError, router, signedInProcedure } from "./init.ts";

const boardInput = z
  .strictObject({
    cityId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    /** 구인 도시가 놓인 행성(없으면 대표 플레이 행성) */
    planetId: z
      .string()
      .min(2)
      .max(48)
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
  })
  .optional();

export const recruitRouter = router({
  /**
   * 그 도시(없으면 내 시작 도시, 없으면 첫 도시) 행정 건물의 지금 창 카드(고용 주체 = 나)·내 잔고·구인 도시 목록.
   * dev·admin은 그 도시 주인(NPC 세력)의 카드도 받는다(시안 자료 권한 home: preview와 같은 역할)
   */
  board: signedInProcedure.input(boardInput).query(({ ctx, input }) => {
    if (input?.planetId !== undefined && input.planetId !== primaryPlanetId())
      throw new TRPCError({ code: "NOT_FOUND", message: "UNKNOWN_PLANET" });
    const services = ctx.recruits?.();
    const owner = rolesAllow(ctx.viewer.roles, { home: ["preview"] });
    const board = services?.board({ id: ctx.viewer.id, owner }, input?.cityId, ctx.now());
    if (!board) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    return board;
  }),
});
