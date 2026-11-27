// 운영자 콘솔 서비스(docs/adr/2026-11-08-operator-console.md) — tRPC ops 라우터(src/trpc/ops.ts)가 권한(access.ts)을 본 뒤 부른다.
// 통제(정지·세션 끊기·유닛·원장·권한 체크박스)는 모두 감사 기록(audit_log, actor_kind 'admin', action ops.*)을 남긴다.
// 자기 계정은 정지·세션 끊기를 할 수 없다(실수로 잠기지 않게). admin 계정 정지는 admin만 한다.
import { randomUUID } from "node:crypto";
import type { Role } from "@terra/shared";
import {
  AUDIT_CATEGORIES,
  type AuditCategory,
  type OpsAccess,
  type OpsBalance,
  type OpsCityRow,
  type OpsCurrencyRow,
  type OpsEconomy,
  type OpsFactionDetail,
  type OpsFactionRow,
  type OpsPermission,
  type OpsPlayerDetail,
  type OpsPlayerRow,
  type OpsServerOverview,
  type OpsSwitch,
  type OpsUnitDetail,
  type OpsUnitResult,
  type OpsUnitRow,
  type OpsUnitSort,
  type OpsUnitState,
  isOpsPermission,
} from "@terra/shared/ops";
import { moneyBalance, moneyOf, NO_NATION_MONEY } from "../world/money.ts";
import type { World } from "../world/world.ts";
import { type OpsQueryable, opsAccessOf } from "./access.ts";
import { planetTotals } from "./planetReads.ts";
import * as reads from "./reads.ts";
import { NO_OPS_SWITCHES, type OpsSwitches } from "./switches.ts";
import { type NationPreset, nationLeaderName, presetOfCode } from "../npc/nations.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import {
  type CurrencyProfile,
  type FactionProfile,
  type ProfileDeps,
  currencyOfFactions,
  currencyProfiles,
  ensureProfiles,
  factionProfiles,
  updateCurrencyProfile,
  updateFactionProfile,
} from "./factionProfiles.ts";
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
  unitWork,
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
  /** 팩 국가 프리셋(세력 정체성·화폐 표시의 처음 값). 없으면 모두 기본값 */
  presets?: readonly NationPreset[] | undefined;
  /** 운영 스위치(조회 감사 기록 켜기·끄기). 없으면 늘 꺼짐·바꾸지 못함 */
  switches?: OpsSwitches | undefined;
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

/** 운영자 지급의 자산 별칭: 그 주체의 돈(소속 국가 화폐) */
export const OPS_MONEY_ALIAS = "money";

export type OpsActionResult<C extends string = string> = { ok: true } | { ok: false; code: C };

