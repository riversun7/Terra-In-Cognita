// labor 라우터 — 노동 계약 조회(docs/adr/2026-11-03-labor-contracts.md). 응답 타입은 @terra/shared/labor
// LaborOverviewResponse·LaborJobsResponse다. 맺기·해지·보증금 채우기·임대료 정하기·구인 내기·거두기·받기는 게임 상태를 바꾸는
// 명령이라 WebSocket으로만 보낸다(AGENTS 4장).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), BAD_REQUEST(틀린 입력)
import { z } from "zod";
import { createLaborScreenServices } from "../labor/views.ts";
import { router, signedInProcedure } from "./init.ts";

const notReady = createLaborScreenServices();
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const laborRouter = router({
  /** 로그인한 본인의 계약(시설 주인·유닛 소유 주체로), 내 시설·빌릴 수 있는 시설, 내 유닛, 내 구인 게시, N48 규칙 값 */
  overview: signedInProcedure.query(({ ctx }) => (ctx.labor ?? notReady).overview(ctx.viewer, ctx.now())),
  /** 구인 게시판: 남이 낸 열린 일자리(도시·시설로 거름, 임금 높은 차례, 상한 LABOR_JOBS_LIMIT) */
  jobs: signedInProcedure
    .input(z.object({ cityId: rowId.optional(), buildingId: rowId.optional() }).optional())
    .query(({ ctx, input }) =>
      (ctx.labor ?? notReady).jobs(
        ctx.viewer,
        { cityId: input?.cityId, buildingId: input?.buildingId },
        ctx.now(),
      ),
    ),
});
