// battleReplay 라우터 — 개발자 전투 다시보기(/dev/battle-replay, docs/adr/2026-11-01-battle-replay.md 5절). dev·admin만.
// 권한·속도 제한은 밸런스 화면과 같다: 우리 권한 표(tuning:read) → Better Auth 확인 → 사용자별 조회 속도 제한. 셋 다 입력 검사보다 먼저.
// 조회만 한다(게임 상태를 바꾸지 않는다). 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"·"busy"),
// BAD_REQUEST(입력 형식), INTERNAL_SERVER_ERROR(data.reason = timeout·failed: 워커), NOT_FOUND(message "BATTLE_REPLAY_UNAVAILABLE":
// 인증이나 팩 설정 칸이 없는 서버).
import { BATTLE_REPLAY_SEED_MAX } from "@terra/shared/battleReplay";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { permissionProcedure, router } from "./init.ts";

const demoInput = z.strictObject({ seed: z.int().min(0).max(BATTLE_REPLAY_SEED_MAX) });

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 조회 속도 제한(D1과 같은 제한기) → ctx.battleReplay */
const read = permissionProcedure({ tuning: ["read"] }).use(async ({ ctx, next }) => {
  const { tuning, battleReplay } = ctx;
  if (!tuning || !battleReplay)
    throw new TRPCError({ code: "NOT_FOUND", message: "BATTLE_REPLAY_UNAVAILABLE" });
  await tuning.ensurePermission("read");
  tuning.admit(ctx.viewer, "read");
  return next({ ctx: { battleReplay } });
});

export const battleReplayRouter = router({
  /** 시범 6 대 6(그 세계 설정·시험 2차맵 경기장)을 기록한 리플레이(base64 이진) */
  demo: read.input(demoInput).query(({ ctx, input }) => ctx.battleReplay.demo(ctx.viewer, input)),
});
