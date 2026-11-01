// formulas 라우터 — 개발자 밸런스 화면의 계산식 탭(docs/adr/2026-11-01-formula-editor.md). dev·admin만.
// 권한·속도 제한은 설정 칸 패널(D1)과 같다: 우리 권한 표(tuning:read) → Better Auth 확인 → 사용자별 조회 속도 제한. 셋 다 입력 검사보다 먼저.
// 조회만 있다. 식을 세계에 넣는 것은 tuning.save의 formulas(같은 묶음 검사·판·감사 기록).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"),
// NOT_FOUND(message "FORMULAS_UNAVAILABLE": 인증이나 팩 설정 칸이 없는 서버).
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./init.ts";

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 조회 속도 제한(D1과 같은 제한기) → ctx.formulas */
const read = permissionProcedure({ tuning: ["read"] }).use(async ({ ctx, next }) => {
  const { tuning, formulas } = ctx;
  if (!tuning || !formulas) throw new TRPCError({ code: "NOT_FOUND", message: "FORMULAS_UNAVAILABLE" });
  await tuning.ensurePermission("read");
  tuning.admit(ctx.viewer, "read");
  return next({ ctx: { formulas } });
});

export const formulasRouter = router({
  /** 식 칸(팩 식·실효 식·덮어쓰기), 무기(맨손 포함), 식 변수에 드는 설정 칸 값, 표본 유닛, 세계 설정 판 */
  list: read.query(({ ctx }) => ctx.formulas.list()),
});
