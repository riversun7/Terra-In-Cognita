// NPC 도시 증축 실행 — 기획 D-534(질문 1101 나 "NPC 증축은 유저와 같은 규칙", D-212), docs/adr/2026-11-11-city-building-layout.md
// "바뀜 (2026-11-12, NPC 증축)". 시뮬(run.ts)과 서버(apps/server/src/npc/cityBuild.ts)가 같은 판단 함수(buildPolicy)를 판단 예약마다 부른다.
// 무엇을 지을지는 npc/build.ts chooseCityBuild(주거·식량·배후지 원자재 몫), 재료·짓는 시간·일꾼은 플레이어 짓기와 같은 식이다:
// - 재료 = 팩 시설 레벨 1 구간(buildCostAt), 그 도시 창고에서 뺀다(서버는 플레이어 짓기와 같은 자리 차례 — 도시 창고·창고 시설).
// - 재료가 모자라면 그 재료를 도시 목표 재고에 넣는다(Economy.buildWants → npcTrade.ts cityTargets): 거래 판단이 국고로 도시 매입 호가·수입·
//   내 도시끼리 나누기를 한다. 모자란 재료 값(지난 값) × 예비 ‰만큼 국고가 있고, 모자란 재료마다 세계 어느 시설이 내는 물건일 때만 넣는다
//   (NPC 판단 reservePm).
// - 짓는 시간 = buildTimeAt(무게 × M14) → 일 없는 휴먼(설정 칸 npc_build_builders_max까지)을 일꾼으로 withBuilders.
// - 도시마다 한 번에 하나. 다 지은 건물은 그 세력의 다음 판단 때 생산에 든다(settle — 시뮬·서버 같은 때).
// 자리·건물 칸은 실행 자리(NpcBuilder)가 정한다: 시뮬은 경제 시설만(자리 없음), 서버는 전략 배치 함수(facilities/cityLayout.ts)와 건물 서비스.
import { materialOfFacility } from "@terra/shared/catchment";
import { type BuildStackJson, buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import { withBuilders } from "@terra/shared/facilityRuntime";
import { type BuildOption, chooseCityBuild } from "../npc/build.ts";
import { itemAsset, lotSizeOf } from "./catalog.ts";
import { type Economy, scheduleProduce, workerEffects } from "./economy.ts";
import type { SimLoop } from "./loop.ts";
import type { NpcContext, SimEvent } from "./npcRun.ts";
import { marketRefPrice } from "./npcTrade.ts";
import type { SimFaction, SimWorld } from "./world.ts";

/** 도시 하나의 짓기 자리 */
export interface NpcBuildSite {
  /** 그 세력이 그 도시에 가진 시설 수(짓는 중 포함, 시설 ID → 수) */
  readonly counts: ReadonlyMap<string, number>;
  /** 짓는 중(다 지었지만 아직 생산에 넣지 않은 것 포함) */
  readonly busy: boolean;
}

/** 짓기 실행 자리(시뮬·서버) */
export interface NpcBuilder {
  /** 그 세력 도시의 다 지은 짓기를 생산에 넣는다(판단마다 처음에). 넣은 수 */
  settle(faction: SimFaction, nowMs: number): number;
  site(faction: SimFaction, cityId: number): NpcBuildSite | undefined;
  /** 그 도시에서 재료를 모두 꺼낼 수 있나 */
  has(faction: SimFaction, cityId: number, materials: readonly BuildStackJson[]): boolean;
  /** 재료를 빼고 짓기를 건다(끝 = nowMs + ms). 못 하면 false(아무것도 바꾸지 않는다) */
  start(
    faction: SimFaction,
    cityId: number,
    facility: string,
    materials: readonly BuildStackJson[],
    ms: number,
    nowMs: number,
  ): boolean;
}

export interface NpcBuildRun {
  readonly builder: NpcBuilder;
  readonly economy: Economy;
}

/** 짓기 재료가 있는 시설(팩 차례) */
export function buildOptions(economy: Economy): BuildOption[] {
  const out: BuildOption[] = [];
  for (const spec of economy.catalog.facilities.values())
    if (spec.build) out.push({ facility: spec.id, stage: spec.stage, gather: spec.gather !== undefined });
  return out;
}

/** 재료 묶음 하나의 무게(g) = 기본 단위 무게 × 묶음 크기(서버 건물 목록 weightOf와 같다). 모르면 undefined */
function lotWeightOf(economy: Economy, item: string): number | undefined {
  const asset = itemAsset(item);
  const unit = economy.catalog.weightG.get(asset);
  return unit === undefined ? undefined : Number(unit * lotSizeOf(economy.catalog, asset));
}

/** 그 도시 일 없는 휴먼(경비대·시설 일꾼 빼고) */
export function idleHumans(economy: Economy, world: SimWorld, cityId: number, guards: number): number {
  let working = 0;
  for (const facility of economy.facilities.values())
    if (facility.city === cityId) working += facility.workers;
  return Math.max(0, (economy.cityUnits.get(cityId) ?? 0) - guards - working);
}

/**
 * 세계 어디선가 나오는 물건(시설 레시피 산출, 추첨 레시피면 그 사다리의 물건) — 구할 길이 있는 재료인지 본다. 판단 한 번에 한 번 셈한다
 */
function producedAssets(economy: Economy): Set<string> {
  const out = new Set<string>();
  for (const facility of economy.facilities.values()) {
    for (const stack of facility.recipe.outputs) out.add(stack.asset);
    const roll = facility.recipe.gather;
    const ladder = roll ? economy.catalog.gatherLadders.get(roll.subcategory) : undefined;
    for (const tier of ladder ?? []) for (const asset of tier) out.add(asset);
  }
  return out;
}

/** 채집 시설 → 배후지 몫(땅 몫 × 받은 몫 ÷ 1000). 배후지를 모르면 undefined */
function gatherPmOf(
  economy: Economy,
  cityId: number,
  options: readonly BuildOption[],
): Map<string, number> | undefined {
  const city = economy.catchment?.cities.get(cityId);
  if (!city) return undefined;
  const out = new Map<string, number>();
  for (const option of options) {
    const material = option.gather ? materialOfFacility(option.facility) : undefined;
    if (material)
      out.set(
        option.facility,
        Math.floor((Math.min(1000, city.landPm[material]) * Math.min(1000, city.supplyPm[material])) / 1000),
      );
  }
  return out;
}

/**
 * 증축 판단(세력 판단마다, 구인 규칙식 다음): 다 지은 것을 생산에 넣고, 도시마다(ID 차례) 짓는 중이 아니면 지을 것을 골라 재료가 있으면 짓고,
 * 없으면 재료를 도시 목표 재고에 넣는다
 */
export function buildPolicy(ctx: NpcContext, run: NpcBuildRun, faction: SimFaction, nowMs: number): void {
  const { economy, builder } = run;
  const { world, c } = ctx;
  ctx.counts.buildsDone += builder.settle(faction, nowMs);
  if (c.npc.buildMaxBuildings <= 0) return;
  const wants = (economy.buildWants ??= new Map());
  const options = buildOptions(economy);
  const guards = new Map<number, number>();
  for (const unitId of faction.units) {
    const unit = world.units.get(unitId);
    if (unit?.guard === true) guards.set(unit.city, (guards.get(unit.city) ?? 0) + 1);
  }
  const treasuryAsset = economy.currencyOf.get(faction.id) ?? economy.base;
  let funds = world.book.balanceOf(faction.id, treasuryAsset);
  const produced = producedAssets(economy);
  for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
    wants.delete(cityId);
    const site = builder.site(faction, cityId);
    if (!site || site.busy) continue;
    const pick = chooseCityBuild(
      {
        humans: economy.cityUnits.get(cityId) ?? 0,
        workers: Math.max(0, (economy.cityUnits.get(cityId) ?? 0) - (guards.get(cityId) ?? 0)),
        foodPm: ctx.hooks?.foodPmOf?.(cityId) ?? 1000,
        counts: site.counts,
        gatherPm: gatherPmOf(economy, cityId, options),
      },
      options,
      faction.traits,
      c.npc,
      { bedsPerLevel: c.logistics.lodgingBedsPerLevel },
    );
    const build = pick === undefined ? undefined : economy.catalog.facilities.get(pick)?.build;
    if (pick === undefined || !build) continue;
    const materials = buildCostAt(build, 1).filter((stack) => stack.qty > 0);
    if (builder.has(faction, cityId, materials)) {
      const helpers = Math.min(
        Math.max(0, c.npc.buildBuildersMax),
        idleHumans(economy, world, cityId, guards.get(cityId) ?? 0),
      );
      const raw = buildTimeAt(build, 1, (item) => lotWeightOf(economy, item), c.facilityBuild).ms;
      const ms = withBuilders(raw, helpers, c.facilityRuntime);
      if (builder.start(faction, cityId, pick, materials, ms, nowMs)) ctx.counts.builds += 1;
      continue;
    }
    // 재료를 산다: 모자란 몫의 지난 값 × 예비 ‰만큼 국고가 있을 때만 도시 목표 재고에 넣는다(같은 판단의 다른 도시 몫은 뺀다).
    // 구할 길이 없는 재료(세계 어느 시설도 내지 않는 물건)면 넣지 않는다 — 채워지지 않는 매수 호가에 국고가 묶인다
    let cost = 0n;
    let obtainable = true;
    const need = new Map<string, bigint>();
    for (const stack of materials) {
      const asset = itemAsset(stack.item);
      const qty = BigInt(stack.qty);
      need.set(asset, (need.get(asset) ?? 0n) + qty);
      const short = qty - world.book.balanceOf(faction.id, asset, cityId);
      if (short <= 0n) continue;
      if (!produced.has(asset) && world.book.balanceOf(faction.id, asset, cityId) <= 0n) obtainable = false;
      const lot = lotSizeOf(economy.catalog, asset);
      cost += ((short + lot - 1n) / lot) * marketRefPrice(economy, cityId, asset);
    }
    if (!obtainable || funds * 1000n < cost * BigInt(c.npc.reservePm)) continue;
    funds -= cost;
    wants.set(cityId, need);
  }
}

