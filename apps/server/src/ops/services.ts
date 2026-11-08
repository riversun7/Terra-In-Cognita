// 운영자 콘솔 서비스(docs/adr/2026-11-08-operator-console.md) — tRPC ops 라우터(src/trpc/ops.ts)가 권한(access.ts)을 본 뒤 부른다.
// 통제(정지·세션 끊기·유닛·원장·권한 체크박스)는 모두 감사 기록(audit_log, actor_kind 'admin', action ops.*)을 남긴다.
// 자기 계정은 정지·세션 끊기를 할 수 없다(실수로 잠기지 않게). admin 계정 정지는 admin만 한다.
import { randomUUID } from "node:crypto";
import type { Role } from "@terra/shared";
import {
  type OpsAccess,
  type OpsAuditRow,
  type OpsBalance,
  type OpsCityRow,
  type OpsEconomy,
  type OpsFactionDetail,
  type OpsFactionRow,
  type OpsPermission,
  type OpsPlayerDetail,
  type OpsPlayerRow,
  type OpsServerOverview,
  type OpsUnitDetail,
  type OpsUnitResult,
  type OpsUnitRow,
  isOpsPermission,
} from "@terra/shared/ops";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { World } from "../world/world.ts";
import { type OpsQueryable, opsAccessOf } from "./access.ts";
import * as reads from "./reads.ts";
import {
  type OpsGrantResult,
  type OpsUnitAction,
  type OpsUnitCore,
  applyUnitAction,
  ledgerTotals,
  listUnits,
  ownerBalances,
  postOperatorGrant,
  topHolders,
  unitDetailCore,
  worldGauges,
} from "./world.ts";

/** 앱에 하나(app.ts가 만든다) */
export interface OpsShared {
  pool: OpsQueryable;
  /** 부팅 복구가 끝난 월드(없거나 준비 전이면 undefined) */
  world: () => World | undefined;
  /** 월드 상태(준비 전에도) */
  worldStatus: () => ReturnType<World["status"]> | undefined;
  wsConnections: () => number;
  /** 세력 코드 → 나라 이름(팩 국가 프리셋). 없으면 코드를 쓴다 */
  nationName?: ((code: string) => string | undefined) | undefined;
  now: () => number;
}

export interface OpsViewer {
  id: string;
  roles: readonly Role[];
}

const MB = 1024 * 1024;
const roundMb = (bytes: number): number => Math.round((bytes / MB) * 10) / 10;

/** 원장 지급·회수 결과(잔고는 문자열 — BigInt) */
export type OpsGrantView =
  | { ok: true; txId: number; balance: string }
  | Extract<OpsGrantResult, { ok: false }>;

export type OpsActionResult<C extends string = string> = { ok: true } | { ok: false; code: C };

