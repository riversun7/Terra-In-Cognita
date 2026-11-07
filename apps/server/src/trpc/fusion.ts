// 사이보그 유닛 융합·유전자 라우터 — fusion.overview(조회). 기획 D-470·D-478·D-481, 49 N46·N47,
// docs/adr/2026-11-07-cyborg-fusion-genes.md. 응답 타입은 @terra/shared/fusion이다.
// 바꾸는 명령(융합·개발 물자 받기, 유전자 합성·주입·인큐베이터·개발 시험)은 여기가 아니라 WebSocket(프로토콜 9·11)이다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), PRECONDITION_FAILED(data.reason world_not_ready: 세계가 없거나 부팅 복구 전)
import { rolesAllow } from "../auth/permissions.ts";
import { reasonedError, router, signedInProcedure } from "./init.ts";

export const fusionRouter = router({
  /** 융합할 수 있는 내 휴먼·융합 비용과 내 잔고·재료·내 사이보그 유닛·내 유전자(인스턴스). dev·admin은 개발 시험을 쓴다 */
  overview: signedInProcedure.query(async ({ ctx }) => {
    const services = ctx.fusion?.();
    if (!services) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    const devGrant = rolesAllow(ctx.viewer.roles, { secondMap: ["dev-spawn"] });
    return services.overview({ id: ctx.viewer.id, devGrant }, ctx.now());
  }),
});
