// items 라우터 — 아이템 편집기(/dev/items, docs/adr/2026-11-01-item-editor.md 3·4절). dev·admin만.
// 권한·속도 제한은 설정 칸 패널(D1)·스킬 편집기와 같다: 우리 권한 표(tuning:read·write) → Better Auth 확인 → 사용자별 속도 제한. 셋 다
// 입력 검사보다 먼저. 쓰기는 게임 상태가 아니라 그 세계의 팩 항목 실효 값(덮어쓰기)을 바꾼다: 서버가 팩 검사기로 본 뒤에만 받고 감사
// 기록을 남긴다. 저장은 스킬 편집기와 같은 덮어쓰기 층·판·차례다.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"), BAD_REQUEST(입력 형식, 또는 data.reason =
// ITEM_EDITOR_REASONS — invalid_entry(+ data.details)·unknown_entry·retired_id·duplicate_entry·invalid_note·entry_changed(data.details
// = 키)·category_locked·entry_too_large·created_limit. 하나라도 틀리면 묶음 전체를 받지 않는다), CONFLICT("revision_conflict"),
// NOT_FOUND(message "ITEM_EDITOR_UNAVAILABLE": 인증이나 팩이 없는 서버).
import { ITEM_BULK_LIMITS, ITEM_EDIT_CATEGORIES, ITEM_LIMITS } from "@terra/shared/itemEditor";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TuningAction } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const contentId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const revision = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const category = z.enum(ITEM_EDIT_CATEGORIES);
/** 고치기 시작할 때의 실효 항목 해시(새 항목 null) */
const baseHash = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .nullable();

/** 항목은 모양만 크게 보고(객체, ID) 칸마다의 규칙은 서버가 팩 스키마로 본다(팩 검사기 하나) */
const entry = z.custom<Readonly<Record<string, unknown>>>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

/** 여러 개 고치기(WP-7): 칸 범위는 팩 스키마와 같다(서버가 얹은 항목을 팩 검사기로 다시 본다) */
const patch = z.strictObject({
  enabled: z.boolean().optional(),
  tier: z.int().min(ITEM_LIMITS.tier.min).max(ITEM_LIMITS.tier.max).optional(),
  subcategory: contentId.nullable().optional(),
  tagsAdd: z.array(contentId).max(ITEM_LIMITS.tags).readonly().optional(),
  tagsRemove: z.array(contentId).max(ITEM_LIMITS.tags).readonly().optional(),
  baseValuePm: z.int().min(ITEM_BULK_LIMITS.baseValuePm.min).max(ITEM_BULK_LIMITS.baseValuePm.max).optional(),
});

const change = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("put"), category, entry, baseHash }),
  z.strictObject({ op: z.literal("revert"), category, id: contentId, baseHash }),
  z.strictObject({ op: z.literal("discard_sleeping"), category, id: contentId }),
  z.strictObject({
    op: z.literal("patch"),
    category: z.literal("items"),
    ids: z.array(contentId).min(1).max(ITEM_BULK_LIMITS.patchIdsMax).readonly(),
    patch,
  }),
]);
const changes = z.array(change).min(1).max(ITEM_LIMITS.changesMax);

/** 미리 보기 기준 유닛의 1차(ITEM_PRIMARY_CODES 이름, 판정 입력 범위) */
const stat = z.int().min(0).max(10_000_000);
const unit = z.strictObject({
  kind: contentId,
  level: z.int().min(1).max(999),
  primaries: z.strictObject({ str: stat, dex: stat, agi: stat, vit: stat, int: stat, wis: stat }),
});

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한(설정 칸 패널과 같은 제한기) → ctx.items */
function itemsProcedure(action: TuningAction) {
  return permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const { tuning, items } = ctx;
    if (!tuning || !items) throw new TRPCError({ code: "NOT_FOUND", message: "ITEM_EDITOR_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { items } });
  });
}

const read = itemsProcedure("read");
const write = itemsProcedure("write");

export const itemsRouter = router({
  /** 목록(요약)·분류 자료·고르기 창 자료·은퇴 ID·잠든 줄·판 */
  list: read.query(({ ctx }) => ctx.items.list()),
  /** 항목 하나 통째·팩 항목·덮어쓰기·쓰는 곳·권고 */
  get: read.input(z.strictObject({ id: contentId })).query(({ ctx, input }) => ctx.items.get(input.id)),
  /** 실효 아이템 통째(대량 도구 JSON·CSV 내보내기와 가져오기 차이, WP-7) */
  export: read.query(({ ctx }) => ctx.items.exportEntries()),
  /** 묶음 검사(저장하지 않음): 코드가 붙은 문제·권고·끄면 멈추는 것 */
  check: read.input(z.strictObject({ changes })).query(({ ctx, input }) => ctx.items.check(input.changes)),
  /** 저장 전 초안 미리 보기(기준 유닛·실효 계산식) */
  preview: read
    .input(z.strictObject({ entry, unit: unit.optional() }))
    .query(({ ctx, input }) => ctx.items.preview(input.entry, input.unit)),
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
    .mutation(({ ctx, input }) => ctx.items.save(ctx.viewer, input)),
  /** 최근 바꿈(요약, id를 주면 그 아이템이 든 줄만) */
  history: read
    .input(z.strictObject({ id: contentId.optional() }).optional())
    .query(({ ctx, input }) => ctx.items.history(input?.id)),
  /** 감사 기록 한 줄 때의 그 항목(되돌리기·다시 담기) */
  historyEntry: read
    .input(z.strictObject({ auditId: z.int().min(1).max(Number.MAX_SAFE_INTEGER), category, id: contentId }))
    .query(({ ctx, input }) => ctx.items.historyEntry(input.auditId, input.category, input.id)),
});
