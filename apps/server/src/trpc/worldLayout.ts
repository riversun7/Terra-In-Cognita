// worldLayout 라우터 — 세계 배치 화면(/dev/world-layout, 기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)").
// 고정 NPC 국가의 자리(수도 2차맵)를 보고 놓는다. 놓은 자리는 서버가 다음에 켤 때 세계에 든다(실시간 게임 상태를 바꾸는 명령이 아니라 개발자
// 설정이라 tRPC다 — 설정 칸 패널과 같다). 서비스는 src/world/placementService.ts.
// - view·suggest·tierPlan: 권한 worldLayout: read(dev·admin) / place·clear·requestTierApply·cancelTierApply: worldLayout: place
//   (dev·admin, 감사 기록). 국력 등급(사용자 답 2026-11-11): suggest가 등급 배치 계획을, tierPlan이 이미 선 세계에 더해질 것을 보인다
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, BAD_REQUEST(입력 형식), PRECONDITION_FAILED("WORLD_NOT_READY": 세계·DB·행성 값 없음),
// NOT_FOUND("UNKNOWN_PLANET": 세계 행성이 아님)
import type {
  WorldLayoutPlanetView,
  WorldLayoutSuggestion,
  WorldPlaceResult,
  WorldTierApplyView,
} from "@terra/shared/worldPlacementApi";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type PlacementService, parseMapKey } from "../world/placementService.ts";
import type { TrpcContext } from "./context.ts";
import { permissionProcedure, router } from "./init.ts";

const planetId = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/);
const code = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/);
const mapKey = z.string().regex(/^\d{1,19}$/);

function serviceOf(ctx: Pick<TrpcContext, "worldLayout">, planet: string): PlacementService {
  const ready = ctx.worldLayout?.service();
  if (!ready) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WORLD_NOT_READY" });
  if (ready.planetId !== planet) throw new TRPCError({ code: "NOT_FOUND", message: "UNKNOWN_PLANET" });
  return ready.service;
}

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WORLD_NOT_READY" });
  return value;
}

export const worldLayoutRouter = router({
  /** 국가·도시·놓은 자리 */
  view: permissionProcedure({ worldLayout: ["read"] })
    .input(z.strictObject({ planetId }))
    .query(
      async ({ ctx, input }): Promise<WorldLayoutPlanetView> =>
        present(await serviceOf(ctx, input.planetId).view()),
    ),
  /** 자리를 고르지 않은 국가의 자동 배치 자리 */
  suggest: permissionProcedure({ worldLayout: ["read"] })
    .input(z.strictObject({ planetId }))
    .query(
      async ({ ctx, input }): Promise<WorldLayoutSuggestion> =>
        present(await serviceOf(ctx, input.planetId).suggest()),
    ),
  /** 국가 자리 놓기(여럿 — 자동 제안을 한 번에 놓을 때). 줄마다 결과 */
  place: permissionProcedure({ worldLayout: ["place"] })
    .input(
      z.strictObject({
        planetId,
        placements: z.array(z.strictObject({ code, mapKey })).min(1).max(32),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<WorldPlaceResult[]> => {
      const service = serviceOf(ctx, input.planetId);
      const entries = input.placements.map((entry) => ({
        code: entry.code,
        // 칸 키가 아니면 0(서비스가 bad_cell로 답한다)
        mapKey: parseMapKey(entry.mapKey) ?? 0,
      }));
      return present(
        await service.place(entries, { userId: ctx.viewer.id, ip: ctx.worldLayout?.ip ?? null }),
      );
    }),
  /** 국가 자리 지우기(자동 배치로 돌아감). 없던 자리면 false */
  clear: permissionProcedure({ worldLayout: ["place"] })
    .input(z.strictObject({ planetId, code }))
    .mutation(
      async ({ ctx, input }): Promise<{ cleared: boolean }> => ({
        cleared: await serviceOf(ctx, input.planetId).clear(input.code, {
          userId: ctx.viewer.id,
          ip: ctx.worldLayout?.ip ?? null,
        }),
      }),
    ),
  /** 국력 등급 분포를 이미 선 세계에 반영하면 더해지는 것(미리 보기 — DB 읽기만)과 걸린 요청 */
  tierPlan: permissionProcedure({ worldLayout: ["read"] })
    .input(z.strictObject({ planetId }))
    .query(
      async ({ ctx, input }): Promise<WorldTierApplyView> =>
        present(await serviceOf(ctx, input.planetId).tierPlan()),
    ),
  /** 반영 예약: 다음 서버 시작 때 든다(더하기만 — 지우거나 옮기지 않는다). 감사 기록 */
  requestTierApply: permissionProcedure({ worldLayout: ["place"] })
    .input(z.strictObject({ planetId }))
    .mutation(
      async ({ ctx, input }): Promise<WorldTierApplyView> =>
        present(
          await serviceOf(ctx, input.planetId).requestTierApply({
            userId: ctx.viewer.id,
            ip: ctx.worldLayout?.ip ?? null,
          }),
        ),
    ),
  /** 아직 들지 않은 반영 예약 지우기 */
  cancelTierApply: permissionProcedure({ worldLayout: ["place"] })
    .input(z.strictObject({ planetId }))
    .mutation(
      async ({ ctx, input }): Promise<{ cancelled: boolean }> => ({
        cancelled: await serviceOf(ctx, input.planetId).cancelTierApply({
          userId: ctx.viewer.id,
          ip: ctx.worldLayout?.ip ?? null,
        }),
      }),
    ),
});