export function createOpsServices(shared: OpsShared, request: { ip: string | null }) {
  const { pool } = shared;
  const profileDeps: ProfileDeps = {
    pool,
    presets: shared.presets ?? [],
    // 나라 프리셋이 없는 세력의 화폐 = 기축 통화(첫 고정 나라 화폐), 나라 없는 세계면 그 세계의 돈
    get baseAsset() {
      const ledger = shared.world()?.persistence?.ledger;
      return ledger ? moneyOf(ledger, undefined) : NO_NATION_MONEY;
    },
    now: shared.now,
  };
  /** 이 요청의 세력 정체성·화폐 표시(처음 부를 때 모자란 줄을 정하고 읽는다) */
  let identityPromise:
    | Promise<{
        profiles: Map<number, FactionProfile>;
        currencies: Map<string, CurrencyProfile>;
        currencyOf: Map<number, string>;
      }>
    | undefined;
  let profileNames = new Map<number, string>();
  const identity = () => {
    identityPromise ??= (async () => {
      await ensureProfiles(profileDeps);
      const [profiles, currencies, currencyOf] = await Promise.all([
        factionProfiles(pool),
        currencyProfiles(pool),
        currencyOfFactions(profileDeps),
      ]);
      profileNames = new Map([...profiles.values()].map((profile) => [profile.factionId, profile.name]));
      return { profiles, currencies, currencyOf };
    })();
    return identityPromise;
  };
  const factionLabel = (id: number | null, code: string | null): string => {
    if (id === null) return "";
    const profile = profileNames.get(id);
    if (profile) return profile;
    const name = code ? shared.nationName?.(code) : undefined;
    return name ?? code ?? `#${id}`;
  };
  const credit = (ownerId: number | null): string => {
    const ledger = shared.world()?.persistence?.ledger;
    return ownerId === null || !ledger ? "0" : moneyBalance(ledger, ownerId).toString();
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
    cyborgUnitId: base.cyborgUnitId,
    level: base.level,
    factionId: base.factionId,
    factionName: base.factionId === null ? null : factionLabel(base.factionId, base.factionCode),
    ownerId: base.ownerId,
    units: base.ownerId === null ? 0 : counts ? (counts.get(base.ownerId) ?? 0) : unitCount(base.ownerId),
    credit: credit(base.ownerId),
  });
  /** 소유 주체마다 유닛 수(한 번 훑기). planetId를 주면 그 행성의 2차맵만 */
  const unitCounts = (ownerIds: ReadonlySet<number>, planetId?: string): Map<number, number> => {
    const counts = new Map<number, number>();
    const world = shared.world();
    if (!world || ownerIds.size === 0) return counts;
    for (const map of world.maps.values()) {
      if (planetId !== undefined && map.planetId !== planetId) continue;
      map.forEachUnit((unit) => {
        if (ownerIds.has(unit.ownerId)) counts.set(unit.ownerId, (counts.get(unit.ownerId) ?? 0) + 1);
      });
    }
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
        ownerUserId: label?.userId ?? null,
        ownerFactionId: label?.userId ? null : (label?.factionId ?? null),
        planetId: core.planetId,
        mapKey: core.mapKey,
        cellX: core.cellX,
        cellY: core.cellY,
        moving: core.moving,
        injury: core.injury,
        captive: core.captive,
        // NPC 지도자 이름은 저장하지 않는다(팩 국가 프리셋 leaderName — npc/leaders.ts)
        name:
          core.name ??
          (core.kind === UNIT_KIND_NPC_LEADER && label?.code
            ? (nationLeaderName(label.code, shared.presets ?? [])?.ko ?? null)
            : null),
        growth: core.growth,
        job: core.job,
        doing: core.doing,
        npcWorker: core.npcWorker,
        workplace: core.workplace,
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
  const toFactionRow = (
    row: reads.FactionSqlRow,
    ids: Awaited<ReturnType<typeof identity>>,
    counts?: Map<number, number>,
    memberOwners?: readonly number[],
  ): OpsFactionRow => {
    const ownerId = row.owner_id === null ? null : Number(row.owner_id);
    const id = Number(row.id);
    const profile = ids.profiles.get(id);
    const asset = ids.currencyOf.get(id);
    const currency = asset === undefined ? undefined : ids.currencies.get(asset);
    const ledger = shared.world()?.persistence?.ledger;
    return {
      id,
      kind: row.kind,
      code: row.code,
      name: factionLabel(id, row.code),
      shortName: profile?.shortName ?? null,
      color: profile?.color ?? null,
      profileSource: profile?.source ?? null,
      currency: currency
        ? { asset: currency.asset, name: currency.name, symbol: currency.symbol, ticker: currency.ticker }
        : null,
      treasury: ownerId !== null && ledger && asset ? ledger.balanceOf(ownerId, asset).toString() : "0",
      vassals: Number(row.vassals),
      truces: Number(row.truces),
      satisfactionMilli: row.satisfaction === null ? null : Number(row.satisfaction),
      housing: Number(row.housing),
      parentId: row.parent_id === null ? null : Number(row.parent_id),
      regime: row.regime,
      fixed: row.fixed,
      techLevel: row.tech_level,
      dissolved: row.dissolved_at_ms !== null,
      cities: Number(row.cities),
      humans: Number(row.humans),
      // 가문은 자기 주체가 없다 — 구성원 유닛을 센다
      units:
        ownerId === null
          ? (memberOwners ?? []).reduce(
              (sum, member) => sum + (counts ? (counts.get(member) ?? 0) : unitCount(member)),
              0,
            )
          : counts
            ? (counts.get(ownerId) ?? 0)
            : unitCount(ownerId),
      members: Number(row.members),
      ownerId,
      credit: credit(ownerId),
      wars: Number(row.wars),
    };
  };
  const cityRows = async (input: {
    factionId?: number | undefined;
    search: string;
    /** 이 행성의 도시만(없으면 모든 행성) */
    planetId?: string | undefined;
  }): Promise<OpsCityRow[]> => {
    await identity();
    return (await reads.listCities(pool, input)).map(({ factionCode, ...city }) => ({
      ...city,
      factionName: factionLabel(city.factionId, factionCode),
    }));
  };

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
        // 행성마다 합(docs/adr/2026-11-11-planet-scope.md): 화면이 고른 행성 줄을 요약 카드로 쓴다
        planets: await planetTotals(pool, world),
      };
    },

    async players(
      input: Parameters<typeof reads.listPlayers>[1],
    ): Promise<{ rows: OpsPlayerRow[]; total: number }> {
      await identity();
      const { rows, total } = await reads.listPlayers(pool, input);
      const counts = unitCounts(new Set(rows.flatMap((row) => (row.ownerId === null ? [] : [row.ownerId]))));
      return { rows: rows.map((row) => toPlayerRow(row, counts)), total };
    },

    async player(userId: string): Promise<OpsPlayerDetail | undefined> {
      await identity();
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

    /**
     * 세력 목록. planetId를 주면 도시·휴먼·유닛 수가 그 행성 몫이고, 그 행성에 도시도 유닛도 없는 세력은 뺀다
     * (세력은 세계에 하나다 — 행성에 "있는" 세력만 본다, docs/adr/2026-11-11-planet-scope.md)
     */
    async factions(input: Parameters<typeof reads.listFactions>[1]): Promise<OpsFactionRow[]> {
      const ids = await identity();
      const rows = await reads.listFactions(pool, input);
      const houses = await reads.houseMemberOwners(
        pool,
        rows.filter((row) => row.kind === "player").map((row) => Number(row.id)),
      );
      const counts = unitCounts(
        new Set([
          ...rows.flatMap((row) => (row.owner_id === null ? [] : [Number(row.owner_id)])),
          ...[...houses.values()].flat(),
        ]),
        input.planetId,
      );
      const list = rows.map((row) => toFactionRow(row, ids, counts, houses.get(Number(row.id))));
      return input.planetId === undefined ? list : list.filter((row) => row.cities > 0 || row.units > 0);
    },

    async faction(factionId: number): Promise<OpsFactionDetail | undefined> {
      const ids = await identity();
      const row = await reads.findFaction(pool, factionId);
      if (!row) return undefined;
      const houses =
        row.kind === "player"
          ? await reads.houseMemberOwners(pool, [factionId])
          : new Map<number, number[]>();
      const faction = toFactionRow(row, ids, undefined, houses.get(factionId));
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
      /** 이 행성의 유닛만(없으면 모든 행성) */
      planetId?: string | undefined;
      mapKey?: number | undefined;
      kind?: number | undefined;
      /** 작업 상태 거르기·정렬 칸(없으면 ID 차례) */
      state?: OpsUnitState | undefined;
      sort?: OpsUnitSort | undefined;
      desc?: boolean | undefined;
      limit: number;
      offset: number;
    }): Promise<{ status: "ok" | "not_ready"; rows: OpsUnitRow[]; total: number }> {
      await identity();
      const world = shared.world();
      if (!world) return { status: "not_ready", rows: [], total: 0 };
      const { units, total } = listUnits(
        world,
        {
          ownerKind: input.ownerKind,
          ownerIds: input.ownerId === undefined ? undefined : new Set([input.ownerId]),
          planetId: input.planetId,
          mapKey: input.mapKey,
          kind: input.kind,
          state: input.state,
          sort: input.sort,
          desc: input.desc,
        },
        { limit: input.limit, offset: input.offset },
        shared.now(),
      );
      return { status: "ok", rows: await labelUnits(units), total };
    },

    async unit(unitId: number): Promise<OpsUnitDetail | undefined> {
      await identity();
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
        work: unitWork(world, unitId, shared.now()),
      };
    },

    /** 감사 기록. categories = 분류(@terra/shared AUDIT_CATEGORIES) → 동작 앞부분 목록 */
    audit: (
      filter: Omit<reads.AuditFilter, "prefixes"> & { categories?: readonly AuditCategory[] | undefined },
    ) =>
      reads.listAudit(pool, {
        ...filter,
        prefixes: (filter.categories ?? []).flatMap((category) => AUDIT_CATEGORIES[category]),
      }),

    /** 화폐 목록(표시·찍는 나라·쓰는 세력 수·보유 합) */
    async currencies(): Promise<OpsCurrencyRow[]> {
      const ids = await identity();
      const factionRows = await reads.listFactions(pool, { kind: "all", includeDissolved: false });
      const world = shared.world();
      const totals = new Map((world ? ledgerTotals(world) : []).map((row) => [row.asset, row]));
      const presets = shared.presets ?? [];
      return [...ids.currencies.values()].map((currency) => {
        const users = factionRows.filter((row) => ids.currencyOf.get(Number(row.id)) === currency.asset);
        const issuerRow = users.find((row) => {
          if (!row.fixed || row.code === null) return false;
          const own = presetOfCode(row.code, presets);
          return own?.currency !== undefined && `cur:${own.currency.code}` === currency.asset;
        });
        const total = totals.get(currency.asset);
        return {
          ...currency,
          issuer: issuerRow
            ? { id: Number(issuerRow.id), name: factionLabel(Number(issuerRow.id), issuerRow.code) }
            : null,
          factions: users.length,
          held: (total?.held ?? 0n).toString(),
          holders: total?.holders ?? 0,
        };
      });
    },

    /** 세력 정체성 고치기(이름·약어·색). 감사 기록 ops.faction_profile */
    async updateFaction(
      viewer: OpsViewer,
      input: { factionId: number; name: string; shortName: string; color: string; reason: string },
    ): Promise<OpsActionResult<"not_found" | "invalid" | "short_taken" | "player_owned">> {
      await identity();
      const result = await updateFactionProfile(pool, { ...input, actorId: viewer.id, nowMs: shared.now() });
      if (!result.ok) return result;
      await audit(viewer, {
        action: "ops.faction_profile",
        targetId: null,
        before: { name: result.before.name, shortName: result.before.shortName, color: result.before.color },
        after: { name: result.after.name, shortName: result.after.shortName, color: result.after.color },
        meta: { factionId: input.factionId, reason: input.reason },
      });
      return { ok: true };
    },

    /** 화폐 표시 고치기(이름·기호·3글자 약어). 감사 기록 ops.currency_profile */
    async updateCurrency(
      viewer: OpsViewer,
      input: { asset: string; name: string; symbol: string; ticker: string; reason: string },
    ): Promise<OpsActionResult<"not_found" | "invalid" | "ticker_taken">> {
      await identity();
      const result = await updateCurrencyProfile(pool, { ...input, actorId: viewer.id, nowMs: shared.now() });
      if (!result.ok) return result;
      await audit(viewer, {
        action: "ops.currency_profile",
        targetId: null,
        before: { name: result.before.name, symbol: result.before.symbol, ticker: result.before.ticker },
        after: { name: result.after.name, symbol: result.after.symbol, ticker: result.after.ticker },
        meta: { asset: input.asset, reason: input.reason },
      });
      return { ok: true };
    },

    /** 운영 스위치 지금 값 */
    switches: (): { id: OpsSwitch; enabled: boolean }[] => (shared.switches ?? NO_OPS_SWITCHES).list(),

    /** 운영 스위치 바꾸기(감사 기록 ops.switch는 스위치와 상관없이 남긴다) */
    async setSwitch(
      viewer: OpsViewer,
      input: { id: OpsSwitch; enabled: boolean },
    ): Promise<OpsActionResult<"unavailable">> {
      const switches = shared.switches;
      if (!switches) return { ok: false, code: "unavailable" };
      const before = switches.isOn(input.id);
      await switches.set(input.id, input.enabled, viewer.id, shared.now());
      await audit(viewer, {
        action: "ops.switch",
        targetId: null,
        before: { [input.id]: before },
        after: { [input.id]: input.enabled },
      });
      return { ok: true };
    },

    async economy(input: { asset: string }): Promise<OpsEconomy> {
      await identity();
      const world = shared.world();
      const ledgerNow = world?.persistence?.ledger;
      const asset = input.asset || (ledgerNow ? moneyOf(ledgerNow, undefined) : NO_NATION_MONEY);
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
          // planetId: 감사 기록을 행성으로 거른다(docs/adr/2026-11-11-planet-scope.md)
          meta: {
            unitId: input.unitId,
            ownerId: before?.ownerId ?? null,
            planetId: before?.planetId ?? null,
            reason: input.reason,
          },
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
      // 자산 "money" = 그 주체의 돈(소속 국가 화폐 — world/money.ts). 화면 시험·운영 도구가 화폐 코드를 몰라도 지급한다
      const grantLedger = world.persistence?.ledger;
      if (input.asset === OPS_MONEY_ALIAS && grantLedger)
        input = { ...input, asset: moneyOf(grantLedger, input.ownerId) };
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