export function createOpsServices(shared: OpsShared, request: { ip: string | null }) {
  const { pool } = shared;
  const factionLabel = (id: number | null, code: string | null): string => {
    if (id === null) return "";
    const name = code ? shared.nationName?.(code) : undefined;
    return name ?? code ?? `#${id}`;
  };
  const credit = (ownerId: number | null): string => {
    const ledger = shared.world()?.persistence?.ledger;
    return ownerId === null || !ledger ? "0" : ledger.balanceOf(ownerId, ASSET_CREDIT).toString();
  };
  const unitCount = (ownerId: number | null): number => {
    const world = shared.world();
    if (ownerId === null || !world) return 0;
    let n = 0;
    for (const map of world.maps.values())
      map.forEachUnit((unit) => {
        if (unit.ownerId === ownerId) n += 1;
      });
    return n;
  };
  const toPlayerRow = (base: reads.PlayerBase, counts?: Map<number, number>): OpsPlayerRow => ({
    id: base.id,
    loginId: base.loginId,
    roles: base.roles,
    banned: base.banned,
    banReason: base.banReason,
    banExpires: base.banExpires,
    createdAt: base.createdAt,
    online: base.online,
    offlineSinceMs: base.offlineSinceMs,
    cyborgName: base.cyborgName,
    level: base.level,
    factionId: base.factionId,
    factionName: base.factionId === null ? null : factionLabel(base.factionId, base.factionCode),
    ownerId: base.ownerId,
    units: base.ownerId === null ? 0 : counts ? (counts.get(base.ownerId) ?? 0) : unitCount(base.ownerId),
    credit: credit(base.ownerId),
  });
  /** 소유 주체마다 유닛 수(한 번 훑기) */
  const unitCounts = (ownerIds: ReadonlySet<number>): Map<number, number> => {
    const counts = new Map<number, number>();
    const world = shared.world();
    if (!world || ownerIds.size === 0) return counts;
    for (const map of world.maps.values())
      map.forEachUnit((unit) => {
        if (ownerIds.has(unit.ownerId)) counts.set(unit.ownerId, (counts.get(unit.ownerId) ?? 0) + 1);
      });
    return counts;
  };
  const labelUnits = async (cores: readonly OpsUnitCore[]): Promise<OpsUnitRow[]> => {
    const labels = await reads.ownerLabels(pool, [...new Set(cores.map((core) => core.ownerId))]);
    return cores.map((core) => {
      const label = labels.get(core.ownerId);
      return {
        id: core.id,
        kind: core.kind,
        ownerId: core.ownerId,
        ownerKind: core.ownerKind,
        ownerLabel: label?.loginId ?? factionLabel(label?.factionId ?? null, label?.code ?? null),
        planetId: core.planetId,
        mapKey: core.mapKey,
        cellX: core.cellX,
        cellY: core.cellY,
        moving: core.moving,
        injury: core.injury,
        captive: core.captive,
      };
    });
  };
  const balancesOf = (ownerId: number | null): OpsBalance[] => {
    const world = shared.world();
    if (ownerId === null || !world) return [];
    return ownerBalances(world, ownerId).map((row) => ({ ...row, balance: row.balance.toString() }));
  };
  const audit = (
    viewer: OpsViewer,
    entry: Omit<Parameters<typeof reads.writeOpsAudit>[1], "actorId" | "ip">,
  ) => reads.writeOpsAudit(pool, { ...entry, actorId: viewer.id, ip: request.ip });
  const toFactionRow = (row: reads.FactionSqlRow, counts?: Map<number, number>): OpsFactionRow => {
    const ownerId = row.owner_id === null ? null : Number(row.owner_id);
    return {
      id: Number(row.id),
      kind: row.kind,
      code: row.code,
      name: factionLabel(Number(row.id), row.code),
      parentId: row.parent_id === null ? null : Number(row.parent_id),
      regime: row.regime,
      fixed: row.fixed,
      techLevel: row.tech_level,
      dissolved: row.dissolved_at_ms !== null,
      cities: Number(row.cities),
      humans: Number(row.humans),
      units: ownerId === null ? 0 : counts ? (counts.get(ownerId) ?? 0) : unitCount(ownerId),
      members: Number(row.members),
      ownerId,
      credit: credit(ownerId),
      wars: Number(row.wars),
    };
  };
  const cityRows = async (input: { factionId?: number | undefined; search: string }): Promise<OpsCityRow[]> =>
    (await reads.listCities(pool, input)).map(({ factionCode, ...city }) => ({
      ...city,
      factionName: factionLabel(city.factionId, factionCode),
    }));

  return {
    access: (viewer: OpsViewer): Promise<OpsAccess> => opsAccessOf(pool, viewer.id, viewer.roles),

    async overview(): Promise<OpsServerOverview> {
      const status = shared.worldStatus();
      const world = shared.world();
      const gauges = world ? worldGauges(world) : { maps: 0, units: 0, moving: 0 };
      const memory = process.memoryUsage();
      const db = await reads.overviewCounts(pool);
      return {
        nowMs: shared.now(),
        uptimeSec: Math.round(process.uptime()),
        memory: {
          rssMb: roundMb(memory.rss),
          heapUsedMb: roundMb(memory.heapUsed),
          heapTotalMb: roundMb(memory.heapTotal),
          externalMb: roundMb(memory.external),
        },
        wsConnections: shared.wsConnections(),
        world: {
          state: status?.state ?? "none",
          issues: status?.issues ?? 0,
          bootMs: status?.bootMs ?? null,
          ...gauges,
          npcRuntime: world?.npc !== undefined,
        },
        ...db,
      };
    },

    async players(
      input: Parameters<typeof reads.listPlayers>[1],
    ): Promise<{ rows: OpsPlayerRow[]; total: number }> {
      const { rows, total } = await reads.listPlayers(pool, input);
      const counts = unitCounts(new Set(rows.flatMap((row) => (row.ownerId === null ? [] : [row.ownerId]))));
      return { rows: rows.map((row) => toPlayerRow(row, counts)), total };
    },

    async player(userId: string): Promise<OpsPlayerDetail | undefined> {
      const base = await reads.findPlayer(pool, userId);
      if (!base) return undefined;
      const world = shared.world();
      const units =
        base.ownerId === null || !world
          ? []
          : await labelUnits(
              listUnits(world, { ownerIds: new Set([base.ownerId]) }, { limit: 500, offset: 0 }, shared.now())
                .units,
            );
      const cyborg = await reads.cyborgOf(pool, userId);
      return {
        player: toPlayerRow(base),
        cyborg: cyborg
          ? {
              name: cyborg.name,
              temperament: cyborg.temperament,
              level: cyborg.level,
              exp: cyborg.exp,
              rebirths: cyborg.rebirths,
              faith: cyborg.faith,
              faithPoints: cyborg.faith_points,
              religion: cyborg.religion,
              initial: cyborg.initial,
              kPm: cyborg.k_pm,
              elements: cyborg.elements,
              startCityId: Number(cyborg.start_city_id),
              unitId: cyborg.unit_id === null ? null : Number(cyborg.unit_id),
              createdAtMs: Number(cyborg.created_at_ms),
            }
          : null,
        balances: balancesOf(base.ownerId),
        units,
        items: base.ownerId === null ? [] : await reads.itemsOfOwner(pool, base.ownerId),
        skills: await reads.skillsOfUnits(
          pool,
          units.map((unit) => unit.id),
        ),
        sessions: await reads.sessionsOf(pool, userId),
        audit: await reads.listAudit(pool, { action: "", targetId: userId, limit: 30 }),
      };
    },

    async factions(input: Parameters<typeof reads.listFactions>[1]): Promise<OpsFactionRow[]> {
      const rows = await reads.listFactions(pool, input);
      const counts = unitCounts(
        new Set(rows.flatMap((row) => (row.owner_id === null ? [] : [Number(row.owner_id)]))),
      );
      return rows.map((row) => toFactionRow(row, counts));
    },

    async faction(factionId: number): Promise<OpsFactionDetail | undefined> {
      const row = await reads.findFaction(pool, factionId);
      if (!row) return undefined;
      const faction = toFactionRow(row);
      const world = shared.world();
      const units =
        faction.ownerId === null || !world
          ? []
          : await labelUnits(
              listUnits(
                world,
                { ownerIds: new Set([faction.ownerId]) },
                { limit: 300, offset: 0 },
                shared.now(),
              ).units,
            );
      return {
        faction,
        traits: row.traits,
        researchProgress: row.research_progress,
        aiStep: row.ai_step,
        bornOf: row.born_of === null ? null : Number(row.born_of),
        rebelOf: row.rebel_of === null ? null : Number(row.rebel_of),
        cities: await cityRows({ factionId, search: "" }),
        wars: (await reads.factionWars(pool, factionId)).map((war) => ({
          otherId: war.otherId,
          otherName: factionLabel(war.otherId, war.otherCode),
          state: war.state,
          atMs: war.atMs,
        })),
        balances: balancesOf(faction.ownerId),
        members: await reads.factionMembers(pool, factionId),
        units,
      };
    },

    cities: cityRows,

    async units(input: {
      ownerKind?: "user" | "faction" | undefined;
      ownerId?: number | undefined;
      mapKey?: number | undefined;
      kind?: number | undefined;
      limit: number;
      offset: number;
    }): Promise<{ status: "ok" | "not_ready"; rows: OpsUnitRow[]; total: number }> {
      const world = shared.world();
      if (!world) return { status: "not_ready", rows: [], total: 0 };
      const { units, total } = listUnits(
        world,
        {
          ownerKind: input.ownerKind,
          ownerIds: input.ownerId === undefined ? undefined : new Set([input.ownerId]),
          mapKey: input.mapKey,
          kind: input.kind,
        },
        { limit: input.limit, offset: input.offset },
        shared.now(),
      );
      return { status: "ok", rows: await labelUnits(units), total };
    },

    async unit(unitId: number): Promise<OpsUnitDetail | undefined> {
      const world = shared.world();
      const core = world ? unitDetailCore(world, unitId, shared.now()) : undefined;
      if (!world || !core) return undefined;
      const [row] = await labelUnits([core]);
      if (!row) return undefined;
      const cargo = balancesOf(core.ownerId).filter((balance) => balance.location === -unitId);
      return {
        unit: row,
        speed: core.speed,
        size: core.size,
        job: core.job,
        injuryUntilMs: core.injuryUntilMs,
        heldBy: core.heldBy,
        human: await (async () => {
          const human = await reads.humanOf(pool, unitId);
          return human ? { ...human, ageMs: Math.max(0, shared.now() - human.bornAtMs) } : null;
        })(),
        vitals: await reads.vitalsOf(pool, unitId),
        skills: await reads.skillsOfUnits(pool, [unitId]),
        items: await reads.itemsOfUnit(pool, unitId),
        cargo,
      };
    },

    audit: (filter: reads.AuditFilter): Promise<OpsAuditRow[]> => reads.listAudit(pool, filter),

    async economy(input: { asset: string }): Promise<OpsEconomy> {
      const world = shared.world();
      const asset = input.asset || ASSET_CREDIT;
      const totals = world ? ledgerTotals(world) : [];
      const top = world ? topHolders(world, asset, 20) : [];
      const large = await reads.largeEntries(pool, { asset: input.asset, window: 5000, limit: 30 });
      const labels = await reads.ownerLabels(pool, [
        ...new Set([
          ...top.map((row) => row.ownerId),
          ...large.flatMap((row) => (row.ownerId === null ? [] : [row.ownerId])),
        ]),
      ]);
      const labelOf = (ownerId: number | null): { kind: "user" | "faction" | null; label: string } => {
        const found = ownerId === null ? undefined : labels.get(ownerId);
        return {
          kind: found?.kind ?? null,
          label: found?.loginId ?? factionLabel(found?.factionId ?? null, found?.code ?? null),
        };
      };
      return {
        totals: totals.map((row) => ({ ...row, held: row.held.toString(), system: row.system.toString() })),
        top: top.map((row) => {
          const owner = labelOf(row.ownerId);
          return {
            ownerId: row.ownerId,
            ownerKind: owner.kind,
            label: owner.label,
            balance: row.balance.toString(),
          };
        }),
        largeEntries: large.map((row) => ({ ...row, label: labelOf(row.ownerId).label })),
        operatorTx: await reads.operatorTransactions(pool, 30),
      };
    },

    // ── 통제 ──

    async kick(viewer: OpsViewer, userId: string): Promise<OpsActionResult<"self" | "not_found">> {
      if (userId === viewer.id) return { ok: false, code: "self" };
      const target = await reads.userExists(pool, userId);
      if (!target) return { ok: false, code: "not_found" };
      const revoked = await reads.revokeSessions(pool, userId);
      await audit(viewer, { action: "ops.kick", targetId: userId, after: { revoked } });
      return { ok: true };
    },

    async ban(
      viewer: OpsViewer,
      input: { userId: string; banned: boolean; reason: string; hours: number | null },
    ): Promise<OpsActionResult<"self" | "not_found" | "protected_target">> {
      if (input.userId === viewer.id) return { ok: false, code: "self" };
      const target = await reads.findPlayer(pool, input.userId);
      if (!target) return { ok: false, code: "not_found" };
      // admin 계정의 정지는 admin만(운영자가 관리자를 잠그지 못하게)
      if (target.roles.includes("admin") && !viewer.roles.includes("admin"))
        return { ok: false, code: "protected_target" };
      const expires =
        input.banned && input.hours !== null ? new Date(shared.now() + input.hours * 3_600_000) : null;
      await reads.setBan(pool, {
        userId: input.userId,
        banned: input.banned,
        reason: input.reason || null,
        expires,
      });
      await audit(viewer, {
        action: input.banned ? "ops.ban" : "ops.unban",
        targetId: input.userId,
        before: { banned: target.banned, reason: target.banReason, expires: target.banExpires },
        after: { banned: input.banned, expires: expires?.toISOString() ?? null },
        meta: { reason: input.reason },
      });
      return { ok: true };
    },

    async unitAction(
      viewer: OpsViewer,
      input: { unitId: number; action: OpsUnitAction; reason: string },
    ): Promise<{ result: OpsUnitResult }> {
      const world = shared.world();
      if (!world) return { result: "not_ready" };
      const before = unitDetailCore(world, input.unitId, shared.now());
      const result = applyUnitAction(world, input.unitId, input.action, shared.now());
      if (result === "ok") {
        await world.persistence?.writer.durable();
        await audit(viewer, {
          action: `ops.unit.${input.action.kind}`,
          targetId: before?.userId ?? null,
          before: before
            ? { mapKey: before.mapKey, x: before.cellX, y: before.cellY, injury: before.injury }
            : null,
          after: input.action,
          meta: { unitId: input.unitId, ownerId: before?.ownerId ?? null, reason: input.reason },
        });
      }
      return { result };
    },

    async grant(
      viewer: OpsViewer,
      input: { ownerId: number; asset: string; amount: bigint; reason: string },
    ): Promise<OpsGrantView> {
      const world = shared.world();
      if (!world) return { ok: false, code: "not_ready" };
      const requestId = randomUUID();
      const result = await postOperatorGrant(world, { ...input, requestId, nowMs: shared.now() });
      if (!result.ok) return result;
      const owner = world.persistence?.owners.get(input.ownerId);
      await audit(viewer, {
        action: input.amount > 0n ? "ops.grant" : "ops.revoke",
        targetId: owner?.userId ?? null,
        after: { asset: input.asset, amount: input.amount.toString(), balance: result.balance.toString() },
        meta: {
          ownerId: input.ownerId,
          factionId: owner?.factionId ?? null,
          txId: result.txId,
          requestId,
          reason: input.reason,
        },
      });
      return { ok: true, txId: result.txId, balance: result.balance.toString() };
    },

    async grantsOf(
      userId: string,
    ): Promise<{ loginId: string; roles: Role[]; access: OpsAccess } | undefined> {
      const target = await reads.userExists(pool, userId);
      if (!target) return undefined;
      return {
        loginId: target.loginId,
        roles: target.roles,
        access: await opsAccessOf(pool, userId, target.roles),
      };
    },

    async setGrants(
      viewer: OpsViewer,
      input: { userId: string; permissions: readonly OpsPermission[] },
    ): Promise<OpsActionResult<"not_found" | "self">> {
      // 자기 권한을 스스로 늘리지 못하게
      if (input.userId === viewer.id) return { ok: false, code: "self" };
      const target = await reads.userExists(pool, input.userId);
      if (!target) return { ok: false, code: "not_found" };
      const before = await opsAccessOf(pool, input.userId, target.roles);
      const permissions = [...new Set(input.permissions)].filter(isOpsPermission);
      await reads.setOpsGrants(pool, {
        userId: input.userId,
        permissions,
        actorId: viewer.id,
        nowMs: shared.now(),
      });
      await audit(viewer, {
        action: "ops.set_grants",
        targetId: input.userId,
        before: { granted: before.granted },
        after: { granted: permissions },
      });
      return { ok: true };
    },
  };
}

export type OpsServices = ReturnType<typeof createOpsServices>;
