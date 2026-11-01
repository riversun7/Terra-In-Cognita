// balance 라우터 — 개발자 밸런스 화면(/dev/balance, docs/adr/2026-11-01-balance-screen.md 3절). dev·admin만.
// 권한·속도 제한은 설정 칸 패널(D1)과 같다: 우리 권한 표(tuning:read) → Better Auth 확인 → 사용자별 조회 속도 제한. 셋 다 입력 검사보다 먼저.
// 표·기여·대결은 조회다(게임 상태·덮어쓰기를 바꾸지 않는다). 담은 변경을 세계에 넣는 것은 tuning.save(같은 묶음 검사·감사 기록).
// 기준 유닛 프리셋 쓰기(savePreset·deletePreset, ADR "바뀜 (D-467)")는 tuning:write(두 겹)·D1 쓰기 속도 제한을 거친다(세계 상태가
// 아니라 개발자 도구 자료다).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"·"busy"), BAD_REQUEST(입력 형식, 또는
// data.reason = invalid_settings·unknown_weapon·invalid_preset·unknown_preset·too_many_presets), CONFLICT("preset_conflict"),
// INTERNAL_SERVER_ERROR(data.reason = timeout·failed: 대결 워커),
// NOT_FOUND(message "BALANCE_UNAVAILABLE": 인증이나 팩 설정 칸이 없는 서버, "BALANCE_PRESETS_UNAVAILABLE": DB가 없는 서버의 프리셋 쓰기).
import {
  BALANCE_EDITS_MAX,
  BALANCE_LIMITS,
  BALANCE_PRESET_NAME_MAX,
  BALANCE_PRIMARY_MAX,
  BALANCE_PRIMARY_MIN,
} from "@terra/shared/balance";
import { STAT_CELL_LIMITS } from "@terra/shared/tuning";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { permissionProcedure, router } from "./init.ts";

const primary = z.int().min(BALANCE_PRIMARY_MIN).max(BALANCE_PRIMARY_MAX);
const primaries = z.strictObject({
  str: primary,
  vit: primary,
  int: primary,
  wis: primary,
  dex: primary,
  agi: primary,
});

/** 담은 변경: 가중치 칸 키만(설정 칸은 /dev/tuning). 값은 칸 범위의 합집합으로 크게 막고, 칸마다 범위는 서버 검사가 본다 */
const edits = z
  .array(
    z.strictObject({
      key: z.string().regex(/^[a-z][a-z0-9_]{1,47}\.(str|dex|agi|vit|int|wis|base|cap|half)$/),
      value: z.int().min(STAT_CELL_LIMITS.base.min).max(STAT_CELL_LIMITS.base.max).nullable(),
    }),
  )
  .max(BALANCE_EDITS_MAX);

const contributionInput = z.strictObject({ primaries, edits });
const duelsInput = z.strictObject({
  primaries,
  edits,
  weapon: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
  count: z.int().min(BALANCE_LIMITS.countMin).max(BALANCE_LIMITS.countMax),
  runs: z.int().min(BALANCE_LIMITS.runsMin).max(BALANCE_LIMITS.runsMax),
  seed: z.int().min(0).max(0x7fff_ffff),
  limitSec: z.int().min(BALANCE_LIMITS.limitSecMin).max(BALANCE_LIMITS.limitSecMax),
});

/** 프리셋 이름(글자 검사·앞뒤 빈칸은 서버 서비스가 다시 본다. 여기는 크게 막는다: 코드 단위 4배) */
const presetName = z.string().max(BALANCE_PRESET_NAME_MAX * 4);
const presetValues = z.strictObject({
  name: z.strictObject({ ko: presetName, en: presetName }),
  primaries,
  weapon: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
  count: z.int().min(BALANCE_LIMITS.countMin).max(BALANCE_LIMITS.countMax),
  runs: z.int().min(BALANCE_LIMITS.runsMin).max(BALANCE_LIMITS.runsMax),
  limitSec: z.int().min(BALANCE_LIMITS.limitSecMin).max(BALANCE_LIMITS.limitSecMax),
});
const presetId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const presetVersion = z.int().min(0).max(0x7fff_ffff);
const savePresetInput = z.strictObject({
  id: presetId.nullable(),
  expectedVersion: presetVersion,
  values: presetValues,
});
const deletePresetInput = z.strictObject({ id: presetId, expectedVersion: presetVersion });

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 조회 속도 제한(D1과 같은 제한기) → ctx.balance */
const read = permissionProcedure({ tuning: ["read"] }).use(async ({ ctx, next }) => {
  const { tuning, balance } = ctx;
  if (!tuning || !balance) throw new TRPCError({ code: "NOT_FOUND", message: "BALANCE_UNAVAILABLE" });
  await tuning.ensurePermission("read");
  tuning.admit(ctx.viewer, "read");
  return next({ ctx: { balance } });
});

/** 프리셋 쓰기: 권한 표(tuning:write) → Better Auth 확인 → 쓰기 속도 제한(D1과 같은 제한기) → ctx.balance */
const write = permissionProcedure({ tuning: ["write"] }).use(async ({ ctx, next }) => {
  const { tuning, balance } = ctx;
  if (!tuning || !balance) throw new TRPCError({ code: "NOT_FOUND", message: "BALANCE_UNAVAILABLE" });
  await tuning.ensurePermission("write");
  tuning.admit(ctx.viewer, "write");
  return next({ ctx: { balance } });
});

export const balanceRouter = router({
  /** 가중치 표(팩 값·실효 값·덮어쓰기), 무기 목록, 기준 유닛 기본값 */
  table: read.query(({ ctx }) => ctx.balance.table()),
  /** 지금 표·고친 표의 2차 스탯과 1차 +10 차이(담은 변경을 tuning.save가 받을지도) */
  contribution: read.input(contributionInput).query(({ ctx, input }) => ctx.balance.contribution(input)),
  /** 1차마다 "기준 + 10 vs 기준" 시드 대결(두 편 차례 합침), 지금 표·고친 표 */
  duels: read.input(duelsInput).query(({ ctx, input }) => ctx.balance.duels(ctx.viewer, input)),
  /** 기준 유닛 프리셋 저장(id null = 새로 만들기). 응답 = 새 목록 */
  savePreset: write
    .input(savePresetInput)
    .mutation(({ ctx, input }) => ctx.balance.savePreset(ctx.viewer, input)),
  /** 기준 유닛 프리셋 지우기(화면에서 만든 것) 또는 팩 값으로 되돌리기(팩 프리셋). 응답 = 새 목록 */
  deletePreset: write
    .input(deletePresetInput)
    .mutation(({ ctx, input }) => ctx.balance.deletePreset(ctx.viewer, input)),
});
