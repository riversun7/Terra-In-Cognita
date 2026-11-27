// 운영자 콘솔의 월드 쪽(docs/adr/2026-11-08-operator-console.md) — 메모리 월드에서 읽기(유닛 목록·현황·원장 합)와 운영자 통제
// (유닛 멈추기·안전한 곳으로·치료·같은 2차맵 안 순간이동, 원장 지급·회수). 권한·감사 기록은 부르는 쪽(services.ts)이 본다.
// 유닛 지우기는 두지 않는다: 종류마다 정리할 것(NPC 사회 런타임 거울·보유 물건·스킬·신앙·화물)이 달라 이 층에서 안전하게 못 한다(ADR 4절).
import type {
  OpsOwnerKind,
  OpsUnitDoing,
  OpsUnitGrowth,
  OpsUnitResult,
  OpsUnitSort,
  OpsUnitState,
  OpsUnitWork,
} from "@terra/shared/ops";
import { CELL_UNITS, LedgerError, type SizeClass, positionAt } from "@terra/sim";
import { unitGrowthOf } from "../growth/store.ts";
import { unitLifeOf } from "../life/store.ts";
import { BASELINE_PRIMARY } from "../roster/body.ts";
import { TACTICS_KINDS, unitTacticsOf } from "../tactics/store.ts";
import { DEFAULT_WORK_SHIFT, atWork, botStatus, shiftFatiguePm } from "../world/bots.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { World } from "../world/world.ts";

/** 메모리 유닛 한 줄(이름표는 services.ts가 DB에서 붙인다) */
export interface OpsUnitCore {
  id: number;
  kind: number;
  ownerId: number;
  ownerKind: OpsOwnerKind | null;
  userId: string | null;
  factionId: number | null;
  planetId: string;
  mapKey: number;
  cellX: number;
  cellY: number;
  moving: boolean;
  injury: number;
  captive: boolean;
  name: string | null;
  growth: OpsUnitGrowth | null;
  job: { kind: number; phase: number; fatigue: number; fatigueEstimated?: boolean };
  doing: OpsUnitDoing;
  npcWorker: boolean;
  workplace: number | null;
}

/** 저장된 스탯이 없는 유닛의 몸(roster/body.ts baselineBody와 같은 값: 1차 모두 10, 레벨 1, 성장 없음) */
const BASELINE_STATS: readonly number[] = Array.from({ length: 6 }, () => BASELINE_PRIMARY);

/** 조회가 읽는 유닛 정보(2차맵 unitInfo) */
type UnitInfo = NonNullable<ReturnType<SecondMap["unitInfo"]>>;

/** NPC 도시 일꾼인가(도시 경제가 일터나 건물 없는 도시 직무를 준 휴먼 — 직무 상태가 없다) */
const isNpcWorker = (info: UnitInfo): boolean =>
  info.job.job === 0 &&
  info.home !== undefined &&
  (info.home.work !== undefined || info.home.cityJob === true);

/**
 * 지금 하는 일(하나): 직무 유닛은 직무 단계, 집이 있는 봇(NPC 휴먼)은 움직임을 정하는 판단(world/bots.ts botStatus — 화면에 보이는 움직임과 같다)과
 * 그 자리에 닿았는지, 그 밖 유닛은 걷는 중인지. "쉬는 중인데 이동 중" 같은 어긋난 표시를 내지 않는다(사용자 지적 2026-11-27)
 */
function doingOf(info: UnitInfo, unitId: number, nowMs: number): OpsUnitDoing {
  if (info.job.job !== 0) return info.job.phase === 0 ? "working" : "resting";
  const moving = (info.motion.arrivals.at(-1) ?? info.motion.departAtMs) > nowMs;
  const home = info.home;
  if (!home) return moving ? "moving" : "idle";
  const status = botStatus(home, { id: unitId, size: info.size }, positionAt(info.motion, nowMs), nowMs);
  if (status.state === "work") {
    if (status.job === "haul") return "hauling";
    return status.arrived ? "working" : "to_work";
  }
  if (status.state === "need") return "need";
  if (status.state === "patrol") return "patrol";
  if (status.state === "evade") return "evade";
  // 건물 없는 도시 직무 일꾼은 집(시청 칸) 둘레에서 일한다: 일하는 때면 일하는 중
  if (home.cityJob === true && atWork(home.shift ?? DEFAULT_WORK_SHIFT, unitId, nowMs))
    return status.arrived ? "working" : "to_work";
  if (isNpcWorker(info)) return status.arrived ? "resting" : "to_rest";
  return status.arrived ? "idle" : "moving";
}

