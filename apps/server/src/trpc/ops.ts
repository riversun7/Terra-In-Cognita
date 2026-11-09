// ops 라우터 — 운영자 콘솔(/ops, docs/adr/2026-11-08-operator-console.md). 매 요청 서버가 세션과 운영 권한(역할 기본 + 체크박스)을 본다.
// 예외(ADR 3절): 운영자 통제(유닛·원장)는 게임 상태를 바꾸지만 WebSocket이 아니라 여기(tRPC 쓰기)로 받는다. 서버 한 프로세스의 같은 월드
// 객체를 같은 쓰기 대기열로 바꾸므로 판정 결과는 같고, 플레이어 명령이 아니라 감사 기록을 남기는 운영 도구이기 때문이다.
// 권한 부여(grants)는 개발자만(manage_grants), 운영 스위치(switches)는 관리자·개발자(log_switch).
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN(권한 없음), PRECONDITION_FAILED(운영 서비스 없음 — DB 없는 서버), NOT_FOUND(대상 없음)
import { AUDIT_CATEGORY_IDS, OPS_PERMISSIONS, OPS_SWITCHES, type OpsPermission } from "@terra/shared/ops";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { OpsServices } from "../ops/services.ts";
import { router, signedInProcedure } from "./init.ts";

function services(ops: OpsServices | undefined): OpsServices {
  if (!ops) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "OPS_UNAVAILABLE" });
  return ops;
}

/** 운영 권한 하나가 있어야 한다(기본 거부). ctx.opsViewer = 확인한 운영자 */
function opsProcedure(permission: OpsPermission) {
  return signedInProcedure.use(async ({ ctx, next }) => {
    const ops = services(ctx.ops);
    const viewer = { id: ctx.viewer.id, roles: ctx.viewer.roles };
    const access = await ops.access(viewer);
    if (!access.permissions.includes(permission))
      throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    return next({ ctx: { ops, opsViewer: viewer } });
  });
}

const notFound = (): never => {
  throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND" });
};

const page = { limit: z.int().min(1).max(200).default(50), offset: z.int().min(0).max(1_000_000).default(0) };
const reason = z.string().trim().max(200).default("");
const id = z.int().min(1).max(Number.MAX_SAFE_INTEGER);

