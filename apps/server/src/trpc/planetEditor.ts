// planetEditor 라우터 — 개발자 영역의 행성 편집기(ADR 2026-10-29-planet-editor-stage1 9·11절). dev·admin만.
// 권한: 조회는 planetEditor:read, 쓰기는 planetEditor:write(src/auth/permissions.ts). 두 겹으로 본다: 우리 권한 표(미들웨어)
// → Better Auth userHasPermission(services.ensurePermission). 그다음 사용자별 속도 제한(services.admit). 셋 다 입력 검사보다
// 먼저 돈다(로그인 안 함·권한 없음·너무 잦음이 형식 오류보다 먼저 나온다).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(권한 없음, 다른 사이트에서 보낸 요청은 data.reason
// "cross_origin"), TOO_MANY_REQUESTS(data.reason "rate_limited"), BAD_REQUEST(입력 형식, 또는 data.reason = 받지 않음 코드
// @terra/shared PLANET_DRAFT_REJECT_CODES·"unknown_planet"), CONFLICT(저장의 기대 판이 지금 판과 다름, data.reason
// "revision_conflict"), NOT_FOUND(되돌리기: data.reason "draft_not_found"·"revision_not_found"; 편집기를 켜지 않은 서버:
// message "PLANET_EDITOR_UNAVAILABLE"). 응답에는 시드가 들어 있다. tRPC 응답은 모두 cache-control: no-store다(src/trpc/plugin.ts).
import { PLANET_ID_PATTERN } from "@terra/protocol";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { PlanetEditorAction, PlanetEditorCallKind } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

/** PostgreSQL integer 상한(판 번호 열) */
const REVISION_MAX = 2_147_483_647;

const planetId = z.string().regex(PLANET_ID_PATTERN);
const planetInput = z.strictObject({ planetId });

/** 초안 기준(기기 DraftBase): 팩 버전 "<팩 ID>@<버전>"·정의 해시(64자)·생성기 판. 모르면 null */
const baseSchema = z
  .strictObject({
    contentVersion: z.string().regex(/^[a-z][a-z0-9_]{1,47}@[1-9][0-9]{0,8}$/),
    definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
    generatorVersion: z.int().min(0).max(0xffff_ffff),
  })
  .nullable();

const saveInput = z.strictObject({
  planetId,
  /** 모양은 서버가 받지 않음 코드 차례로 본다(그래서 여기서는 받기만 한다) */
  entry: z.unknown(),
  base: baseSchema,
  /** 이 기기가 마지막으로 본 판(0 = 서버에 초안 없음) */
  expectedRevision: z.int().min(0).max(REVISION_MAX),
});

const restoreInput = z.strictObject({ planetId, revision: z.int().min(1).max(REVISION_MAX) });

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한 → 편집기 서비스를 ctx.editor로 */
function editorProcedure(action: PlanetEditorAction, kind: PlanetEditorCallKind = "drafts") {
  return permissionProcedure({ planetEditor: [action] }).use(async ({ ctx, next }) => {
    const editor = ctx.planetEditor;
    // 인증은 켜졌는데 정의 조회 자료 없이 띄운 서버(시험 등)
    if (!editor) throw new TRPCError({ code: "NOT_FOUND", message: "PLANET_EDITOR_UNAVAILABLE" });
    await editor.ensurePermission(action);
    editor.admit(ctx.viewer, kind);
    return next({ ctx: { editor } });
  });
}

export const planetEditorRouter = router({
  /**
   * 팩 버전·임시 여부·서버 생성기 판, 행성마다 원본 항목·정의 해시·확인 해시, 바이옴 항목. 부를 때마다 감사 기록
   * (그래서 속도 제한을 따로 한 번 더 센다)
   */
  definitions: editorProcedure("read", "definitions").query(({ ctx }) => ctx.editor.definitions(ctx.viewer)),
  drafts: router({
    /** 내 초안(항목·기준·판·시각). 없으면 null */
    get: editorProcedure("read")
      .input(planetInput)
      .query(({ ctx, input }) => ctx.editor.getDraft(ctx.viewer, input.planetId)),
    /** 내 초안의 판 목록(새 판부터, 최근 50개): 판·시각·크기 */
    revisions: editorProcedure("read")
      .input(planetInput)
      .query(({ ctx, input }) => ctx.editor.revisions(ctx.viewer, input.planetId)),
    /**
     * 저장하고 새 판을 돌려준다. 기대 판 0이면 만든다(감사 기록). 기대 판이 지금 판과 다르면 CONFLICT.
     * 판 번호는 커지기만 하고 띄엄띄엄이다(+1을 기대하지 않는다)
     */
    save: editorProcedure("write")
      .input(saveInput)
      .mutation(({ ctx, input }) => ctx.editor.save(ctx.viewer, input)),
    /** 판 하나를 초안으로 되돌린다(새 판이 된다, 감사 기록) */
    restore: editorProcedure("write")
      .input(restoreInput)
      .mutation(({ ctx, input }) => ctx.editor.restore(ctx.viewer, input)),
    /** 초안과 판 기록을 지운다(감사 기록). 없었으면 removed false. 팩에 없는 행성 ID도 받는다(팩에서 빠진 행성) */
    remove: editorProcedure("write")
      .input(planetInput)
      .mutation(({ ctx, input }) => ctx.editor.remove(ctx.viewer, input.planetId)),
  }),
});
