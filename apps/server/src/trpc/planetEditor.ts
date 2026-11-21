// planetEditor 라우터 — 개발자 영역의 행성 편집기(ADR 2026-10-29-planet-editor-stage1 9·11절). dev·admin만.
// 권한: 조회는 planetEditor:read, 쓰기는 planetEditor:write(src/auth/permissions.ts). 두 겹으로 본다: 우리 권한 표(미들웨어)
// → Better Auth userHasPermission(services.ensurePermission). 그다음 사용자별 속도 제한(services.admit). 셋 다 입력 검사보다
// 먼저 돈다(로그인 안 함·권한 없음·너무 잦음이 형식 오류보다 먼저 나온다).
// 오류(error.data.code): UNAUTHORIZED(로그인 안 함·정지), FORBIDDEN(권한 없음, 다른 사이트에서 보낸 요청은 data.reason
// "cross_origin"), TOO_MANY_REQUESTS(data.reason "rate_limited"), BAD_REQUEST(입력 형식, 또는 data.reason = 받지 않음 코드
// @terra/shared PLANET_DRAFT_REJECT_CODES·"unknown_planet"), CONFLICT(저장의 기대 판이 지금 판과 다름, data.reason
// "revision_conflict"), NOT_FOUND(되돌리기: data.reason "draft_not_found"·"revision_not_found"; 편집기를 켜지 않은 서버:
// message "PLANET_EDITOR_UNAVAILABLE"). 응답에는 시드가 들어 있다. tRPC 응답은 모두 cache-control: no-store다(src/trpc/plugin.ts).
import { MAP_PRESETS } from "@terra/planet/secondMap";
import { PLANET_ID_PATTERN } from "@terra/protocol";
import { PLANET_LIBRARY_BASE_KINDS } from "@terra/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SecondMapLabInputError, SecondMapLabNotReadyError } from "../world/secondMapLab.ts";
import type { PlanetEditorAction, PlanetEditorCallKind } from "./context.ts";
import { permissionProcedure, reasonedError, router } from "./init.ts";

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

/** 개발자 2차맵 시험: 보고 싶은 2차맵(월드 시험 2차맵·키·시험 자리 종류·바이옴 대표 칸) */
const labTarget = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("test") }),
  z.strictObject({ kind: z.literal("key"), mapKey: z.int().min(0).max(Number.MAX_SAFE_INTEGER) }),
  z.strictObject({ kind: z.literal("preset"), preset: z.enum(MAP_PRESETS) }),
  z.strictObject({
    kind: z.literal("biome"),
    biomeId: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    variant: z.int().min(0).max(63).optional(),
  }),
]);

// ── 행성 보관함 입력(이름·정의는 서버가 이유 코드 차례로 본다: 여기서는 받기만 한다) ──
const libraryId = z.uuid();
const libraryIdInput = z.strictObject({ id: libraryId });
/** 시작점: 팩 행성·행성 표본(@terra/shared PLANET_LIBRARY_BASE_KINDS) */
const libraryBase = z.strictObject({ kind: z.enum(PLANET_LIBRARY_BASE_KINDS), id: planetId });
const libraryCreateInput = z.strictObject({ name: z.unknown(), base: libraryBase, definition: z.unknown() });
const librarySaveInput = z.strictObject({
  id: libraryId,
  definition: z.unknown(),
  /** 이 기기의 작업 사본이 시작한 판. 지금 판과 다르면 CONFLICT */
  expectedRevision: z.int().min(1).max(REVISION_MAX),
});
const libraryRenameInput = z.strictObject({ id: libraryId, name: z.unknown() });
const libraryVersionInput = z.strictObject({ id: libraryId, revision: z.int().min(1).max(REVISION_MAX) });

// ── 항성계 보관함 입력(이름·정의는 서버가 이유 코드로 본다: 여기서는 받기만 한다) ──
const systemCreateInput = z.strictObject({ name: z.unknown(), definition: z.unknown() });
const systemSaveInput = z.strictObject({
  id: libraryId,
  definition: z.unknown(),
  /** 이 기기가 연 판. 지금 판과 다르면 CONFLICT */
  expectedRevision: z.int().min(1).max(REVISION_MAX),
});

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

/** 보관함 프로시저: 권한·속도 제한 뒤 ctx.editor.library */
const libraryRead = editorProcedure("read", "library");
const libraryWrite = editorProcedure("write", "library");

