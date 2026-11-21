// 시뮬 NPC 빈 2차맵 알박기 — 빈틈 2243(질문 docs/questions/2026-11-16-alpak-2.md 2243 가, 일정 docs/worklog/2026/11/16-2210-fixes-1116o.md).
// 기획 D-212 "NPC도 같은 규칙", D-555 1509 "NPC만으로도 그대로 똑같이", D-554 성향, D-572 "정부건물이 없는 땅에는 다른세력이 건설가능하고
// 건설되면 해당 정부가 영토소유 알박기처럼 가능 … 자원과 시간만 날릴수있음", D-574 NPC = 그 세력 도시(귀속 기본).
// 자리 모형(시뮬 세계에는 2차맵이 없어 최소 모형): 합성 격자 칸 하나 = 2차맵 하나(simGrid.ts). 빈 2차맵 = 도시·폐허·자리 칸(앞으로 생길 도시
// ID의 칸)이 아닌 칸. 인접 = 내 도시 칸에서 체비쇼프 반경(설정 칸 npc_claim_radius) 안.
// 1) 후보(options): 상한·조건을 모두 넘은 세력에게 가장 좋은 빈 2차맵 하나(남이 짓는 중이 아닌 것 → 가까운 것 → 내 도시 ID 차례 → 칸 열쇠
//    차례). 상한·조건(설정 칸 npc_claim_*): 동시에 짓는 수(0 = 끔), 이 도시 수부터 멈춤, 세계 도시 + 폐허 + 짓는 중 상한, 시작 뒤 쉬는 날,
//    (도시 + 1) × 도시마다 휴먼 ≤ 휴먼. 점수(성향 가중)·국고 예비금은 판단 틀(npc/brain.ts claimScore)이 본다.
// 2) 짓기 시작(act): 정부 짓기 값(npc_claim_cost)을 국고에서 소각하고(재료 = 국고 [임시] — 서버는 도시 창고 재료, 질문 2331) 짓는 중 정부를
//    둔다. 짓는 시간 = 팩 행정 건물(단계 government) 레벨 1 짓는 시간(경제가 있으면 — 가장 가까운 내 도시의 일 없는 휴먼이 돕는다, NPC 증축과
//    같은 식), 경제가 없으면 npc_claim_build_hours. 끝 시각에 예약 하나(EVENT_CLAIM).
// 3) 다 지음(complete): 그 칸이 아직 비었으면 새 도시 — 가문 마을 모양(서버 npc/houseRuntime.ts foundVillage와 같은 값: 행정 Lv1·연구 0·휴먼
//    없음·주거 = 설정 칸 house_village_housing·지분 1,000주를 그 세력 국고에). 그 칸의 다른 편 짓는 중 정부는 멈춘다(재료 돌려주지 않음 — 2194,
//    서버 haltBuild와 같은 규칙). 짓는 동안 세력이 사라지면 잃는다.
// 같은 입력이면 같은 결과(정수·정해진 차례). 서버는 이 모듈을 쓰지 않는다(서버 자리 = 실제 2차맵, 다 지음 = ruins/landClaim.ts foundPending).
import { buildTimeAt } from "@terra/shared/facilityBuild";
import { withBuilders } from "@terra/shared/facilityRuntime";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { issueShares } from "../society/shares.ts";
import type { Economy } from "./economy.ts";
import { DAY_MS } from "./metrics.ts";
import { idleHumans, lotWeightOf } from "./npcBuild.ts";
import type { NpcClaimRun, SimHooks } from "./npcRun.ts";
import { type GridXY, SIM_GRID_SIZE, type SimSites, gridKey, gridXYOf, isSlot } from "./simGrid.ts";
import type { SimCity, SimFaction, SimWorld } from "./world.ts";

/** 알박기 정부 짓기가 끝나는 예약 종류 */
export const EVENT_CLAIM = "claim_done";

const HOUR_MS = 3_600_000;

/** 짓는 중 정부 하나 */
export interface SimClaim {
  readonly id: number;
  readonly faction: number;
  /** 자리 칸 열쇠(simGrid.ts gridKey) */
  readonly site: number;
  readonly startedAtMs: number;
  readonly doneAtMs: number;
  readonly cost: bigint;
  readonly asset: string;
  readonly eventId: number;
}

