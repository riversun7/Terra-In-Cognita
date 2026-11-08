// balanceAnalysis 라우터 — 밸런스 분석(/dev/balance [분포 상성]·[스탯 영향도] 탭, docs/adr/2026-11-01-balance-screen.md
// "바뀜 (2026-11-08 완전 개편)"). dev·admin만. 권한은 설정 칸 패널(D1)과 같다: 우리 권한 표(tuning:read) → Better Auth 확인.
// 시작·취소는 D1 조회 속도 제한도 거친다. 진행·목록 조회는 자주 오므로 분석 서비스의 따로 센 제한(admitPoll)만 거친다.
// 게임 상태는 바꾸지 않는다(시작·취소는 감사 기록만 남긴다).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"·"busy"), BAD_REQUEST(입력 형식, 또는
// data.reason = invalid_settings·budget·invalid_unit), NOT_FOUND(data.reason = unknown_job, 또는 message
// "BALANCE_ANALYSIS_UNAVAILABLE": 인증이나 팩 설정 칸이 없는 서버).
import { TRPCError } from "@trpc/server";
import { analysisJobIdSchema, analysisStartSchema } from "../battleLab/analysisSchema.ts";
import { permissionProcedure, router } from "./init.ts";

/** 권한 표 확인(미들웨어) → Better Auth 확인 → ctx.lab */
const allowed = permissionProcedure({ tuning: ["read"] }).use(async ({ ctx, next }) => {
  const { tuning, battleLab } = ctx;
  if (!tuning || !battleLab)
    throw new TRPCError({ code: "NOT_FOUND", message: "BALANCE_ANALYSIS_UNAVAILABLE" });
  await tuning.ensurePermission("read");
  return next({ ctx: { lab: battleLab, tuning } });
});

/** 시작·취소: D1 조회 속도 제한 */
const counted = allowed.use(({ ctx, next }) => {
  ctx.tuning.admit(ctx.viewer, "read");
  return next();
});

/** 진행·목록: 분석 서비스의 조회 제한 */
const polled = allowed.use(({ ctx, next }) => {
  ctx.lab.shared.analysis.admitPoll(ctx.viewer);
  return next();
});

export const balanceAnalysisRouter = router({
  /** 일 시작(분포 상성 matrix·영향도 sensitivity). 판 수 0인 영향도는 바로 끝난 일 */
  start: counted
    .input(analysisStartSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.analysis.start(ctx.lab.db, ctx.viewer, ctx.lab.ip, input)),
  /** 일 진행(끝났으면 결과) */
  status: polled
    .input(analysisJobIdSchema)
    .query(({ ctx, input }) => ctx.lab.shared.analysis.status(ctx.viewer, input.id)),
  /** 내 최근 일(결과 없이)과 서버가 바쁜지 */
  list: polled.query(({ ctx }) => ctx.lab.shared.analysis.list(ctx.viewer)),
  /** 일 멈춤 */
  cancel: counted
    .input(analysisJobIdSchema)
    .mutation(({ ctx, input }) =>
      ctx.lab.shared.analysis.cancel(ctx.lab.db, ctx.viewer, ctx.lab.ip, input.id),
    ),
});
