// gather 라우터 — 2차맵 원자재 오브젝트 채집·건물 들어가기 조회(docs/adr/2026-11-07-gather-objects.md). 응답 타입은 @terra/shared/gather다.
// - objects: 그 2차맵 오브젝트 자리·종류·남은 번수·다시 자라는 시각. loops: 내 유닛의 채집·들어가기. building: 2차맵 건물 판.
// - station: 채집소 판(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요" — 레벨·반경·버프·반경 안 오브젝트·채집소 창고·일꾼·다음 레벨).
//   응답 타입은 @terra/shared/gatherStation이다.
// - residence: 내 유닛의 지금 사는 곳·그 건물을 사는 곳으로 고를 수 있나(D-585 1). 응답 타입은 @terra/shared/residence. 고르기는 WebSocket residence_set.
// 읽기만 한다. 바꾸는 명령은 WebSocket이다(AGENTS 4장 — gather_start·gather_stop·unit_enter).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(틀린 입력). 세계(DB)가 없거나 준비 전이면 status "not_ready"
import type {
  GatherBuildingResponse,
  GatherInsideResponse,
  GatherLoopsResponse,
  GatherObjectsResponse,
} from "@terra/shared/gather";
import type { GatherStationResponse } from "@terra/shared/gatherStation";
import type { ResidenceResponse } from "@terra/shared/residence";
import { z } from "zod";
import { emptyStation } from "../gather/stationReads.ts";
import { router, signedInProcedure } from "./init.ts";

const mapKey = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const buildingId = z.number().int().positive().max(0xffff_ffff);
const unitId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

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
  /** 그 2차맵에서 건물 안에 머무는 유닛(지도에서 숨기고 건물 위에 "안에 N명") */
  inside: signedInProcedure.input(z.object({ mapKey })).query(({ ctx, input }): GatherInsideResponse => {
    const reads = ctx.gather?.();
    return reads
      ? reads.inside(ctx.viewer, input.mapKey, ctx.now())
      : { status: "not_ready", mapKey: input.mapKey, units: [], generatedAt: ctx.now() };
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
  /** 채집소 판(벌목장·광산·농장 — 레벨·반경·버프·오브젝트·창고·일꾼·다음 레벨) */
  station: signedInProcedure
    .input(z.object({ buildingId }))
    .query(({ ctx, input }): GatherStationResponse => {
      const reads = ctx.gather?.();
      return reads
        ? reads.station(ctx.viewer, input.buildingId, ctx.now())
        : emptyStation("not_ready", input.buildingId, ctx.now());
    }),
  /** 내 유닛의 사는 곳(D-585 1 — 고른 집 또는 숙소 배정)과 그 건물을 고를 수 있나 */
  residence: signedInProcedure
    .input(z.object({ unitId, buildingId: buildingId.optional() }))
    .query(({ ctx, input }): ResidenceResponse => {
      const reads = ctx.gather?.();
      return reads
        ? reads.residence(ctx.viewer, input.unitId, input.buildingId, ctx.now())
        : {
            status: "not_ready",
            unitId: input.unitId,
            current: null,
            building: null,
            generatedAt: ctx.now(),
          };
    }),
});