export interface ClaimSummary {
  /** 짓기 시작·새 도시가 된·늦어 멈춘·세력이 사라져 잃은 수, 끝에 짓는 중인 수 */
  readonly started: number;
  readonly founded: number;
  readonly halted: number;
  readonly lost: number;
  readonly pending: number;
  /** 국고에서 소각한 정부 짓기 값(자산 → 최소 단위) */
  readonly spent: Record<string, string>;
}

export interface SimClaims extends NpcClaimRun {
  /** EVENT_CLAIM 예약(subject = 알박기 ID) */
  complete(claimId: number, nowMs: number): void;
  check(): string[];
  summary(): ClaimSummary;
}

export interface SimClaimOptions {
  readonly world: SimWorld;
  readonly c: SocietyCoefficients;
  readonly hooks: SimHooks | undefined;
  readonly treasuryAsset: (faction: SimFaction) => string;
  readonly sites: SimSites;
  /** 짓는 시간(ms) — 세력·도와줄 내 도시 */
  readonly buildMs: (faction: SimFaction, sourceCity: number) => number;
  readonly schedule: (atMs: number, claimId: number) => number;
  readonly cancel: (eventId: number) => void;
}

/** 체비쇼프 거리 */
const chebyshev = (a: GridXY, b: GridXY): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * 경제가 있는 시뮬의 짓는 시간: 팩 행정 건물(단계 government, 짓기 재료가 있는 첫 시설) 레벨 1 짓는 시간(무게 × M14) → 그 도시 일 없는 휴먼
 * (npc_build_builders_max까지)이 돕는다(simulator/npcBuild.ts buildPolicy와 같은 식). 행정 건물이 없으면 fallback
 */
export function claimBuildMsOf(
  economy: Economy,
  world: SimWorld,
  c: SocietyCoefficients,
  fallbackMs: number,
): (faction: SimFaction, sourceCity: number) => number {
  let build: Parameters<typeof buildTimeAt>[0] | undefined;
  for (const spec of economy.catalog.facilities.values())
    if (spec.stage === "government" && spec.build) {
      build = spec.build;
      break;
    }
  return (faction, sourceCity) => {
    if (!build) return fallbackMs;
    let guards = 0;
    for (const unitId of faction.units) {
      const unit = world.units.get(unitId);
      if (unit?.city === sourceCity && unit.guard === true) guards += 1;
    }
    const helpers = Math.min(
      Math.max(0, c.npc.buildBuildersMax),
      idleHumans(economy, world, sourceCity, guards),
    );
    const base = buildTimeAt(build, 1, (item) => lotWeightOf(economy, item), c.facilityBuild).ms;
    return withBuilders(base, helpers, c.facilityRuntime);
  };
}

/** 경제가 없을 때 짓는 시간(설정 칸 npc_claim_build_hours) */
export const claimFallbackMs = (c: SocietyCoefficients): number =>
  Math.max(0, Math.trunc(c.npc.claimBuildHours)) * HOUR_MS;

