// battleReport 라우터 — 전투 보고서(/dev/balance [전투 보고서]·[보고서 기록], docs/adr/2026-11-14-battle-report.md). dev·admin만.
// 권한은 설정 칸 패널(D1)과 같다: 우리 권한 표(tuning:read) → Better Auth 확인. 시작·취소·목록·열기·한 대 풀이는 D1 조회 속도 제한도
// 거친다. 진행 조회는 자주 오므로 보고서 서비스의 따로 센 제한(admitPoll)만 거친다. 게임 상태는 바꾸지 않는다(기록 표·감사 기록만 쓴다).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"·"busy"), BAD_REQUEST(입력 형식, 또는 data.reason =
// invalid_settings·budget·variant_mode·invalid_unit·unknown_terrain·unknown_tuning·tuning_out_of_range), NOT_FOUND(data.reason =
// unknown_job·unknown_report, 또는 message "BATTLE_REPORT_UNAVAILABLE"), INTERNAL_SERVER_ERROR(data.reason = timeout·failed: 한 대 풀이 워커).
import { TRPCError } from "@trpc/server";
import {
  reportIdSchema,
  reportJobIdSchema,
  reportListSchema,
  reportStartSchema,
  reportTraceSchema,
} from "../battleReport/schema.ts";
import { permissionProcedure, router } from "./init.ts";

/** 권한 표 확인(미들웨어) → Better Auth 확인 → ctx.lab */
const allowed = permissionProcedure({ tuning: ["read"] }).use(async ({ ctx, next }) => {
  const { tuning, battleLab } = ctx;
  if (!tuning || !battleLab) throw new TRPCError({ code: "NOT_FOUND", message: "BATTLE_REPORT_UNAVAILABLE" });
  await tuning.ensurePermission("read");
  return next({ ctx: { lab: battleLab, tuning } });
});

/** D1 조회 속도 제한 */
const counted = allowed.use(({ ctx, next }) => {
  ctx.tuning.admit(ctx.viewer, "read");
  return next();
});

/** 진행: 보고서 서비스의 조회 제한 */
const polled = allowed.use(({ ctx, next }) => {
  ctx.lab.shared.report.admitPoll(ctx.viewer);
  return next();
});

export const battleReportRouter = router({
  /** 보고서 일 시작(워커). 끝나면 기록으로 저장된다 */
  start: counted
    .input(reportStartSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.report.start(ctx.lab.db, ctx.viewer, ctx.lab.ip, input)),
  /** 일 진행(끝났으면 기록) */
  status: polled
    .input(reportJobIdSchema)
    .query(({ ctx, input }) => ctx.lab.shared.report.status(ctx.viewer, input.id)),
  /** 내 최근 일과 서버가 바쁜지 */
  jobs: polled.query(({ ctx }) => ctx.lab.shared.report.jobs(ctx.viewer)),
  /** 일 멈춤 */
  cancel: counted
    .input(reportJobIdSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.report.cancel(ctx.lab.db, ctx.viewer, ctx.lab.ip, input.id)),
  /** 기록 목록(새것부터, 날짜·이름·종류로 거름) */
  list: counted
    .input(reportListSchema)
    .query(({ ctx, input }) => ctx.lab.shared.report.list(ctx.lab.db, input)),
  /** 기록 하나(설정 전부·결과) */
  get: counted
    .input(reportIdSchema)
    .query(({ ctx, input }) => ctx.lab.shared.report.get(ctx.lab.db, input.id)),
  /** 한 대 풀이: 기록의 판 하나를 지금 규칙으로 다시 돌려 공격 단계를 낸다(워커) */
  trace: counted
    .input(reportTraceSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.report.trace(ctx.lab.db, ctx.viewer, input)),
});
