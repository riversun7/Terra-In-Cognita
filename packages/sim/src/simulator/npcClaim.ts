// 시뮬 NPC 빈 2차맵 알박기 — 빈틈 2243(질문 docs/questions/2026-11-16-alpak-2.md 2243 가, 일정 docs/worklog/2026/11/16-2210-fixes-1116o.md).
// 기획 D-212 "NPC도 같은 규칙", D-555 1509 "NPC만으로도 그대로 똑같이", D-554 성향, D-572 "정부건물이 없는 땅에는 다른세력이 건설가능하고
// 건설되면 해당 정부가 영토소유 알박기처럼 가능 … 자원과 시간만 날릴수있음", D-574 NPC = 그 세력 도시(귀속 기본).
// 자리 모형(시뮬 세계에는 2차맵이 없어 최소 모형): 합성 격자 칸 하나 = 2차맵 하나(simGrid.ts). 빈 2차맵 = 도시·폐허·자리 칸(앞으로 생길 도시
// ID의 칸)이 아닌 칸. 인접 = 내 도시 칸에서 체비쇼프 반경(설정 칸 npc_claim_radius) 안.
// 1) 후보(options): 상한·조건(claimRules.ts claimGate + 세계 상한 npc_claim_world_cities)을 모두 넘은 세력에게 가장 좋은 빈 2차맵 하나(남이
//    짓는 중이 아닌 것 → 가까운 것 → 내 도시 ID 차례 → 칸 열쇠 차례). 그 칸에서 가장 가까운 내 도시 창고에 재료가 모두 있어야 후보다
//    (아래 2). 점수(성향 가중)·국고 예비금(재료 값)은 판단 틀(npc/brain.ts claimScore)이 본다.
// 2) 짓기 시작(act): 바뀜 (npc-claim-3, 질문 2331 가·2333 가 — D-555 1505·1509·D-564 1626): 예전 국고 값 소각([임시])을 재료로 바꿨다.
//    재료 = 팩 행정 건물 레벨 1 짓기 재료(유저 알박기와 같다), 그 칸에서 가장 가까운 내 도시 창고에서 뺀다(감사 규칙 facility_build — 증축과
//    같은 소각). 창고에 모자라면 후보가 아니고, 판단 끝(prepare)에 그 도시 목표 재고에 넣어 거래 판단이 도시 거래소에서 산다(증축과 같은 길 —
//    국고가 재료 값 × 예비 ‰을 덮을 때만, 2331 가 "모자라면 NPC 증축처럼 도시 거래소에서 산다"). 다 사면 다음 판단의 후보다. 시뮬에는 보이는
//    운반꾼이 없어 재료는 시간 셈으로 옮긴다(D-564 1626): 짓기는 운반 시간(claimRules.ts claimHaulMs) 뒤에 시작하고, 끝 = 지금 + 운반 +
//    짓는 시간(claimBuildMs — 그 도시 일 없는 휴먼이 나르고 돕는다). 끝 시각에 예약 하나(EVENT_CLAIM). 나르는 동안 그 칸에 도시가 서면 늦은 쪽
//    — 재료는 돌려주지 않는다(D-572 "자원과 시간만 날릴수있음").
//    경제가 없는 시나리오(war16·stub16)는 창고·재료가 없어 알박기 후보가 없다(supply 없음 — 증축도 경제가 있을 때만 돈다, 질문 2381).
// 3) 다 지음(complete): 그 칸이 아직 비었으면 새 도시 — 가문 마을 모양(서버 npc/houseRuntime.ts foundVillage와 같은 값: 행정 Lv1·연구 0·주거 =
//    설정 칸 house_village_housing). 바뀜 (D-580 — 질문 2335 나, npc-claim-3): 알박기는 NPC 가문이 짓는다 — 다 지으면 그 가문이 새 세력이 되고
//    (봉신 | 독립 + 체제는 가문 성향 규칙식 — 마을 세우기와 같은 foundingChoice), 재료를 낸 도시의 휴먼 가운데 가문원(founders명)이 옮기고, 지분
//    1,000주는 그 가문(최초 설립자, D-575)이다(society.ts claimHouse). 예전: 늘 그 세력 도시·지분은 그 세력 국고. 그 칸의 다른 편 짓는 중 정부는
//    멈춘다(재료 돌려주지 않음 — 2194, 서버 haltBuild와 같은 규칙). 짓는 동안 세력이 사라지면 잃는다.
// 같은 입력이면 같은 결과(정수·정해진 차례). 서버는 이 모듈을 쓰지 않는다(서버 자리 = 실제 2차맵, 다 지음 = ruins/landClaim.ts foundPending —
// 재료·시간 규칙은 claimRules.ts를 같이 쓴다).
import type { BuildStackJson } from "@terra/shared/facilityBuild";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { issueShares } from "../society/shares.ts";
import { itemAsset } from "./catalog.ts";
import {
  claimBuildMs,
  claimGate,
  claimHaulMs,
  claimHelpers,
  claimMaterialPlan,
  claimMaterialsOf,
  claimValue,
  claimWeightG,
} from "./claimRules.ts";
import type { Economy } from "./economy.ts";
import type { NpcClaimRun, SimHooks } from "./npcRun.ts";
import type { SocietyRun } from "./societyTypes.ts";
import { type GridXY, SIM_GRID_SIZE, type SimSites, gridKey, gridXYOf, isSlot } from "./simGrid.ts";
import type { SimCity, SimFaction, SimWorld } from "./world.ts";