export function createSimClaims(o: SimClaimOptions): SimClaims {
  const { world, c, sites } = o;
  const book = world.book;
  /** 짓는 중(알박기 ID 차례) */
  const pending = new Map<number, SimClaim>();
  /** 세력 → 마지막으로 짓기를 시작한 시각(쉬는 날) */
  const lastStart = new Map<number, number>();
  const counts = { started: 0, founded: 0, halted: 0, lost: 0 };
  const spent = new Map<string, bigint>();
  let nextId = 0;

  /** 도시·폐허가 선 칸 */
  const settled = (): Set<number> => {
    const out = new Set<number>();
    for (const id of [...world.cities.keys(), ...world.ruins.keys()]) {
      const at = sites.xyOf(id);
      if (at) out.add(gridKey(at.x, at.y));
    }
    return out;
  };
  const pendingOf = (factionId: number): number => {
    let n = 0;
    for (const claim of pending.values()) if (claim.faction === factionId) n += 1;
    return n;
  };

  /** 상한·조건을 넘었나(점수·국고 예비금은 판단 틀이 본다) */
  const allowed = (faction: SimFaction, nowMs: number): boolean => {
    const n = c.npc;
    const max = Math.max(0, Math.trunc(n.claimMaxActive));
    if (max === 0 || !faction.alive || faction.cities.size === 0) return false;
    if (faction.cities.size >= Math.max(1, Math.trunc(n.claimMaxCities))) return false;
    if (pendingOf(faction.id) >= max) return false;
    const cap = Math.max(0, Math.trunc(n.claimWorldCities));
    if (cap > 0 && world.cities.size + world.ruins.size + pending.size >= cap) return false;
    const last = lastStart.get(faction.id);
    if (last !== undefined && nowMs < last + Math.max(0, Math.trunc(n.claimCooldownDays)) * DAY_MS)
      return false;
    return faction.units.size >= (faction.cities.size + 1) * Math.max(0, Math.trunc(n.claimHumansPerCity));
  };

  /** 그 세력의 가장 좋은 빈 2차맵(+ 도와줄 내 도시). 없으면 undefined */
  const bestSite = (
    faction: SimFaction,
  ): { site: number; source: number; contested: boolean } | undefined => {
    const radius = Math.min(8, Math.max(1, Math.trunc(c.npc.claimRadius)));
    const taken = settled();
    const mine = new Set<number>();
    const others = new Set<number>();
    for (const claim of pending.values()) (claim.faction === faction.id ? mine : others).add(claim.site);
    let best: { site: number; source: number; contested: boolean; d: number } | undefined;
    for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
      const at = sites.xyOf(cityId);
      if (!at) continue;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = at.x + dx;
          const y = at.y + dy;
          if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= SIM_GRID_SIZE || y >= SIM_GRID_SIZE) continue;
          if (isSlot(x, y)) continue;
          const site = gridKey(x, y);
          if (taken.has(site) || mine.has(site)) continue;
          const contested = others.has(site);
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          // 남이 짓는 중이 아닌 것 → 가까운 것 → 먼저 찾은 것(도시 ID 차례, 그 안은 칸 열쇠 차례로 돈다)
          if (
            !best ||
            Number(contested) < Number(best.contested) ||
            (contested === best.contested && d < best.d)
          )
            best = { site, source: cityId, contested, d };
        }
    }
    return best;
  };

  /** 그 칸이 지금 그 세력이 지을 수 있는 빈 2차맵인가(내 도시 반경 안·자리 칸 아님·도시·폐허 없음·내가 짓는 중 아님) */
  const valid = (faction: SimFaction, site: number): boolean => {
    const at = gridXYOf(site);
    if (site < 0 || at.y >= SIM_GRID_SIZE || isSlot(at.x, at.y) || settled().has(site)) return false;
    for (const claim of pending.values())
      if (claim.faction === faction.id && claim.site === site) return false;
    const radius = Math.min(8, Math.max(1, Math.trunc(c.npc.claimRadius)));
    for (const cityId of faction.cities) {
      const xy = sites.xyOf(cityId);
      if (xy && chebyshev(xy, at) <= radius) return true;
    }
    return false;
  };

  /** 그 칸에서 가장 가까운 내 도시(같으면 작은 ID) */
  const sourceOf = (faction: SimFaction, site: number): number | undefined => {
    const at = gridXYOf(site);
    let best: { id: number; d: number } | undefined;
    for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
      const xy = sites.xyOf(cityId);
      if (!xy) continue;
      const d = chebyshev(xy, at);
      if (!best || d < best.d) best = { id: cityId, d };
    }
    return best?.id;
  };

  const halt = (claim: SimClaim): void => {
    pending.delete(claim.id);
    o.cancel(claim.eventId);
    counts.halted += 1;
  };

  return {
    options(faction, nowMs) {
      if (!allowed(faction, nowMs)) return [];
      const best = bestSite(faction);
      return best ? [{ site: best.site, cost: BigInt(c.npc.claimCost), contested: best.contested }] : [];
    },

    act(faction, site, nowMs) {
      // 판단 뒤 바뀌었을 수 있다: 조건을 다시 보고, 그 칸이 아직 지을 수 있는 빈 2차맵일 때만(남이 짓는 중이어도 된다 — 먼저 다 지은 쪽이 도시)
      if (!allowed(faction, nowMs) || !valid(faction, site)) return false;
      const source = sourceOf(faction, site);
      if (source === undefined) return false;
      const asset = o.treasuryAsset(faction);
      const cost = BigInt(Math.max(0, Math.trunc(c.npc.claimCost)));
      if (book.balanceOf(faction.id, asset) < cost) return false;
      if (cost > 0n) {
        book.post({
          kind: "burn",
          atMs: nowMs,
          entries: [
            { account: book.ownerAccount(faction.id, asset), amount: -cost },
            { account: book.systemAccount(`sink:${asset}`, asset), amount: cost },
          ],
        });
        spent.set(asset, (spent.get(asset) ?? 0n) + cost);
      }
      nextId += 1;
      const doneAtMs = nowMs + Math.max(0, Math.trunc(o.buildMs(faction, source)));
      const claim: SimClaim = {
        id: nextId,
        faction: faction.id,
        site,
        startedAtMs: nowMs,
        doneAtMs,
        cost,
        asset,
        eventId: o.schedule(doneAtMs, nextId),
      };
      pending.set(claim.id, claim);
      lastStart.set(faction.id, nowMs);
      counts.started += 1;
      return true;
    },

    complete(claimId, nowMs) {
      const claim = pending.get(claimId);
      if (!claim) return;
      pending.delete(claimId);
      const faction = world.factions.get(claim.faction);
      if (!faction?.alive) {
        counts.lost += 1;
        return;
      }
      // 그 사이 그 칸에 도시가 섰다(먼저 다 지은 쪽) — 늦은 쪽은 멈춤(보통은 그 도시가 설 때 멈췄다)
      if (settled().has(claim.site)) {
        counts.halted += 1;
        return;
      }
      const city: SimCity = {
        id: world.nextCityId(),
        owner: faction.id,
        start: false,
        // 가문 마을 모양(서버 foundVillage): 주거 = house_village_housing, 행정 Lv1, 연구 0, 휴먼 없음(구인 카드로)
        housing: Math.max(1, Math.trunc(c.house.villageHousing)),
        researchLevel: 0,
        adminLevel: 1,
        recruitDraw: null,
        development: 0,
        nextRebellionMs: nowMs,
      };
      sites.place(city.id, gridXYOf(claim.site));
      world.cities.set(city.id, city);
      faction.cities.add(city.id);
      o.hooks?.cityFounded?.(city.id, 0, nowMs);
      // 지분 1,000주는 최초 설립자(그 세력) 국고(D-575)
      issueShares(book, city.id, [{ owner: faction.id, amount: BigInt(c.sharesPerCity) }], nowMs);
      counts.founded += 1;
      // 그 칸의 다른 편 짓는 중 정부는 멈춘다(2194 → D-572 "적대세력은 아예 건설불가", 재료 돌려주지 않음)
      for (const other of pending.values()) if (other.site === claim.site) halt(other);
    },

    check() {
      const problems: string[] = [];
      const seen = new Map<number, number>();
      for (const id of [...world.cities.keys(), ...world.ruins.keys()].toSorted((a, b) => a - b)) {
        const at = sites.xyOf(id);
        if (!at) continue;
        const key = gridKey(at.x, at.y);
        const before = seen.get(key);
        if (before !== undefined) problems.push(`C1 cities ${before} and ${id} share site ${key}`);
        else seen.set(key, id);
      }
      for (const claim of pending.values()) {
        if (seen.has(claim.site)) problems.push(`C2 claim ${claim.id} on settled site ${claim.site}`);
        if (isSlot(gridXYOf(claim.site).x, gridXYOf(claim.site).y))
          problems.push(`C3 claim ${claim.id} on a city slot ${claim.site}`);
      }
      return problems;
    },

    summary() {
      const out: Record<string, string> = {};
      for (const asset of [...spent.keys()].toSorted()) out[asset] = String(spent.get(asset) ?? 0n);
      return { ...counts, pending: pending.size, spent: out };
    },
  };
}