/**
 * 피로: 직무 유닛은 직무 상태의 값. NPC 도시 일꾼은 직무 상태가 없어 어림 피로(bots.ts shiftFatiguePm ‰ — 일하는 때 오르고 쉬는 때 내린다, NPC 작업
 * 중 부상 판정이 쓰는 값)를 피로 상한 눈금으로 바꿔 보인다
 */
function fatigueOf(
  world: World,
  info: UnitInfo,
  unitId: number,
  nowMs: number,
): { fatigue: number; estimated: boolean } {
  const max = isNpcWorker(info) ? unitLifeOf(world.persistence)?.fatigueMax() : undefined;
  if (max === undefined) return { fatigue: info.job.fatigue, estimated: false };
  const pm = shiftFatiguePm(info.home?.shift ?? DEFAULT_WORK_SHIFT, unitId, nowMs);
  return { fatigue: Math.round((pm * max) / 1000), estimated: true };
}

/** Primaries 객체 → STR·DEX·AGI·VIT·INT·WIS 배열 */
const sixOf = (p: {
  readonly str: number;
  readonly dex: number;
  readonly agi: number;
  readonly vit: number;
  readonly int: number;
  readonly wis: number;
}): number[] => [p.str, p.dex, p.agi, p.vit, p.int, p.wis];

/**
 * 유닛의 이름과 성장 값: 사이보그 본체는 만든 기록, 휴먼·사이보그 유닛은 성장 거울(growth/store.ts), 스탯이 저장되지 않은 유닛은 세계가 실제로
 * 쓰는 종류 기본 몸(source "baseline"). 이름은 본체 이름 → NPC 휴먼 이름(NPC 런타임 — 지도자 이름은 services.ts가 프리셋에서 붙인다)
 */
export function unitGrowth(world: World, unitId: number): { name: string | null; growth: OpsUnitGrowth } {
  const persistence = world.persistence;
  const store = unitGrowthOf(persistence);
  const userId = persistence?.cyborgs.userOfUnit(unitId);
  const record = userId === undefined ? undefined : persistence?.cyborgs.record(userId);
  if (record) {
    const initial = sixOf(record.initial);
    const kPm = sixOf(record.kPm);
    return {
      name: record.name,
      growth: {
        source: "cyborg",
        level: record.level,
        exp: record.exp,
        expSpan: store?.spanAt(record.level) ?? 0,
        rebirths: record.rebirths,
        initial,
        kPm,
        stats: store?.grownOf(initial, kPm, record.level) ?? initial,
      },
    };
  }
  const sheet = store?.sheetOf(unitId);
  const name = world.npc?.humanName(unitId) ?? null;
  if (!sheet)
    return {
      name,
      growth: {
        source: "baseline",
        level: 1,
        exp: 0,
        expSpan: 0,
        rebirths: 0,
        initial: [...BASELINE_STATS],
        kPm: null,
        stats: [...BASELINE_STATS],
      },
    };
  return {
    name,
    growth: {
      source: sheet.kind === "human" ? "human" : sheet.kind === "cyborg" ? "cyborg_unit" : "unit",
      level: sheet.level,
      exp: sheet.exp,
      expSpan: sheet.span,
      rebirths: sheet.rebirths,
      initial: [...sheet.initial],
      kPm: sheet.kPm ? [...sheet.kPm] : null,
      stats: [...sheet.stats],
    },
  };
}

