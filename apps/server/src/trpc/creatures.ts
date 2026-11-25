// creatures 라우터 — 크리처 편집기(/dev/creatures). dev·admin만.
// 권한·속도 제한은 설정 칸 패널(D1)·스킬·아이템·건물 편집기와 같다: 우리 권한 표(tuning:read·write) → Better Auth 확인 → 사용자별 속도 제한.
// 쓰기는 게임 상태가 아니라 그 세계의 팩 크리처 실효 값(덮어쓰기)을 바꾼다: 서버가 팩 검사기로 본 뒤에만 받고 감사 기록을 남긴다.
import { CREATURE_LIMITS, type CreatureClassJson, type CreatureJson } from "@terra/shared/creatureEditor";
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

/** 크리처 항목은 모양만 크게 보고(객체, ID) 칸마다의 규칙은 서버가 팩 스키마로 본다(팩 검사기 하나) */
const entry = z.custom<CreatureJson>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

/** 분류 항목도 모양만 본다(칸 규칙·트리 깊이는 팩 검사기) */
const classEntry = z.custom<CreatureClassJson>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

const change = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("put_class"), entry: classEntry, baseHash }),
  z.strictObject({
    op: z.literal("revert_class"),
    id: contentId,
    baseHash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.strictObject({ op: z.literal("put"), entry, baseHash }),
  z.strictObject({
    op: z.literal("revert"),
    id: contentId,
    baseHash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.strictObject({ op: z.literal("discard_sleeping"), id: contentId }),
]);
const changes = z.array(change).min(1).max(CREATURE_LIMITS.changesMax);

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한(설정 칸 패널과 같은 제한기) → ctx.creatures */
function creaturesProcedure(action: TuningAction) {
  return permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const { tuning, creatures } = ctx;
    if (!tuning || !creatures)
      throw new TRPCError({ code: "NOT_FOUND", message: "CREATURE_EDITOR_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { creatures } });
  });
}

const read = creaturesProcedure("read");
const write = creaturesProcedure("write");

export const creaturesRouter = router({
  /** 크리처(실효·팩·덮어쓰기)·고르기 창(아이템·스킬·유닛 종류·이미지)·은퇴 ID·잠든 줄·판 */
  list: read.query(({ ctx }) => ctx.creatures.list()),
  /** 묶음 검사(저장하지 않음): 코드가 붙은 문제(오류) 또는 권고 */
  check: read
    .input(z.strictObject({ changes }))
    .query(({ ctx, input }) => ctx.creatures.check(input.changes)),
  /** 묶음 적용(baseHash). 바뀐 목록을 돌려준다 */
  save: write
    .input(
      z.strictObject({
        expectedRevision: revision,
        changes,
        note: z.string().max(2_000).nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.creatures.save(ctx.viewer, input)),
  /** 최근 바꿈(감사 기록 요약, 크리처 줄이 든 것) */
  history: read.query(({ ctx }) => ctx.creatures.history()),
});
