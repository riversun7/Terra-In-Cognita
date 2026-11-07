// 부상·병원 라우터 — hospital.overview(조회). 기획 D-521·49 N55, docs/adr/2026-11-08-injury.md.
// 응답 타입은 @terra/shared/hospital이다. 바꾸는 명령(치료·개발 시험 부상)은 여기가 아니라 WebSocket(프로토콜 17)이다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), PRECONDITION_FAILED(data.reason world_not_ready: 세계가 없거나 부팅 복구 전)
import { rolesAllow } from "../auth/permissions.ts";
import { reasonedError, router, signedInProcedure } from "./init.ts";

export const hospitalRouter = router({
  /** 병원 목록(레벨·의사·배율)·다친 내 유닛(단계·다음 단계·초록 시각)과 그 유닛이 선 도시 병원의 치료 견적·잔고. dev·admin은 개발 시험 부상 */
  overview: signedInProcedure.query(async ({ ctx }) => {
    const services = ctx.hospital?.();
    if (!services) throw reasonedError("PRECONDITION_FAILED", "WORLD_NOT_READY", "world_not_ready");
    const devGrant = rolesAllow(ctx.viewer.roles, { secondMap: ["dev-spawn"] });
    return services.overview({ id: ctx.viewer.id, devGrant }, ctx.now());
  }),
});