/** 유닛의 작업 상태(일터·계약·생활 규칙·AI 작전·가는 곳) — 유닛 상세 */
export function unitWork(world: World, unitId: number, nowMs: number): OpsUnitWork {
  const persistence = world.persistence;
  const info = findUnit(world, unitId)?.unitInfo(unitId);
  const buildingId = persistence?.labor.workplaceOf(unitId);
  const entry =
    buildingId === undefined
      ? undefined
      : persistence?.labor.workersAt(buildingId).find((w) => w.unitId === unitId);
  let contract: { rate: bigint; asset: string; state: string } | undefined;
  for (const c of persistence?.labor.contracts.values() ?? [])
    if (c.unitId === unitId && c.buildingId === buildingId && c.endedAtMs === null) contract = c;
  const life = info && TACTICS_KINDS.has(info.kind) ? unitLifeOf(persistence)?.of(unitId) : undefined;
  const last = info?.motion.arrivals.at(-1);
  const end = info && last !== undefined && last > nowMs ? positionAt(info.motion, last) : undefined;
  return {
    workplace:
      buildingId === undefined
        ? null
        : {
            buildingId,
            facility: persistence?.facilities.service.facilities.get(buildingId)?.facilityId ?? null,
            via: entry?.via ?? "assign",
            rate: contract && entry?.via !== "assign" ? String(contract.rate) : null,
            asset: contract && entry?.via !== "assign" ? contract.asset : null,
            state: contract && entry?.via !== "assign" ? contract.state : null,
          },
    life: life ? { restAt: life.restAt, resumeAt: life.resumeAt, saved: life.saved } : null,
    tactics: unitTacticsOf(persistence)?.get(unitId)?.preset ?? null,
    destination:
      end && last !== undefined
        ? { cellX: Math.floor(end.x / CELL_UNITS), cellY: Math.floor(end.y / CELL_UNITS), arriveAtMs: last }
        : null,
  };
}

export interface OpsUnitFilter {
  /** 이 소유 주체들만(없으면 모두) */
  ownerIds?: ReadonlySet<number> | undefined;
  ownerKind?: OpsOwnerKind | undefined;
  /** 이 행성의 2차맵에 있는 유닛만(없으면 모든 행성, docs/adr/2026-11-11-planet-scope.md) */
  planetId?: string | undefined;
  /** 작업 상태로 거르기 */
  state?: OpsUnitState | undefined;
  /** 정렬 칸(없으면 ID)과 내림차순 */
  sort?: OpsUnitSort | undefined;
  desc?: boolean | undefined;
  mapKey?: number | undefined;
  kind?: number | undefined;
}

function ownerKindOf(
  world: World,
  ownerId: number,
): { kind: OpsOwnerKind | null; userId: string | null; factionId: number | null } {
  const owner = world.persistence?.owners.get(ownerId);
  if (!owner) return { kind: null, userId: null, factionId: null };
  return {
    kind: owner.userId !== null ? "user" : owner.factionId !== null ? "faction" : null,
    userId: owner.userId,
    factionId: owner.factionId,
  };
}

function unitCore(world: World, map: SecondMap, unitId: number, nowMs: number): OpsUnitCore | undefined {
  const info = map.unitInfo(unitId);
  if (!info) return undefined;
  const point = positionAt(info.motion, nowMs);
  const last = info.motion.arrivals.at(-1) ?? info.motion.departAtMs;
  const owner = ownerKindOf(world, info.ownerId);
  const fatigue = fatigueOf(world, info, unitId, nowMs);
  return {
    id: unitId,
    kind: info.kind,
    ownerId: info.ownerId,
    ownerKind: owner.kind,
    userId: owner.userId,
    factionId: owner.factionId,
    planetId: map.planetId,
    mapKey: map.mapKey,
    cellX: Math.floor(point.x / CELL_UNITS),
    cellY: Math.floor(point.y / CELL_UNITS),
    moving: last > nowMs,
    injury: info.condition.injury,
    captive: info.condition.heldBy !== null,
    ...unitGrowth(world, unitId),
    job: {
      kind: info.job.job,
      phase: info.job.phase,
      fatigue: fatigue.fatigue,
      ...(fatigue.estimated ? { fatigueEstimated: true } : {}),
    },
    doing: doingOf(info, unitId, nowMs),
    npcWorker: isNpcWorker(info),
    workplace: world.persistence?.labor.workplaceOf(unitId) ?? null,
  };
}

