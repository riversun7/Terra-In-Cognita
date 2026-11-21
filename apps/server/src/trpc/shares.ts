// 지분 시장 라우터 — shares.city(정부 건물 도시 지분 판)·shares.hub(증권 거래소 건물 판). 기획 D-583(질문 2438 답), docs/adr/2026-11-21-share-market.md.
// 응답 타입은 @terra/shared/cityShares다. 바꾸는 명령(주문·거두기)은 여기가 아니라 WebSocket city_share_*(사업장 지분은 business_share_*)다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), PRECONDITION_FAILED(data.reason world_not_ready: DB 없는 서버)
import { z } from "zod";
import { reasonedError, router, signedInProcedure } from "./init.ts";

const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const sharesRouter = router({
  /** 도시 하나의 지분 시장(주주 전체·나라 전체 주주·호가창·다음 회차·내 지갑·내 주문·국고) */
  city: signedInProcedure.input(z.object({ cityId: rowId })).query(async ({ ctx, input }) => {
    const view = ctx.cityShares?.();
    if (!view) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    return view.city(ctx.viewer.id, input.cityId);
  }),
  /** 증권 거래소 건물: 그 나라 정부 지분 시장·사업장 지분 시장 목록 */
  hub: signedInProcedure.input(z.object({ buildingId: rowId })).query(async ({ ctx, input }) => {
    const view = ctx.cityShares?.();
    if (!view) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    return view.hub(ctx.viewer.id, input.buildingId);
  }),
});
