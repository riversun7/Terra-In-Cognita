// tuning 라우터 — 개발자 설정 칸 패널(/dev/tuning, docs/adr/2026-11-01-dev-settings-panel.md 8절). dev·admin만.
// 권한: 조회 tuning:read, 쓰기 tuning:write(src/auth/permissions.ts). 두 겹으로 본다: 우리 권한 표(미들웨어) → Better Auth
// userHasPermission(services.ensurePermission). 그다음 사용자별 속도 제한(services.admit). 셋 다 입력 검사보다 먼저 돈다.
// 쓰기는 게임 상태가 아니라 그 세계의 설정 칸 실효 값(덮어쓰기)을 바꾼다: 서버가 범위·규칙을 본 뒤에만 받고 감사 기록을 남긴다.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN(권한 없음, "cross_origin"), TOO_MANY_REQUESTS("rate_limited"),
// BAD_REQUEST(입력 형식, 또는 data.reason = unknown_entry·out_of_range·rules_conflict(+ data.details 문제 코드)·
// structural_unconfirmed·invalid_note·duplicate_entry — 하나라도 틀리면 묶음 전체를 받지 않는다),
// CONFLICT("revision_conflict": 세계 설정 판이 바뀜), NOT_FOUND(message "TUNING_UNAVAILABLE": 인증이나 팩 설정 칸이 없는 서버).
import { TUNING_APPLY_MAX, TUNING_VALUE_LIMIT } from "@terra/shared/tuning";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TuningAction } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const tuningId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const tuningValue = z.int().min(-TUNING_VALUE_LIMIT).max(TUNING_VALUE_LIMIT);

/** 세계 설정 판(DB int8, 안전한 정수) */
const revision = z.int().min(0).max(Number.MAX_SAFE_INTEGER);

const applyInput = z.strictObject({
  expectedRevision: revision,
  changes: z
    .array(z.strictObject({ id: tuningId, value: tuningValue.nullable() }))
    .min(1)
    .max(TUNING_APPLY_MAX),
  /** 메모는 서버가 정리·검사한다(@terra/shared normalizeTuningNote). 여기서는 길이만 크게 막는다 */
  note: z.string().max(2_000).nullable().optional(),
  confirmStructural: z.boolean().optional(),
});
const revertAllInput = z.strictObject({ expectedRevision: revision });

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한 → ctx.tuning */
function tuningProcedure(action: TuningAction) {
  return permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const tuning = ctx.tuning;
    if (!tuning) throw new TRPCError({ code: "NOT_FOUND", message: "TUNING_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { tuning } });
  });
}

const read = tuningProcedure("read");
const write = tuningProcedure("write");

export const tuningRouter = router({
  /** 칸 목록: 팩 판·세계 설정 판, 칸마다 팩 값·실효 값·범위 칩·덮어쓰기 */
  list: read.query(({ ctx }) => ctx.tuning.list(ctx.viewer)),
  /** 최근 바꿈(감사 기록 30줄) */
  history: read.query(({ ctx }) => ctx.tuning.history(ctx.viewer)),
  /** 내보내기 차이(terra-tuning-diff) — `pnpm tuning:apply`·시뮬레이터 `--tuning`이 받는다 */
  export: read.query(({ ctx }) => ctx.tuning.exportDiff(ctx.viewer)),
  /**
   * 묶음 적용: 칸 여러 개를 한 번에 검사·저장·반영(null·팩 값 = 되돌리기). 바뀐 목록을 돌려준다.
   * 이름이 apply가 아닌 까닭: tRPC 라우터는 함수 속성 이름(apply·call 등)을 쓰지 못한다
   */
  save: write.input(applyInput).mutation(({ ctx, input }) => ctx.tuning.save(ctx.viewer, input)),
  /** 덮어쓰기를 모두 지운다 */
  revertAll: write
    .input(revertAllInput)
    .mutation(({ ctx, input }) => ctx.tuning.revertAll(ctx.viewer, input)),
});