/** 유닛이 그 상태인가(목록 거르기): 부상·포로, 그 밖은 지금 하는 일(doingOf) */
function inState(map: SecondMap, unitId: number, state: OpsUnitState, nowMs: number): boolean {
  const info = map.unitInfo(unitId);
  if (!info) return false;
  if (state === "injured") return info.condition.injury > 0;
  if (state === "captive") return info.condition.heldBy !== null;
  return doingOf(info, unitId, nowMs) === state;
}

/** 피로 정렬 값(NPC 도시 일꾼은 어림 피로) */
function fatigueKeyOf(world: World, map: SecondMap, unitId: number, nowMs: number): number {
  const info = map.unitInfo(unitId);
  return info ? fatigueOf(world, info, unitId, nowMs).fatigue : 0;
}

/** 레벨 정렬 값에서 레벨 한 칸의 크기(그 구간 안 경험치보다 크다) */
const LEVEL_SORT_STEP = 1_000_000_000;

/**
 * 레벨·경험치 정렬 값(레벨이 먼저, 같은 레벨이면 그 구간 안 경험치 — 본체는 만든 기록, 그 밖은 성장 거울). 레벨이 없는 유닛(배·시험 유닛)은 0
 */
function levelKeyOf(world: World, unitId: number): number {
  const persistence = world.persistence;
  const userId = persistence?.cyborgs.userOfUnit(unitId);
  const record = userId === undefined ? undefined : persistence?.cyborgs.record(userId);
  const view = record ?? unitGrowthOf(persistence)?.viewOf(unitId);
  return view ? view.level * LEVEL_SORT_STEP + Math.min(LEVEL_SORT_STEP - 1, Math.max(0, view.exp)) : 0;
}

/**
 * 조건에 맞는 유닛(정렬 칸 차례 — 같으면 ID 차례)과 전체 수. 10만 유닛도 한 번 훑는다(조회 한 번에 수십 ms — 운영 조회라 받아들인다).
 * 작업 상태 거르기와 레벨·피로 정렬은 걸러 낸 유닛마다 유닛 정보를 한 번 더 읽는다
 */
export function listUnits(
  world: World,
  filter: OpsUnitFilter,
  page: { limit: number; offset: number },
  nowMs: number,
): { units: OpsUnitCore[]; total: number } {
  const ids: { id: number; map: SecondMap; key: number }[] = [];
  const { state, sort } = filter;
  for (const map of world.maps.values()) {
    if (filter.planetId !== undefined && map.planetId !== filter.planetId) continue;
    if (filter.mapKey !== undefined && map.mapKey !== filter.mapKey) continue;
    map.forEachUnit((unit) => {
      if (filter.ownerIds && !filter.ownerIds.has(unit.ownerId)) return;
      if (filter.kind !== undefined && unit.kind !== filter.kind) return;
      if (filter.ownerKind !== undefined && ownerKindOf(world, unit.ownerId).kind !== filter.ownerKind)
        return;
      if (state !== undefined && !inState(map, unit.id, state, nowMs)) return;
      const key =
        sort === "level"
          ? levelKeyOf(world, unit.id)
          : sort === "fatigue"
            ? fatigueKeyOf(world, map, unit.id, nowMs)
            : unit.id;
      ids.push({ id: unit.id, map, key });
    });
  }
  const direction = filter.desc === true ? -1 : 1;
  ids.sort((a, b) => (a.key - b.key) * direction || a.id - b.id);
  const units: OpsUnitCore[] = [];
  for (const entry of ids.slice(page.offset, page.offset + page.limit)) {
    const core = unitCore(world, entry.map, entry.id, nowMs);
    if (core) units.push(core);
  }
  return { units, total: ids.length };
}

