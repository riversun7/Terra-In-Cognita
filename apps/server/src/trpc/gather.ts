// gather 라우터 — 2차맵 원자재 오브젝트 채집·건물 들어가기 조회(docs/adr/2026-11-07-gather-objects.md). 응답 타입은 @terra/shared/gather다.
// - objects: 그 2차맵 오브젝트 자리·종류·남은 번수·다시 자라는 시각. loops: 내 유닛의 채집·들어가기. building: 2차맵 건물 판.
// 읽기만 한다. 바꾸는 명령은 WebSocket이다(AGENTS 4장 — gather_start·gather_stop·unit_enter).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(틀린 입력). 세계(DB)가 없거나 준비 전이면 status "not_ready"
import type {
  GatherBuildingResponse,
  GatherLoopsResponse,
  GatherObjectsResponse,
} from "@terra/shared/gather";
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";

const mapKey = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const buildingId = z.number().int().positive().max(0xffff_ffff);

export const gatherRouter = router({
  /** 그 2차맵의 오브젝트 */
  objects: signedInProcedure.input(z.object({ mapKey })).query(({ ctx, input }): GatherObjectsResponse => {
    const reads = ctx.gather?.();
    return reads
      ? reads.objects(ctx.viewer, input.mapKey, ctx.now())
      : { status: "not_ready", mapKey: input.mapKey, kinds: [], objects: [], generatedAt: ctx.now() };
  }),
  /** 내 유닛의 채집·들어가기(진행 중 + 최근 끝난 것) */
  loops: signedInProcedure.query(({ ctx }): GatherLoopsResponse => {
    const reads = ctx.gather?.();
    return reads
      ? reads.loops(ctx.viewer, ctx.now())
      : { status: "not_ready", loops: [], generatedAt: ctx.now() };
  }),
  /** 2차맵 건물 판(안에 있는 유닛) */
  building: signedInProcedure
    .input(z.object({ buildingId }))
    .query(({ ctx, input }): GatherBuildingResponse => {
      const reads = ctx.gather?.();
      return reads
        ? reads.building(ctx.viewer, input.buildingId, ctx.now())
        : {
            status: "not_ready",
            buildingId: input.buildingId,
            facilityId: null,
            name: null,
            stage: null,
            level: 0,
            mine: false,
            accepts: false,
            hires: false,
            inside: [],
            generatedAt: ctx.now(),
          };
    }),
});