/** 알박기 정부 짓기가 끝나는 예약 종류 */
export const EVENT_CLAIM = "claim_done";

/** 짓는 중 정부 하나(나르는 중 포함) */
export interface SimClaim {
  readonly id: number;
  readonly faction: number;
  /** 자리 칸 열쇠(simGrid.ts gridKey) */
  readonly site: number;
  /** 재료를 낸 내 도시 */
  readonly source: number;
  readonly startedAtMs: number;
  /** 재료가 닿아 짓기를 시작하는 시각 */
  readonly arriveAtMs: number;
  readonly doneAtMs: number;
  readonly eventId: number;
}

export interface ClaimSummary {
  /** 짓기 시작·새 도시가 된·늦어 멈춘·세력이 사라져 잃은 수, 끝에 짓는 중(나르는 중 포함)인 수 */
  readonly started: number;
  readonly founded: number;
  readonly halted: number;
  readonly lost: number;
  readonly pending: number;
  /** 도시 창고에서 뺀 재료(자산 → 기본 단위 수, 바뀜 npc-claim-3 — 예전 국고 값) */
  readonly spent: Record<string, string>;
}

export interface SimClaims extends NpcClaimRun {
  /** EVENT_CLAIM 예약(subject = 알박기 ID) */
  complete(claimId: number, nowMs: number): void;
  check(): string[];
  summary(): ClaimSummary;
}

/** 알박기 재료 자리(도시 창고)·시간 — 경제가 있을 때만(simClaimSupply). 시험은 가짜를 넣는다 */
export interface ClaimSupply {
  /** 행정 건물 레벨 1 재료. 없으면(팩에 행정 건물 없음) 알박기 없음 */
  readonly materials: readonly BuildStackJson[] | undefined;
  /** 꺼낼 아이템별 수량(그 세력 그 도시 창고). 모자라면 undefined */
  plan(faction: SimFaction, cityId: number): Map<string, bigint> | undefined;
  /** 재료 값(국고 예비금 판단) */
  value(cityId: number): bigint;
  /** 운반 시간(ms) — 그 도시에서 거리(2차맵 수) */
  haulMs(faction: SimFaction, cityId: number, mapDistance: number): number;
  /** 짓는 시간(ms) — 그 도시 사람이 돕는다 */
  buildMs(faction: SimFaction, cityId: number): number;
  /**
   * 그 도시 목표 재고의 알박기 재료를 정한다(재료를 사게 — 증축 buildWants와 같은 길, 질문 2331 가). want = true면 넣고(국고가 재료 값 × 예비
   * ‰을 덮을 때만), false면 뺀다. 넣었나
   */
  want(faction: SimFaction, cityId: number, want: boolean): boolean;
}

export interface SimClaimOptions {
  readonly world: SimWorld;
  readonly c: SocietyCoefficients;
  readonly hooks: SimHooks | undefined;
  readonly sites: SimSites;
  /** 재료 자리·시간. 없으면(경제 없는 시나리오) 후보가 없다 */
  readonly supply: ClaimSupply | undefined;
  /** 다 지으면 그 도시를 받는 NPC 가문을 세운다(D-580, society.ts claimHouse). 없으면(시험) 그 세력 도시 */
  readonly house?: SocietyRun["claimHouse"] | undefined;
  readonly schedule: (atMs: number, claimId: number) => number;
  readonly cancel: (eventId: number) => void;
}

