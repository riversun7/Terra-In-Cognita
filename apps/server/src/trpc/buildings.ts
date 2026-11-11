// buildings 라우터 — 건물 편집기(/dev/buildings, docs/adr/2026-11-02-building-editor.md). dev·admin만.
// 권한·속도 제한은 설정 칸 패널(D1)·스킬·아이템 편집기와 같다: 우리 권한 표(tuning:read·write) → Better Auth 확인 → 사용자별 속도 제한.
// 셋 다 입력 검사보다 먼저. 쓰기는 게임 상태가 아니라 그 세계의 팩 시설 실효 값(덮어쓰기)을 바꾼다: 서버가 팩 검사기로 본 뒤에만 받고
// 감사 기록을 남긴다. 저장은 스킬·아이템 편집기와 같은 덮어쓰기 층·판·차례다.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS("rate_limited"), BAD_REQUEST(입력 형식, 또는 data.reason =
// BUILDING_EDITOR_REASONS — invalid_entry(+ data.details)·unknown_entry·duplicate_entry·invalid_note·entry_changed(data.details = 키)·
// entry_too_large. 하나라도 틀리면 묶음 전체를 받지 않는다), CONFLICT("revision_conflict"), NOT_FOUND(message
// "BUILDING_EDITOR_UNAVAILABLE": 인증이나 팩이 없는 서버).
import {
  BUILDING_EDITOR_CHANGES_MAX,
  BUILDING_EDIT_CATEGORIES,
  type CombatClassJson,
  type FacilityJson,
  type GatherTierJson,
} from "@terra/shared/buildingEditor";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TuningAction } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const contentId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const revision = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
/** 고치기 시작할 때의 실효 항목 해시 */
const baseHash = z.string().regex(/^[0-9a-f]{64}$/);

/** 시설·확률표 항목은 모양만 크게 보고(객체, ID) 칸마다의 규칙은 서버가 팩 스키마로 본다(팩 검사기 하나) */
const entry = z.custom<FacilityJson>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

const gatherBandEntry = z.custom<GatherTierJson>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

const combatClassEntry = z.custom<CombatClassJson>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    contentId.safeParse(Reflect.get(value, "id")).success,
);

const change = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("put"), entry, baseHash }),
  z.strictObject({ op: z.literal("revert"), id: contentId, baseHash }),
  z.strictObject({ op: z.literal("put_gather_band"), entry: gatherBandEntry, baseHash }),
  z.strictObject({ op: z.literal("revert_gather_band"), id: contentId, baseHash }),
  z.strictObject({ op: z.literal("put_combat_class"), entry: combatClassEntry, baseHash }),
  z.strictObject({ op: z.literal("revert_combat_class"), id: contentId, baseHash }),
  z.strictObject({
    op: z.literal("discard_sleeping"),
    id: contentId,
    category: z.enum(BUILDING_EDIT_CATEGORIES).optional(),
  }),
]);
const changes = z.array(change).min(1).max(BUILDING_EDITOR_CHANGES_MAX);

/** 권한 표 확인(미들웨어) → Better Auth 확인 → 속도 제한(설정 칸 패널과 같은 제한기) → ctx.buildings */
function buildingsProcedure(action: TuningAction) {
  return permissionProcedure({ tuning: [action] }).use(async ({ ctx, next }) => {
    const { tuning, buildings } = ctx;
    if (!tuning || !buildings)
      throw new TRPCError({ code: "NOT_FOUND", message: "BUILDING_EDITOR_UNAVAILABLE" });
    await tuning.ensurePermission(action);
    tuning.admit(ctx.viewer, action);
    return next({ ctx: { buildings } });
  });
}

const read = buildingsProcedure("read");
const write = buildingsProcedure("write");

export const buildingsRouter = router({
  /** 시설(실효·팩·덮어쓰기·레시피)·재료 고르기 창·채집 중분류·건설 규칙(M14)·잠든 줄·판 */
  list: read.query(({ ctx }) => ctx.buildings.list()),
  /** 묶음 검사(저장하지 않음): 코드가 붙은 문제(오류) 또는 시설 권고 */
  check: read
    .input(z.strictObject({ changes }))
    .query(({ ctx, input }) => ctx.buildings.check(input.changes)),
  /** 묶음 적용(baseHash). 바뀐 목록을 돌려준다 */
  save: write
    .input(
      z.strictObject({
        expectedRevision: revision,
        changes,
        /** 메모는 서버가 정리·검사한다(@terra/shared normalizeTuningNote). 여기서는 길이만 크게 막는다 */
        note: z.string().max(2_000).nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => ctx.buildings.save(ctx.viewer, input)),
  /** 최근 바꿈(감사 기록 요약, 시설 줄이 든 것) */
  history: read.query(({ ctx }) => ctx.buildings.history()),
});
