// nations 라우터 — 시작 국가 설정 편집기(/dev/nations, docs/adr/2026-11-10-nation-editor.md). dev·admin만.
// 권한·속도 제한은 설정 칸 패널(D1)·스킬·아이템·건물·크리처 편집기와 같다: 우리 권한 표(tuning:read·write) → Better Auth 확인 → 사용자별
// 속도 제한. 셋 다 입력 검사보다 먼저. 쓰기는 게임 상태가 아니라 그 세계의 팩 국가 프리셋 실효 값(덮어쓰기)을 바꾼다: 서버가 팩 검사기로 본
// 뒤에만 받고 감사 기록을 남긴다. 마크 올리기는 JSON(base64)으로 받는다(tRPC 길은 multipart를 받지 않는다, AGENTS.md 6장).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"), BAD_REQUEST(입력 형식, 또는 data.reason =
// NATION_EDITOR_REASONS), CONFLICT("revision_conflict"), NOT_FOUND(message "NATION_EDITOR_UNAVAILABLE": 인증이나 팩이 없는 서버).
import { NATION_EMBLEM_UPLOAD, NATION_LIST_LIMITS, type NationPresetJson } from "@terra/shared/nationEditor";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TuningAction } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const contentId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const revision = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
/** 고치기 시작할 때의 실효 항목 해시 */
const baseHash = z.string().regex(/^[0-9a-f]{64}$/);

/** 국가 프리셋 항목은 모양만 크게 보고(객체, ID) 칸마다의 규칙은 서버가 팩 스키마로 본다(팩 검사기 하나) */
const entry = z.custom<NationPresetJson>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

const change = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("put"), entry, baseHash }),
  z.strictObject({ op: z.literal("revert"), id: contentId, baseHash }),
  z.strictObject({ op: z.literal("discard_sleeping"), id: contentId }),
]);
const changes = z.array(change).min(1).max(NATION_LIST_LIMITS.changesMax);

/** base64 글 길이 상한: 바이트 상한의 4/3 올림 + 여유(서버가 풀어서 바이트를 다시 본다) */
const BASE64_MAX = Math.ceil(NATION_EMBLEM_UPLOAD.maxBytes / 3) * 4 + 4;

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한(설정 칸 패널과 같은 제한기) → ctx.nations */
function nationsProcedure(action: TuningAction) {
  return permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const { tuning, nations } = ctx;
    if (!tuning || !nations) throw new TRPCError({ code: "NOT_FOUND", message: "NATION_EDITOR_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { nations } });
  });
}

const read = nationsProcedure("read");
const write = nationsProcedure("write");

export const nationsRouter = router({
  /** 국가 프리셋(실효·팩·덮어쓰기·올린 마크)·세계 씨앗 기본값·고르기 창·잠든 줄·판 */
  list: read.query(({ ctx }) => ctx.nations.list()),
  /** 묶음 검사(저장하지 않음): 코드가 붙은 문제(오류) 또는 권고 */
  check: read.input(z.strictObject({ changes })).query(({ ctx, input }) => ctx.nations.check(input.changes)),
  /** 묶음 적용(baseHash). 바뀐 목록을 돌려준다 */
  save: write
    .input(
      z.strictObject({
        expectedRevision: revision,
        changes,
        /** 메모는 서버가 정리·검사한다(@terra/shared normalizeTuningNote). 여기서는 길이만 크게 막는다 */
        note: z.string().max(2_000).nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.nations.save(ctx.viewer, input)),
  /** 최근 바꿈(감사 기록 요약, 국가 프리셋 줄이 든 것) */
  history: read.query(({ ctx }) => ctx.nations.history()),
  /** 국가 마크 올리기: 256 × 256 PNG(base64). 서버가 서명·크기·바이트를 본다 */
  uploadEmblem: write
    .input(z.strictObject({ id: contentId, pngBase64: z.string().min(1).max(BASE64_MAX) }))
    .mutation(({ ctx, input }) => ctx.nations.uploadEmblem(ctx.viewer, input)),
  /** 올린 마크 지우기(만든 마크로 되돌린다) */
  removeEmblem: write
    .input(z.strictObject({ id: contentId }))
    .mutation(({ ctx, input }) => ctx.nations.removeEmblem(ctx.viewer, input)),
  /** 이 세계의 NPC 국가에 반영(세력 정체성·화폐 표시). dryRun이면 계획만 돌려준다 */
  applyToWorld: write
    .input(z.strictObject({ dryRun: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.nations.applyToWorld(ctx.viewer, input)),
});
