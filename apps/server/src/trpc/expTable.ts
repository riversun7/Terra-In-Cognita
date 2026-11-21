// expTable 라우터 — 유닛 공통 경험치 테이블 편집기(/dev/exp-table). dev·admin만.
// 권한·속도 제한은 다른 편집기와 같다: 우리 권한 표(tuning:read·write) → Better Auth 확인 → 사용자별 속도 제한.
// 쓰기는 게임 상태가 아니라 그 세계의 팩 경험치 표 실효 값(덮어쓰기)을 바꾼다: 서버가 팩 검사기로 본 뒤에만 받고 감사 기록을 남긴다.
import { EXP_TABLE_LIMITS, type ExpTableEntryJson } from "@terra/shared/expTable";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TuningAction } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const contentId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const revision = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
/** 고치기 시작할 때의 실효 항목 해시(새 항목은 null) */
const baseHash = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .nullable();

const entry: z.ZodType<ExpTableEntryJson> = z.strictObject({
  id: contentId,
  level: z.int().min(EXP_TABLE_LIMITS.levelMin).max(EXP_TABLE_LIMITS.levelMax),
  requiredExp: z.int().min(EXP_TABLE_LIMITS.requiredExpMin).max(EXP_TABLE_LIMITS.requiredExpMax),
});

const change = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("put"), entry, baseHash }),
  z.strictObject({
    op: z.literal("revert"),
    id: contentId,
    baseHash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.strictObject({ op: z.literal("discard_sleeping"), id: contentId }),
]);
const changes = z.array(change).min(1).max(EXP_TABLE_LIMITS.changesMax);

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한(설정 칸 패널과 같은 제한기) → ctx.expTable */
function expTableProcedure(action: TuningAction) {
  return permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const { tuning, expTable } = ctx;
    if (!tuning || !expTable)
      throw new TRPCError({ code: "NOT_FOUND", message: "EXP_TABLE_EDITOR_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { expTable } });
  });
}

const read = expTableProcedure("read");
const write = expTableProcedure("write");

export const expTableRouter = router({
  /** 경험치 표(실효·팩·덮어쓰기)·기본 만렙·수명 범위·은퇴 ID·잠든 줄·판 */
  list: read.query(({ ctx }) => ctx.expTable.list()),
  /** 묶음 검사(저장하지 않음): 오류 또는 권고 */
  check: read.input(z.strictObject({ changes })).query(({ ctx, input }) => ctx.expTable.check(input.changes)),
  /** 묶음 적용(baseHash). 바뀐 목록을 돌려준다 */
  save: write
    .input(
      z.strictObject({
        expectedRevision: revision,
        changes,
        note: z.string().max(2_000).nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.expTable.save(ctx.viewer, input)),
  /** 최근 바꿈(감사 기록 요약, exp_table 줄이 든 것) */
  history: read.query(({ ctx }) => ctx.expTable.history()),
});
