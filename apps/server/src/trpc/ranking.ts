// ranking 라우터 — 랭킹 조회(docs/adr/2026-11-07-ranking.md). 응답 타입은 @terra/shared/ranking이다. 집계는 서버 일정이 한다(서버 권위).
// 화면 메뉴는 따로 없다(D-6010: 사이보그·세력 화면 안). 시안 자료(preview)는 권한 home: preview(dev·admin)가 있어야 한다(홈과 같은 스위치).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(시안 자료를 권한 없이 요청), BAD_REQUEST(입력 형식)
import { ID_PATTERN } from "@terra/content";
import { z } from "zod";
import { createRankingServices } from "../ranking/services.ts";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

const boardInput = z.strictObject({
  board: z.discriminatedUnion("kind", [
    // 경로를 비우면(null) 서버가 고른다(내 점수가 가장 높은 경로 → 연 경로의 첫째)
    z.strictObject({ kind: z.literal("path"), path: z.string().regex(ID_PATTERN).nullable() }),
    z.strictObject({ kind: z.literal("faction") }),
    // 가문 판(D-569 1746): 경로 하나의 가문원 점수 합
    z.strictObject({ kind: z.literal("house"), path: z.string().regex(ID_PATTERN).nullable() }),
  ]),
  preview: previewField,
});

const mineInput = z.strictObject({ preview: previewField }).optional();

/** 맥락에 랭킹 서비스가 없을 때(시험 맥락): 빈 판 */
const EMPTY_RANKING = createRankingServices({ paths: [] });

export const rankingRouter = router({
  /** 판 하나: 위 50줄 + 내 줄 + 등급 문턱 점수 + 경로 목록 */
  board: signedInProcedure.input(boardInput).query(({ ctx, input }) =>
    (ctx.ranking ?? EMPTY_RANKING).board(ctx.viewer, input.board, {
      preview: previewRequested(ctx.viewer, input.preview),
      now: ctx.now(),
    }),
  ),
  /** 내 자리: 경로마다(점수 있는 것) + 내 세력 + 명성 칸 */
  mine: signedInProcedure.input(mineInput).query(({ ctx, input }) =>
    (ctx.ranking ?? EMPTY_RANKING).mine(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
});