export const planetEditorRouter = router({
  /**
   * 행성 보관함 — 팀 공용 목록(dev·admin 모두 같은 목록, 만든 사람 표시). [저장]·[다른 이름으로 저장]만 쓴다.
   * 저장은 서버가 굽지 않는다(정의만 보관). ID(uuid)는 바뀌지 않는다
   */
  library: router({
    /** 목록(지운 것 빼고, 최근에 바뀐 것부터). 정의는 싣지 않는다 */
    list: libraryRead.query(({ ctx }) => ctx.editor.library.list(ctx.viewer)),
    /** 행성 하나(정의 포함) */
    get: libraryRead
      .input(libraryIdInput)
      .query(({ ctx, input }) => ctx.editor.library.get(ctx.viewer, input.id)),
    /** 저장 판 목록(새 판부터) */
    versions: libraryRead
      .input(libraryIdInput)
      .query(({ ctx, input }) => ctx.editor.library.versions(ctx.viewer, input.id)),
    /** 저장 판 하나(정의 포함) — 기기가 작업 사본으로 불러온다(불러오기만으로는 저장하지 않는다) */
    version: libraryRead
      .input(libraryVersionInput)
      .query(({ ctx, input }) => ctx.editor.library.version(ctx.viewer, input)),
    /** 새 행성(판 1). [새 행성]의 첫 [저장]과 [다른 이름으로 저장] */
    create: libraryWrite
      .input(libraryCreateInput)
      .mutation(({ ctx, input }) => ctx.editor.library.create(ctx.viewer, input)),
    /** [저장]: 판 +1. 기대 판이 지금 판과 다르면 CONFLICT */
    save: libraryWrite
      .input(librarySaveInput)
      .mutation(({ ctx, input }) => ctx.editor.library.save(ctx.viewer, input)),
    /** 이름 바꾸기(판 그대로) */
    rename: libraryWrite
      .input(libraryRenameInput)
      .mutation(({ ctx, input }) => ctx.editor.library.rename(ctx.viewer, input)),
    /** 지우기(표시만, 만든 사람·admin) */
    remove: libraryWrite
      .input(libraryIdInput)
      .mutation(({ ctx, input }) => ctx.editor.library.remove(ctx.viewer, input.id)),
  }),
  /**
   * 항성계 보관함 — 개발자 항성계 편집기(ADR 2026-10-31-star-system-editor). 행성 보관함과 같은 규칙(팀 공용, [저장]만,
   * 판 충돌, 지우기는 만든 사람·admin). 게임 실행에는 쓰지 않는다. 속도 제한은 보관함과 같이 센다
   */
  systems: router({
    list: libraryRead.query(({ ctx }) => ctx.editor.systems.list(ctx.viewer)),
    get: libraryRead
      .input(libraryIdInput)
      .query(({ ctx, input }) => ctx.editor.systems.get(ctx.viewer, input.id)),
    create: libraryWrite
      .input(systemCreateInput)
      .mutation(({ ctx, input }) => ctx.editor.systems.create(ctx.viewer, input)),
    save: libraryWrite
      .input(systemSaveInput)
      .mutation(({ ctx, input }) => ctx.editor.systems.save(ctx.viewer, input)),
    rename: libraryWrite
      .input(libraryRenameInput)
      .mutation(({ ctx, input }) => ctx.editor.systems.rename(ctx.viewer, input)),
    remove: libraryWrite
      .input(libraryIdInput)
      .mutation(({ ctx, input }) => ctx.editor.systems.remove(ctx.viewer, input.id)),
  }),
  /**
   * 팩 버전·임시 여부·서버 생성기 판, 행성마다 원본 항목·정의 해시·확인 해시, 바이옴 항목. 부를 때마다 감사 기록
   * (그래서 속도 제한을 따로 한 번 더 센다)
   */
  definitions: editorProcedure("read", "definitions").query(({ ctx }) => ctx.editor.definitions(ctx.viewer)),
  /**
   * 개발자 2차맵 시험(/dev/second-map): 월드 행성이면 2차맵 지형 주소와 그 칸의 행성 값(server), 아니면 device(기기가 만든다),
   * 맞는 시험 자리가 없으면 none. 보기 전용이라 감사 기록이 없다(지형 파일은 숨김 정보가 아니다, ADR 26).
   * 틀린 키는 BAD_REQUEST(data.reason "bad_map_key"), 지형 서비스 준비 전은 PRECONDITION_FAILED
   */
  secondMap: editorProcedure("read")
    .input(z.strictObject({ planetId, target: labTarget }))
    .query(async ({ ctx, input }) => {
      const lab = ctx.secondMapLab;
      if (!lab) throw new TRPCError({ code: "NOT_FOUND", message: "SECOND_MAP_LAB_UNAVAILABLE" });
      try {
        return await lab.locate(input.planetId, input.target);
      } catch (error) {
        if (error instanceof SecondMapLabInputError)
          throw reasonedError("BAD_REQUEST", error.message, "bad_map_key");
        if (error instanceof SecondMapLabNotReadyError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SECOND_MAP_LAB_NOT_READY" });
        }
        throw error;
      }
    }),
  /**
   * 지형 오브젝트 비율 실시간 미리 보기(POST JSON 본문): 편집 중인 map_props 배열로 월드 행성 2차맵을 즉석 생성한다.
   * 게임 상태·지형 캐시를 건드리지 않는 보기 전용이다. 월드 행성이 아니면 { kind: "device" }
   */
  secondMapPreview: editorProcedure("read")
    .input(
      z.strictObject({
        planetId,
        target: labTarget,
        mapProps: z.array(z.unknown()).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const lab = ctx.secondMapLab;
      if (!lab) throw new TRPCError({ code: "NOT_FOUND", message: "SECOND_MAP_LAB_UNAVAILABLE" });
      try {
        return await lab.preview(input.planetId, input.target, input.mapProps);
      } catch (error) {
        if (error instanceof SecondMapLabInputError)
          throw reasonedError("BAD_REQUEST", error.message, "bad_map_key");
        if (error instanceof SecondMapLabNotReadyError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "SECOND_MAP_LAB_NOT_READY" });
        }
        throw error;
      }
    }),
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