export function findUnit(world: World, unitId: number): SecondMap | undefined {
  for (const map of world.maps.values()) if (map.unitInfo(unitId)) return map;
  return undefined;
}

export function unitDetailCore(
  world: World,
  unitId: number,
  nowMs: number,
):
  | (OpsUnitCore & {
      speed: number;
      size: SizeClass;
      job: { kind: number; phase: number; progressMs: number; fatigue: number; fatigueEstimated?: boolean };
      injuryUntilMs: number | null;
      heldBy: number | null;
    })
  | undefined {
  const map = findUnit(world, unitId);
  const info = map?.unitInfo(unitId);
  const core = map ? unitCore(world, map, unitId, nowMs) : undefined;
  if (!map || !info || !core) return undefined;
  return {
    ...core,
    speed: info.speed,
    size: info.size,
    job: { ...core.job, progressMs: info.job.progressMs },
    injuryUntilMs: info.condition.injuryUntilMs,
    heldBy: info.condition.heldBy,
  };
}

/** 2차맵 수·유닛 수·움직이는 수 */
export function worldGauges(world: World): { maps: number; units: number; moving: number } {
  let units = 0;
  let moving = 0;
  for (const map of world.maps.values()) {
    const gauges = map.gauges();
    units += gauges.units;
    moving += gauges.moving;
  }
  return { maps: world.maps.size, units, moving };
}

/** 자산마다: 주체 보유 합·시스템 계정 합·보유 주체 수 */
export function ledgerTotals(
  world: World,
): { asset: string; held: bigint; system: bigint; holders: number }[] {
  const ledger = world.persistence?.ledger;
  if (!ledger) return [];
  const byAsset = new Map<string, { held: bigint; system: bigint; holders: Set<number> }>();
  for (const account of ledger.accounts()) {
    let row = byAsset.get(account.asset);
    if (!row) {
      row = { held: 0n, system: 0n, holders: new Set() };
      byAsset.set(account.asset, row);
    }
    if (account.ownerId === null) row.system += account.balance;
    else {
      row.held += account.balance;
      if (account.balance > 0n) row.holders.add(account.ownerId);
    }
  }
  return [...byAsset.entries()]
    .map(([asset, row]) => ({ asset, held: row.held, system: row.system, holders: row.holders.size }))
    .toSorted((a, b) => a.asset.localeCompare(b.asset));
}

/** 자산 하나의 상위 보유 주체(위치 합) */
export function topHolders(
  world: World,
  asset: string,
  limit: number,
): { ownerId: number; balance: bigint }[] {
  const ledger = world.persistence?.ledger;
  if (!ledger) return [];
  const sums = new Map<number, bigint>();
  for (const account of ledger.accounts()) {
    if (account.ownerId === null || account.asset !== asset || account.balance <= 0n) continue;
    sums.set(account.ownerId, (sums.get(account.ownerId) ?? 0n) + account.balance);
  }
  return [...sums.entries()]
    .map(([ownerId, balance]) => ({ ownerId, balance }))
    .toSorted((a, b) => (a.balance === b.balance ? a.ownerId - b.ownerId : a.balance > b.balance ? -1 : 1))
    .slice(0, limit);
}

/** 주체 하나의 잔고(0 아닌 것, 자산·위치 차례) */
export function ownerBalances(
  world: World,
  ownerId: number,
): { asset: string; location: number | null; balance: bigint }[] {
  const ledger = world.persistence?.ledger;
  if (!ledger) return [];
  const rows: { asset: string; location: number | null; balance: bigint }[] = [];
  for (const account of ledger.accounts())
    if (account.ownerId === ownerId && account.balance !== 0n)
      rows.push({ asset: account.asset, location: account.location, balance: account.balance });
  return rows.toSorted((a, b) => a.asset.localeCompare(b.asset) || (a.location ?? 0) - (b.location ?? 0));
}