/** 시뮬 짓기 자리: 경제 시설만(자리 없음). 다 지으면 그 시설의 첫 레시피로 레벨 1, 일꾼 = 일 없는 휴먼(자리 수까지) */
export function simNpcBuilder(economy: Economy, world: SimWorld, loop: SimLoop<SimEvent>): NpcBuilder {
  /** 도시 → 짓는 것 */
  const active = new Map<number, { facility: string; doneAtMs: number }>();
  /** 도시 → 생산하지 않는 다 지은 시설 수(숙소 등) */
  const extra = new Map<number, Map<string, number>>();
  let nextId = 0;
  /** 시나리오 시설 ID(1부터 센 차례)와 겹치지 않는 시뮬 증축 시설 ID */
  const BUILT_FACILITY_BASE = 1_000_000;
  const firstRecipe = (facility: string) => {
    for (const recipe of economy.catalog.recipes.values()) if (recipe.facility === facility) return recipe;
    return undefined;
  };
  const guardsIn = (cityId: number): number => {
    let n = 0;
    for (const unit of world.units.values()) if (unit.city === cityId && unit.guard === true) n += 1;
    return n;
  };
  const activate = (cityId: number, facility: string, nowMs: number): void => {
    const spec = economy.catalog.facilities.get(facility);
    const recipe = firstRecipe(facility);
    if (!spec || !recipe) {
      const counts = extra.get(cityId) ?? new Map<string, number>();
      counts.set(facility, (counts.get(facility) ?? 0) + 1);
      extra.set(cityId, counts);
      return;
    }
    nextId += 1;
    const id = BUILT_FACILITY_BASE + nextId;
    const built = {
      id,
      city: cityId,
      recipe,
      level: 1,
      workers: Math.min(spec.slotsPerLevel, idleHumans(economy, world, cityId, guardsIn(cityId))),
      ...workerEffects(spec.gather, { level: 1 }, economy.gather),
      batches: 0,
      eventId: undefined,
    };
    economy.facilities.set(id, built);
    scheduleProduce(economy, world, loop, built, nowMs);
  };
  const has = (faction: SimFaction, cityId: number, materials: readonly BuildStackJson[]): boolean =>
    materials.every(
      (stack) => world.book.balanceOf(faction.id, itemAsset(stack.item), cityId) >= BigInt(stack.qty),
    );
  return {
    has,
    settle(faction, nowMs) {
      let done = 0;
      for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
        const job = active.get(cityId);
        if (!job || job.doneAtMs > nowMs) continue;
        active.delete(cityId);
        activate(cityId, job.facility, nowMs);
        done += 1;
      }
      return done;
    },
    site(_faction, cityId) {
      if (!world.cities.has(cityId)) return undefined;
      const counts = new Map(extra.get(cityId) ?? []);
      for (const facility of economy.facilities.values())
        if (facility.city === cityId)
          counts.set(facility.recipe.facility, (counts.get(facility.recipe.facility) ?? 0) + 1);
      const job = active.get(cityId);
      if (job) counts.set(job.facility, (counts.get(job.facility) ?? 0) + 1);
      return { counts, busy: job !== undefined };
    },
    start(faction, cityId, facility, materials, ms, nowMs) {
      if (active.has(cityId) || !has(faction, cityId, materials)) return false;
      const { book } = world;
      const entries: { account: number; amount: bigint }[] = [];
      for (const stack of materials) {
        const asset = itemAsset(stack.item);
        const qty = BigInt(stack.qty);
        entries.push({ account: book.ownerAccount(faction.id, asset, cityId), amount: -qty });
        entries.push({ account: book.systemAccount(`sink:${asset}`, asset), amount: qty });
      }
      if (entries.length > 0) book.post({ kind: "facility_build", atMs: nowMs, entries });
      active.set(cityId, { facility, doneAtMs: nowMs + ms });
      return true;
    },
  };
}
