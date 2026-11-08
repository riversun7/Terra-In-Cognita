// 운영자 콘솔의 월드 쪽(docs/adr/2026-11-08-operator-console.md) — 메모리 월드에서 읽기(유닛 목록·현황·원장 합)와 운영자 통제
// (유닛 멈추기·안전한 곳으로·치료·같은 2차맵 안 순간이동, 원장 지급·회수). 권한·감사 기록은 부르는 쪽(services.ts)이 본다.
// 유닛 지우기는 두지 않는다: 종류마다 정리할 것(NPC 사회 런타임 거울·보유 물건·스킬·신앙·화물)이 달라 이 층에서 안전하게 못 한다(ADR 4절).
import type { OpsOwnerKind, OpsUnitResult } from "@terra/shared/ops";
import { CELL_UNITS, LedgerError, type SizeClass, positionAt } from "@terra/sim";
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
}

export interface OpsUnitFilter {
  /** 이 소유 주체들만(없으면 모두) */
  ownerIds?: ReadonlySet<number> | undefined;
  ownerKind?: OpsOwnerKind | undefined;
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
  };
}

/** 조건에 맞는 유닛(ID 차례)과 전체 수. 10만 유닛도 한 번 훑는다(조회 한 번에 수십 ms — 운영 조회라 받아들인다) */
export function listUnits(
  world: World,
  filter: OpsUnitFilter,
  page: { limit: number; offset: number },
  nowMs: number,
): { units: OpsUnitCore[]; total: number } {
  const ids: { id: number; map: SecondMap }[] = [];
  for (const map of world.maps.values()) {
    if (filter.mapKey !== undefined && map.mapKey !== filter.mapKey) continue;
    map.forEachUnit((unit) => {
      if (filter.ownerIds && !filter.ownerIds.has(unit.ownerId)) return;
      if (filter.kind !== undefined && unit.kind !== filter.kind) return;
      if (filter.ownerKind !== undefined && ownerKindOf(world, unit.ownerId).kind !== filter.ownerKind)
        return;
      ids.push({ id: unit.id, map });
    });
  }
  ids.sort((a, b) => a.id - b.id);
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
      job: { kind: number; phase: number; progressMs: number; fatigue: number };
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
    job: {
      kind: info.job.job,
      phase: info.job.phase,
      progressMs: info.job.progressMs,
      fatigue: info.job.fatigue,
    },
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