export type OpsUnitAction =
  | { kind: "stop" }
  | { kind: "rescue" }
  | { kind: "heal" }
  | { kind: "teleport"; cellX: number; cellY: number };

/** 유닛 통제 하나. 결과 코드만 돌려준다(저장은 2차맵이 쓰기 대기열에 넣는다) */
export function applyUnitAction(
  world: World,
  unitId: number,
  action: OpsUnitAction,
  nowMs: number,
): OpsUnitResult {
  const map = findUnit(world, unitId);
  const info = map?.unitInfo(unitId);
  if (!map || !info) return "not_found";
  switch (action.kind) {
    case "stop":
      // 봇(서버가 움직이는 NPC)은 halt가 false다 → 지원하지 않는 종류
      return map.halt(unitId) ? "ok" : "unsupported_kind";
    case "rescue":
      return map.relocateToSafety(unitId) ? "ok" : "failed";
    case "heal":
      return map.setCondition(unitId, {
        ...info.condition,
        injury: 0,
        injuryUntilMs: null,
        injuryHealPm: 1000,
      })
        ? "ok"
        : "failed";
    case "teleport": {
      if (!map.isStandable(action.cellX, action.cellY, info.size)) return "not_standable";
      const here = positionAt(info.motion, nowMs);
      const row = map.transferOut(unitId);
      // 봇은 빼지 않는다(transferOut이 undefined)
      if (!row) return "unsupported_kind";
      if (map.transferIn(row, action.cellX, action.cellY)) return "ok";
      // 못 세우면 원래 칸에 다시 세운다(사라지지 않게). 그것도 안 되면 안전한 곳
      const back = map.transferIn(row, Math.floor(here.x / CELL_UNITS), Math.floor(here.y / CELL_UNITS));
      if (!back) map.relocateToSafety(unitId);
      return "failed";
    }
    default:
      return "failed";
  }
}

/** 원장 자산 코드 모양(DB 검사 조건과 같다) */
const ASSET_PATTERN = /^[a-z][a-z0-9_]{1,47}(:[a-z][a-z0-9_]{1,47})?$/;

export type OpsGrantResult =
  | { ok: true; txId: number; balance: bigint }
  | { ok: false; code: "not_ready" | "owner_not_found" | "bad_asset" | "insufficient" | "failed" };

/**
 * 운영자 지급(+)·회수(−): 주체의 위치 없는 계정 ↔ 시스템 계정 ops:<자산>(기획 D-7021 "운영자 개입은 원장의 별도 사건 종류").
 * 거래 종류 ops_grant·ops_revoke, 열쇠 = ops:<요청 ID>(같은 요청이 두 번 들어가지 않는다). 커밋까지 기다린다.
 * 운영자 ID·사유·양은 감사 기록(services.ts)에 남긴다: 원장 거래 표에는 그 칸이 없다
 */
export async function postOperatorGrant(
  world: World,
  input: { ownerId: number; asset: string; amount: bigint; requestId: string; nowMs: number },
): Promise<OpsGrantResult> {
  const persistence = world.persistence;
  if (!persistence) return { ok: false, code: "not_ready" };
  if (!persistence.owners.has(input.ownerId)) return { ok: false, code: "owner_not_found" };
  if (!ASSET_PATTERN.test(input.asset) || input.amount === 0n) return { ok: false, code: "bad_asset" };
  const ledger = persistence.ledger;
  const owner = ledger.ownerAccount(input.ownerId, input.asset);
  const system = ledger.systemAccount(`ops:${input.asset}`, input.asset);
  try {
    const txId = ledger.post({
      kind: input.amount > 0n ? "ops_grant" : "ops_revoke",
      atMs: input.nowMs,
      key: `ops:${input.requestId}`,
      entries: [
        { account: owner, amount: input.amount },
        { account: system, amount: -input.amount },
      ],
    });
    await persistence.writer.durable();
    return { ok: true, txId, balance: ledger.balance(owner) };
  } catch (error) {
    if (error instanceof LedgerError && error.code === "insufficient")
      return { ok: false, code: "insufficient" };
    throw error;
  }
}
