// battleLab 라우터 — 개발자 밸런스·전투 실험실(/dev/balance [전투 실험실] 탭, docs/adr/2026-11-01-balance-screen.md
// "바뀜 (2026-11-01, 전투 실험실)"). dev·admin만. 권한·속도 제한은 설정 칸 패널(D1)과 같다: 우리 권한 표(tuning:read·write) →
// Better Auth 확인 → 사용자별 속도 제한(조회·쓰기 따로). 셋 다 입력 검사보다 먼저. 게임 상태는 바꾸지 않는다(프리셋만 DB에 쓴다).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"·"busy"), BAD_REQUEST(입력 형식, 또는 data.reason =
// invalid_unit·invalid_settings·unknown_terrain·sample_read_only·invalid_preset), CONFLICT(preset_conflict·too_many_presets),
// INTERNAL_SERVER_ERROR(data.reason = timeout·failed: 워커), NOT_FOUND(message "BATTLE_LAB_UNAVAILABLE": 인증이나 팩 설정 칸이 없는 서버).
import { TRPCError } from "@trpc/server";
import { rolesAllow } from "../auth/permissions.ts";
import {
  labBattleInputSchema,
  labPresetDeleteSchema,
  labPresetSaveSchema,
  labUnitSchema,
} from "../battleLab/schema.ts";
import { permissionProcedure, router } from "./init.ts";

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한(D1과 같은 제한기) → ctx.lab */
const guarded = (action: "read" | "write") =>
  permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const { tuning, battleLab } = ctx;
    if (!tuning || !battleLab) throw new TRPCError({ code: "NOT_FOUND", message: "BATTLE_LAB_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { lab: battleLab } });
  });

const read = guarded("read");
const write = guarded("write");

export const battleLabRouter = router({
  /** 유닛 종류·무기·장비·스킬·2차 행·성장 실효 값·지형·3D 관람 여부 */
  catalog: read.query(({ ctx }) => ctx.lab.shared.catalog()),
  /** 실험 유닛 하나의 미리 보기(1차 출처·2차 풀이·전투 요약·레벨 표) */
  preview: read.input(labUnitSchema).query(({ ctx, input }) => ctx.lab.shared.preview(input)),
  /** 프리셋 목록(샘플 + 팀). writable = 이 사용자가 쓸 수 있나 */
  presets: read.query(({ ctx }) =>
    ctx.lab.shared.presets(ctx.lab.db, rolesAllow(ctx.viewer.roles, { tuning: ["write"] })),
  ),
  /** 프리셋 저장(id 없음 = 새로 만들기·복제, 있음 = 그 판만 바꾸기·이름 바꾸기) */
  savePreset: write
    .input(labPresetSaveSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.savePreset(ctx.lab.db, ctx.viewer, ctx.lab.ip, input)),
  /** 프리셋 지우기(팀 프리셋만, 그 판만) */
  deletePreset: write
    .input(labPresetDeleteSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.deletePreset(ctx.lab.db, ctx.viewer, ctx.lab.ip, input)),
  /** 한 판(워커): 사건 기록 + 유닛 요약 */
  battle: read
    .input(labBattleInputSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.battle(ctx.viewer, input)),
  /** 3D 관람(워커): 같은 시드의 한 판을 리플레이로 기록(@terra/protocol/battleReplay base64) */
  replay: read
    .input(labBattleInputSchema)
    .mutation(({ ctx, input }) => ctx.lab.shared.replay(ctx.viewer, input)),
});