export const opsRouter = router({
  /** 내 운영 권한(화면이 탭·단추를 고른다). 콘솔 역할이 없으면 빈 목록 */
  me: signedInProcedure.query(async ({ ctx }) => {
    if (!ctx.ops) return { permissions: [], granted: [] };
    return ctx.ops.access({ id: ctx.viewer.id, roles: ctx.viewer.roles });
  }),

  overview: opsProcedure("view_server").query(({ ctx }) => ctx.ops.overview()),

  players: router({
    list: opsProcedure("view_players")
      .input(
        z.strictObject({
          search: z.string().trim().max(40).default(""),
          status: z.enum(["all", "online", "banned", "staff"]).default("all"),
          sort: z.enum(["login", "created", "level"]).default("login"),
          ...page,
        }),
      )
      .query(({ ctx, input }) => ctx.ops.players(input)),
    get: opsProcedure("view_players")
      .input(z.strictObject({ userId: z.uuid() }))
      .query(async ({ ctx, input }) => (await ctx.ops.player(input.userId)) ?? notFound()),
  }),

  npcs: router({
    factions: opsProcedure("view_npcs")
      .input(
        z.strictObject({
          kind: z.enum(["all", "npc", "player"]).default("npc"),
          includeDissolved: z.boolean().default(false),
        }),
      )
      .query(({ ctx, input }) => ctx.ops.factions(input)),
    faction: opsProcedure("view_npcs")
      .input(z.strictObject({ factionId: id }))
      .query(async ({ ctx, input }) => (await ctx.ops.faction(input.factionId)) ?? notFound()),
    cities: opsProcedure("view_npcs")
      .input(z.strictObject({ factionId: id.optional(), search: z.string().trim().max(40).default("") }))
      .query(({ ctx, input }) => ctx.ops.cities(input)),
    /** 세력 정체성 고치기(이름·약어·색) — 관리자·개발자(faction_edit). 규칙은 @terra/shared/factionProfile, 서버가 다시 본다 */
    updateProfile: opsProcedure("faction_edit")
      .input(
        z.strictObject({
          factionId: id,
          name: z.string().max(64),
          shortName: z.string().max(16),
          color: z.string().max(16),
          reason,
        }),
      )
      .mutation(({ ctx, input }) => ctx.ops.updateFaction(ctx.opsViewer, input)),
  }),

  /** 화폐 표시(이름·기호·3글자 약어) */
  currencies: router({
    list: opsProcedure("view_npcs").query(({ ctx }) => ctx.ops.currencies()),
    update: opsProcedure("faction_edit")
      .input(
        z.strictObject({
          asset: z.string().min(2).max(96),
          name: z.string().max(64),
          symbol: z.string().max(16),
          ticker: z.string().max(8),
          reason,
        }),
      )
      .mutation(({ ctx, input }) => ctx.ops.updateCurrency(ctx.opsViewer, input)),
  }),

  units: router({
    /** 유닛 목록. 유저 유닛은 view_players, NPC 유닛은 view_npcs, 둘 다면 둘 다 필요 */
    list: signedInProcedure
      .input(
        z.strictObject({
          ownerKind: z.enum(["user", "faction"]).optional(),
          ownerId: id.optional(),
          mapKey: z.int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
          kind: z.int().min(0).max(32767).optional(),
          ...page,
        }),
      )
      .query(async ({ ctx, input }) => {
        const ops = services(ctx.ops);
        const access = await ops.access({ id: ctx.viewer.id, roles: ctx.viewer.roles });
        const need: OpsPermission[] =
          input.ownerKind === "user"
            ? ["view_players"]
            : input.ownerKind === "faction"
              ? ["view_npcs"]
              : ["view_players", "view_npcs"];
        if (!need.every((permission) => access.permissions.includes(permission)))
          throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
        return ops.units(input);
      }),
    /** 유닛 상세. 유저 유닛은 view_players, NPC 유닛은 view_npcs */
    get: signedInProcedure.input(z.strictObject({ unitId: id })).query(async ({ ctx, input }) => {
      const ops = services(ctx.ops);
      const access = await ops.access({ id: ctx.viewer.id, roles: ctx.viewer.roles });
      const canUsers = access.permissions.includes("view_players");
      const canNpcs = access.permissions.includes("view_npcs");
      if (!canUsers && !canNpcs) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
      const detail = (await ops.unit(input.unitId)) ?? notFound();
      const allowed = detail.unit.ownerKind === "user" ? canUsers : canNpcs;
      if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
      return detail;
    }),
    stop: opsProcedure("unit_stop")
      .input(z.strictObject({ unitId: id, reason }))
      .mutation(({ ctx, input }) =>
        ctx.ops.unitAction(ctx.opsViewer, {
          unitId: input.unitId,
          action: { kind: "stop" },
          reason: input.reason,
        }),
      ),
    rescue: opsProcedure("unit_rescue")
      .input(z.strictObject({ unitId: id, reason }))
      .mutation(({ ctx, input }) =>
        ctx.ops.unitAction(ctx.opsViewer, {
          unitId: input.unitId,
          action: { kind: "rescue" },
          reason: input.reason,
        }),
      ),
    heal: opsProcedure("unit_heal")
      .input(z.strictObject({ unitId: id, reason }))
      .mutation(({ ctx, input }) =>
        ctx.ops.unitAction(ctx.opsViewer, {
          unitId: input.unitId,
          action: { kind: "heal" },
          reason: input.reason,
        }),
      ),
    teleport: opsProcedure("unit_teleport")
      .input(
        z.strictObject({
          unitId: id,
          cellX: z.int().min(0).max(4095),
          cellY: z.int().min(0).max(4095),
          reason,
        }),
      )
      .mutation(({ ctx, input }) =>
        ctx.ops.unitAction(ctx.opsViewer, {
          unitId: input.unitId,
          action: { kind: "teleport", cellX: input.cellX, cellY: input.cellY },
          reason: input.reason,
        }),
      ),
  }),

  accounts: router({
    /** 강제 로그아웃(세션 모두 지움) */
    kick: opsProcedure("account_kick")
      .input(z.strictObject({ userId: z.uuid() }))
      .mutation(({ ctx, input }) => ctx.ops.kick(ctx.opsViewer, input.userId)),
    /** 정지(hours = null이면 기한 없음)·해제 */
    ban: opsProcedure("account_ban")
      .input(
        z.strictObject({
          userId: z.uuid(),
          banned: z.boolean(),
          reason,
          hours: z
            .int()
            .min(1)
            .max(24 * 365)
            .nullable()
            .default(null),
        }),
      )
      .mutation(({ ctx, input }) => ctx.ops.ban(ctx.opsViewer, input)),
  }),

  economy: router({
    summary: opsProcedure("view_economy")
      .input(z.strictObject({ asset: z.string().trim().max(96).default("") }))
      .query(({ ctx, input }) => ctx.ops.economy(input)),
    /** 운영자 지급(+)·회수(−). 사유 필수(D-7021) */
    grant: opsProcedure("ledger_grant")
      .input(
        z.strictObject({
          ownerId: id,
          asset: z.string().trim().min(2).max(96),
          /** 최소 단위 정수(부호 포함, 문자열 — BigInt) */
          amount: z.string().regex(/^-?[1-9][0-9]{0,17}$/),
          reason: z.string().trim().min(2).max(200),
        }),
      )
      .mutation(({ ctx, input }) => ctx.ops.grant(ctx.opsViewer, { ...input, amount: BigInt(input.amount) })),
  }),

  audit: opsProcedure("view_audit")
    .input(
      z.strictObject({
        action: z.string().trim().max(64).default(""),
        /** 분류(@terra/shared AUDIT_CATEGORIES). 비우면 모두 */
        categories: z.array(z.enum(AUDIT_CATEGORY_IDS)).max(AUDIT_CATEGORY_IDS.length).default([]),
        actorId: z.uuid().optional(),
        targetId: z.uuid().optional(),
        /** 한 사람·대상 아이디 일부 */
        actorSearch: z.string().trim().max(40).default(""),
        targetSearch: z.string().trim().max(40).default(""),
        beforeId: id.optional(),
        limit: z.int().min(1).max(200).default(50),
      }),
    )
    .query(({ ctx, input }) => ctx.ops.audit(input)),

  /** 운영 스위치(조회 감사 기록, 기본 꺼짐) — 관리자 화면이 쓴다 */
  switches: router({
    list: opsProcedure("log_switch").query(({ ctx }) => ctx.ops.switches()),
    set: opsProcedure("log_switch")
      .input(z.strictObject({ id: z.enum(OPS_SWITCHES), enabled: z.boolean() }))
      .mutation(({ ctx, input }) => ctx.ops.setSwitch(ctx.opsViewer, input)),
  }),

  grants: router({
    get: opsProcedure("manage_grants")
      .input(z.strictObject({ userId: z.uuid() }))
      .query(async ({ ctx, input }) => (await ctx.ops.grantsOf(input.userId)) ?? notFound()),
    set: opsProcedure("manage_grants")
      .input(
        z.strictObject({
          userId: z.uuid(),
          permissions: z.array(z.enum(OPS_PERMISSIONS)).max(OPS_PERMISSIONS.length),
        }),
      )
      .mutation(({ ctx, input }) => ctx.ops.setGrants(ctx.opsViewer, input)),
  }),
});
