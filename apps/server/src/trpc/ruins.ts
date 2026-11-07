// 폐허 복원 라우터 — ruins.overview(조회). 기획 D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md.
// 응답 타입은 @terra/shared/ruins다. 바꾸는 명령(행정 건물 짓기·모금 열기·넣기·개발 시험 폐허)은 여기가 아니라 WebSocket(프로토콜 13)이다.
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지). 세계·NPC 사회 런타임이 없거나 부팅 복구 전이면 status not_ready(빈 목록)
import type { RuinsOverviewResponse } from "@terra/shared/ruins";
import { rolesAllow } from "../auth/permissions.ts";
import { router, signedInProcedure } from "./init.ts";

/** 준비 전 응답(빈 목록) */
const notReady = (nowMs: number, dev: boolean): RuinsOverviewResponse => ({
  status: "not_ready",
  ruins: [],
  government: null,
  balance: "0",
  currency: "",
  hasCyborg: false,
  dev,
  generatedAt: nowMs,
});

export const ruinsRouter = router({
  /** 폐허 목록·주인·복원 사업(목표·모인 값·내 몫·지분 미리 셈)·정부 짓기 자리와 재료·내 잔고. dev·admin은 개발 시험(폐허 만들기)을 쓴다 */
  overview: signedInProcedure.query(({ ctx }) => {
    const services = ctx.ruins?.();
    const devGrant = rolesAllow(ctx.viewer.roles, { secondMap: ["dev-spawn"] });
    return services?.overview({ id: ctx.viewer.id, devGrant }, ctx.now()) ?? notReady(ctx.now(), devGrant);
  }),
});
