// holdings 라우터 — 보유 물건(아이템 인스턴스) 조회(docs/adr/2026-11-03-item-holdings.md 4절). 응답 타입은 @terra/shared/holdings다.
// 입기·벗기·쓰기·개발 받기는 게임 상태를 바꾸는 명령이라 WebSocket(@terra/protocol items.ts)으로만 보낸다(AGENTS 4장).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지)
import { router, signedInProcedure } from "./init.ts";

export const holdingsRouter = router({
  /** 로그인한 본인의 보유 물건과 그 유닛에 걸린 효과(썩기를 먼저 셈한다). 월드가 준비 전이면 빈 목록 */
  list: signedInProcedure.query(({ ctx }) => ctx.holdings.list(ctx.viewer, ctx.now())),
});
