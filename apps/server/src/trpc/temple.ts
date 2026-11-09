// 신전·종교 라우터 — temple.overview(조회). 기획 D-517·D-311·D-441·D-451·49 S15, docs/adr/2026-11-07-temple-religion.md.
// 응답 타입은 @terra/shared/temple이다. 바꾸는 명령(기도·헌금·의식·유전자 변환·개발 시험 비활성 만들기)은 여기가 아니라 WebSocket(프로토콜 12)이다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), PRECONDITION_FAILED(data.reason world_not_ready: 세계가 없거나 부팅 복구 전)
import { rolesAllow } from "../auth/permissions.ts";
import { reasonedError, router, signedInProcedure } from "./init.ts";

export const templeRouter = router({
  /** 신전·연구소 목록·내 휴먼(신앙도·비활성)·수호신·규칙 값과 내 사이보그 신앙도. dev·admin은 개발 시험(비활성 만들기)을 쓴다 */
  overview: signedInProcedure.query(async ({ ctx }) => {
    const services = ctx.temple?.();
    if (!services) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    const devGrant = rolesAllow(ctx.viewer.roles, { secondMap: ["dev-test"] });
    return services.overview({ id: ctx.viewer.id, devGrant }, ctx.now());
  }),
});
