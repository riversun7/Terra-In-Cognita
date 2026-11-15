// facilities 라우터 — 건물 조회(docs/adr/2026-11-07-buildings-runtime.md). 응답 타입은 @terra/shared/facilities
// FacilitiesOverviewResponse, 2차맵 건물 겉모습은 @terra/shared/mapLooks MapLooksResponse(ADR 2026-11-08-building-art)다.
// 짓기·레벨업·수리·장비 수리·개발 시험 명령은 게임 상태를 바꾸는 명령이라 WebSocket으로만 보낸다(AGENTS 4장).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지)
import { z } from "zod";
import { createFacilityScreenServices } from "../facilities/screen.ts";
import { router, signedInProcedure } from "./init.ts";

const notReady = createFacilityScreenServices();

export const facilitiesRouter = router({
  /** 로그인한 본인의 시설·작업·재료·유닛·고칠 장비·내 세력 비콘, 지을 수 있는 시설 목록, N50 규칙 값 */
  overview: signedInProcedure.query(({ ctx }) =>
    (ctx.facilities ?? notReady).overview(ctx.viewer, ctx.now()),
  ),
  /** 띄운 2차맵의 건물 겉모습(시설·레벨·상태·국가) — 2차맵 건물 모델 고르기용. 띄우지 않은 2차맵은 status "unknown_map" */
  mapLooks: signedInProcedure
    .input(z.strictObject({ mapKey: z.int().min(0).max(Number.MAX_SAFE_INTEGER) }))
    .query(({ ctx, input }) => (ctx.facilities ?? notReady).mapLooks(ctx.viewer, input.mapKey, ctx.now())),
  /**
   * 띄운 2차맵의 물 표(지형 칸마다 1비트, 16진수 — 질문 947 나): 짓기 폼의 물가 조건 미리 보기. 지형 파일(/api/maps/:mapKey/terrain)과 같은
   * 공개 범위(로그인한 누구나)다
   */
  /** 그 2차맵에 지을 수 있나(땅 규칙 — 건축 모드 미리 묻기, docs/adr/2026-11-14-second-map-build.md) */
  /** 사업장 장부(누구나 — 기획 D-555 1513, docs/adr/2026-11-15-business-ledger.md). days = 1·7·30(그 밖은 7) */
  books: signedInProcedure
    .input(
      z.strictObject({
        buildingId: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
        days: z.int().min(1).max(30),
      }),
    )
    .query(({ ctx, input }) =>
      (ctx.facilities ?? notReady).books(ctx.viewer, input.buildingId, input.days, ctx.now()),
    ),
  /** 건물 판 머리 이름표(주인·대주주 이름·몫, 누구나 — docs/adr/2026-11-15-building-screen.md) */
  owner: signedInProcedure
    .input(z.strictObject({ buildingId: z.int().min(1).max(Number.MAX_SAFE_INTEGER) }))
    .query(({ ctx, input }) => (ctx.facilities ?? notReady).owner(ctx.viewer, input.buildingId)),
  landRule: signedInProcedure
    .input(z.strictObject({ mapKey: z.int().min(0).max(Number.MAX_SAFE_INTEGER) }))
    .query(({ ctx, input }) => (ctx.facilities ?? notReady).landRule(ctx.viewer, input.mapKey)),
  waterMask: signedInProcedure
    .input(z.strictObject({ mapKey: z.int().min(0).max(Number.MAX_SAFE_INTEGER) }))
    .query(({ ctx, input }) => (ctx.facilities ?? notReady).waterMask(input.mapKey)),
});
