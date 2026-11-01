// skills 라우터 — 스킬 편집기·행동별 소모 화면(/dev/skills, docs/adr/2026-11-01-skill-editor.md 6절). dev·admin만.
// 권한·속도 제한은 설정 칸 패널(D1)과 같다: 우리 권한 표(tuning:read·write) → Better Auth 확인 → 사용자별 속도 제한. 셋 다 입력 검사보다 먼저.
// 쓰기는 게임 상태가 아니라 그 세계의 팩 항목 실효 값(덮어쓰기)을 바꾼다: 서버가 팩 검사기로 본 뒤에만 받고 감사 기록을 남긴다.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"), BAD_REQUEST(입력 형식, 또는 data.reason =
// invalid_entry(+ data.details 팩 검사 문제)·unknown_entry·retired_id·duplicate_entry·invalid_note·entry_changed(data.details = 키) —
// 하나라도 틀리면 묶음 전체를 받지 않는다), CONFLICT("revision_conflict": baseHash 없이 판이 다름), NOT_FOUND(message
// "SKILL_EDITOR_UNAVAILABLE": 인증이나 팩이 없는 서버).
import {
  ACTION_COST_MAX,
  SKILL_EDITOR_CATEGORIES,
  SKILL_EDITOR_CHANGES_MAX,
  type SkillJson,
} from "@terra/shared/skillEditor";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TuningAction } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const contentId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const revision = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
const cost = z.int().min(0).max(ACTION_COST_MAX);

/** 스킬 항목은 모양만 크게 보고(객체, ID) 칸마다의 규칙은 서버가 팩 스키마로 본다(팩 검사기 하나) */
const skillEntry = z.custom<SkillJson>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, "id") === "string" &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

/** 고치기 시작할 때의 실효 항목 해시(새 항목 null, 옛 기기는 없음) — 같은 항목을 누가 먼저 고쳤을 때만 충돌(entry_changed) */
const baseHash = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .nullable()
  .optional();

const change = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("put_skill"), entry: skillEntry, baseHash }),
  z.strictObject({
    op: z.literal("revert"),
    category: z.enum(SKILL_EDITOR_CATEGORIES),
    id: contentId,
    baseHash,
  }),
  z.strictObject({
    op: z.literal("set_cost"),
    category: z.enum(["items", "unit_kinds"]),
    id: contentId,
    staminaCost: cost,
    mpCost: cost,
  }),
]);

const saveInput = z.strictObject({
  expectedRevision: revision,
  changes: z.array(change).min(1).max(SKILL_EDITOR_CHANGES_MAX),
  /** 메모는 서버가 정리·검사한다(@terra/shared normalizeTuningNote). 여기서는 길이만 크게 막는다 */
  note: z.string().max(2_000).nullable().optional(),
});

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한(설정 칸 패널과 같은 제한기) → ctx.skills */
function skillsProcedure(action: TuningAction) {
  return permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const { tuning, skills } = ctx;
    if (!tuning || !skills) throw new TRPCError({ code: "NOT_FOUND", message: "SKILL_EDITOR_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { skills } });
  });
}

const read = skillsProcedure("read");
const write = skillsProcedure("write");

export const skillsRouter = router({
  /** 스킬(실효·팩·덮어쓰기), 효과 사전, 행동별 소모 표, 판 */
  list: read.query(({ ctx }) => ctx.skills.list()),
  /** 최근 바꿈(감사 기록 30줄) */
  history: read.query(({ ctx }) => ctx.skills.history()),
  /** 묶음 적용: 스킬 통째(만들기·복제·고치기·끄기)·되돌리기·무기 소모. 바뀐 목록을 돌려준다 */
  save: write.input(saveInput).mutation(({ ctx, input }) => ctx.skills.save(ctx.viewer, input)),
});