/** 체비쇼프 거리 */
const chebyshev = (a: GridXY, b: GridXY): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** 경제가 있는 시뮬의 재료 자리·시간(claimRules.ts — 서버와 같은 함수) */
export function simClaimSupply(economy: Economy, world: SimWorld, c: SocietyCoefficients): ClaimSupply {
  const materials = claimMaterialsOf(economy);
  const weight = materials ? claimWeightG(economy, materials) : 0n;
  return {
    materials,
    plan: (faction, cityId) =>
      materials
        ? claimMaterialPlan(economy, materials, (item) =>
            world.book.balanceOf(faction.id, itemAsset(item), cityId),
          )
        : undefined,
    value: (cityId) => (materials ? claimValue(economy, cityId, materials) : 0n),
    haulMs: (faction, cityId, distance) =>
      claimHaulMs(weight, distance, claimHelpers(economy, world, faction, cityId, c), c),
    buildMs: (faction, cityId) => claimBuildMs(economy, c, claimHelpers(economy, world, faction, cityId, c)),
    want(faction, cityId, want) {
      const wants = (economy.claimWants ??= new Map());
      wants.delete(cityId);
      if (!want || !materials) return false;
      const asset = economy.currencyOf.get(faction.id) ?? economy.base;
      const funds = world.book.balanceOf(faction.id, asset);
      if (funds * 1000n < claimValue(economy, cityId, materials) * BigInt(c.npc.reservePm)) return false;
      const need = new Map<string, bigint>();
      for (const stack of materials)
        need.set(itemAsset(stack.item), (need.get(itemAsset(stack.item)) ?? 0n) + BigInt(stack.qty));
      wants.set(cityId, need);
      return true;
    },
  };
}

export function createSimClaims(o: SimClaimOptions): SimClaims {
  const { world, c, sites, supply } = o;
  const book = world.book;
  /** 짓는 중(알박기 ID 차례) */
  const pending = new Map<number, SimClaim>();
  /** 세력 → 마지막으로 짓기를 시작한 시각(쉬는 날) */
  const lastStart = new Map<number, number>();
  /** 세력 → 알박기 재료를 사려고 목표 재고에 넣은 도시(prepare) */
  const wanted = new Map<number, number>();
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

  /** 상한·조건을 넘었나(점수·국고 예비금은 판단 틀이 본다). 재료 자리가 없으면(경제 없음) 늘 아니다 */
  const allowed = (faction: SimFaction, nowMs: number): boolean => {
    if (!supply?.materials) return false;
    if (!claimGate(faction, nowMs, pendingOf(faction.id), lastStart.get(faction.id), c)) return false;
    const cap = Math.max(0, Math.trunc(c.npc.claimWorldCities));
    return cap === 0 || world.cities.size + world.ruins.size + pending.size < cap;
  };

  /** 그 세력의 가장 좋은 빈 2차맵(+ 재료를 낼 내 도시 = 그 칸에서 가장 가까운 내 도시). 없으면 undefined */
  const bestSite = (
    faction: SimFaction,
  ): { site: number; source: number; contested: boolean; d: number } | undefined => {
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
    // 재료를 내는 도시 = 그 칸에서 가장 가까운 내 도시(같으면 작은 ID — 처음 찾은 도시와 다를 수 있다)
    if (!best) return undefined;
    const source = sourceOf(faction, best.site);
    return source === undefined ? undefined : { ...best, ...source };
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

  /** 그 칸에서 가장 가까운 내 도시와 거리(같으면 작은 ID) */
  function sourceOf(faction: SimFaction, site: number): { source: number; d: number } | undefined {
    const at = gridXYOf(site);
    let best: { source: number; d: number } | undefined;
    for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
      const xy = sites.xyOf(cityId);
      if (!xy) continue;
      const d = chebyshev(xy, at);
      if (!best || d < best.d) best = { source: cityId, d };
    }
    return best;
  }

  const halt = (claim: SimClaim): void => {
    pending.delete(claim.id);
    o.cancel(claim.eventId);
    counts.halted += 1;
  };

  return {
    options(faction, nowMs) {
      if (!supply || !allowed(faction, nowMs)) return [];
      const best = bestSite(faction);
      // 재료가 그 도시 창고에 모두 있어야 후보(모자라면 prepare가 산다)
      if (!best || !supply.plan(faction, best.source)) return [];
      return [{ site: best.site, cost: supply.value(best.source), contested: best.contested }];
    },

    prepare(faction, nowMs) {
      if (!supply) return;
      const before = wanted.get(faction.id);
      wanted.delete(faction.id);
      // 상한·자리를 넘었고 재료를 낼 도시 창고에 모자랄 때만 산다(재료가 있으면 다음 판단의 후보다)
      const best = allowed(faction, nowMs) ? bestSite(faction) : undefined;
      const buy = best !== undefined && supply.plan(faction, best.source) === undefined;
      if (before !== undefined && (!buy || before !== best?.source)) supply.want(faction, before, false);
      if (buy && best && supply.want(faction, best.source, true)) wanted.set(faction.id, best.source);
    },

    act(faction, site, nowMs) {
      // 판단 뒤 바뀌었을 수 있다: 조건을 다시 보고, 그 칸이 아직 지을 수 있는 빈 2차맵일 때만(남이 짓는 중이어도 된다 — 먼저 다 지은 쪽이 도시)
      if (!supply || !allowed(faction, nowMs) || !valid(faction, site)) return false;
      const from = sourceOf(faction, site);
      if (!from) return false;
      const plan = supply.plan(faction, from.source);
      if (!plan) return false;
      // 시간은 재료를 빼기 전 그 도시 사람으로 셈한다(빼기는 사람 수를 바꾸지 않는다)
      const haul = Math.max(0, Math.trunc(supply.haulMs(faction, from.source, from.d)));
      const build = Math.max(0, Math.trunc(supply.buildMs(faction, from.source)));
      // 재료를 도시 창고에서 뺀다(감사 규칙 facility_build — 증축과 같은 소각, 나르는 동안 수레에 실린 재료)
      const entries: { account: number; amount: bigint }[] = [];
      for (const [item, qty] of plan) {
        if (qty <= 0n) continue;
        const asset = itemAsset(item);
        entries.push({ account: book.ownerAccount(faction.id, asset, from.source), amount: -qty });
        entries.push({ account: book.systemAccount(`sink:${asset}`, asset), amount: qty });
        spent.set(asset, (spent.get(asset) ?? 0n) + qty);
      }
      if (entries.length > 0) book.post({ kind: "facility_build", atMs: nowMs, entries });
      // 다 샀다: 그 도시 목표 재고의 알박기 재료를 뺀다
      const wantedCity = wanted.get(faction.id);
      if (wantedCity !== undefined) {
        supply.want(faction, wantedCity, false);
        wanted.delete(faction.id);
      }
      nextId += 1;
      const arriveAtMs = nowMs + haul;
      const doneAtMs = arriveAtMs + build;
      const claim: SimClaim = {
        id: nextId,
        faction: faction.id,
        site,
        source: from.source,
        startedAtMs: nowMs,
        arriveAtMs,
        doneAtMs,
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
      // 가문 마을 모양(서버 foundVillage): 주거 = house_village_housing, 행정 Lv1, 연구 0
      const settle = (owner: SimFaction): number => {
        const city: SimCity = {
          id: world.nextCityId(),
          owner: owner.id,
          start: false,
          housing: Math.max(1, Math.trunc(c.house.villageHousing)),
          researchLevel: 0,
          adminLevel: 1,
          recruitDraw: null,
          development: 0,
          nextRebellionMs: nowMs,
        };
        sites.place(city.id, gridXYOf(claim.site));
        world.cities.set(city.id, city);
        return city.id;
      };
      if (o.house) {
        // D-580(질문 2335 나): 지은 NPC 가문이 새 세력 — 봉신 | 독립은 가문 성향 규칙식, 지분은 그 가문(society.ts claimHouse)
        o.house(faction, claim.source, nowMs, settle);
      } else {
        // 사회 규칙이 없을 때(시험): 그 세력 도시, 지분은 그 세력 국고(옛 규칙)
        const cityId = settle(faction);
        faction.cities.add(cityId);
        o.hooks?.cityFounded?.(cityId, 0, nowMs);
        issueShares(book, cityId, [{ owner: faction.id, amount: BigInt(c.sharesPerCity) }], nowMs);
      }
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
