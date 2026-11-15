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
// 바뀜 (2026-11-12, 기획 D-535 — 질문 1142 다·1143 나·1146 나·1114 가, 1131 나): 도시마다 한 번에 하나 — 수리(상태 문턱 아래, 플레이어 수리와 같은
// 재료·시간) → 짓기(나라 성격 목표·주거·식량·배후지, 건물 수 상한 = 도시 등급 표) → 상한에 닿았으면 레벨 올리기(플레이어 레벨업과 같은 재료·시간).
// 모자란 재료는 셋 모두 같은 길(도시 목표 재고)로 산다. 숙소 침대는 인구 상한에 더한다(시뮬 짓기 자리가 도시 beds에 적는다 — 시뮬 도시에는 씨앗
// 숙소가 없다).
// 바뀜 (2026-11-15, 기획 D-562 1563·1564 "레벨 0은 T0~T1 인정"): 원자재 T0~T1 재료 줄은 같은 원자재 종류의 T0~T1을 모두 받는다(있나·빼기·구할
// 길·모자란 몫, @terra/shared/bareHandMaterials — 서버 건물 서비스와 같은 함수).
import { allocateMaterials } from "@terra/shared/bareHandMaterials";
import { materialOfFacility } from "@terra/shared/catchment";
import {
  type BuildStackJson,
  FACILITY_LEVEL_MAX,
  buildCostAt,
  buildTimeAt,
} from "@terra/shared/facilityBuild";
import {
  CONDITION_FULL,
  repairMaterialsFor,
  repairRestorePpm,
  repairTimeMs,
  withBuilders,
} from "@terra/shared/facilityRuntime";
import { DEFAULT_BUILDING_GATHER, plotSlots } from "@terra/shared/gatherMath";
import { cityGrade } from "@terra/shared/territory";
import {
  BUILD_LODGING,
  BUILD_UNCOUNTED_STAGES,
  type BuildOption,
  type SiteFacility,
  buildingCapOf,
  chooseCityBuild,
  chooseCityPlot,
  chooseCityRepair,
  countedBuildings,
  rankCityUpgrades,
} from "../npc/build.ts";
import type { RecipeSpec } from "../economy/production.ts";
import { cityHousingCap } from "../society/logistics.ts";
import { itemAsset, lotSizeOf } from "./catalog.ts";
import { type Economy, scheduleProduce, workerEffects } from "./economy.ts";
import type { SimLoop } from "./loop.ts";
import type { NpcContext, SimEvent } from "./npcRun.ts";
import { retierFacility } from "./npcGatherTier.ts";
import { marketRefPrice } from "./npcTrade.ts";
import type { SimFaction, SimWorld } from "./world.ts";

/** 도시 하나의 짓기 자리 */
export interface NpcBuildSite {
  /** 그 세력이 그 도시에 가진 시설 수(짓는 중 포함, 시설 ID → 수) */
  readonly counts: ReadonlyMap<string, number>;
  /** 짓는 중(다 지었지만 아직 생산에 넣지 않은 것 포함 — 레벨 올리기·수리도) */
  readonly busy: boolean;
  /** 다 지은 시설(레벨 올리기·수리 후보, 1146 나·1114 가). 없으면 레벨을 올리지도 고치지도 않는다 */
  readonly facilities?: readonly SiteFacility[] | undefined;
  /** 그 도시 숙소 침대 합(쉼터 자리). 없으면 숙소 수 × 레벨당 침대 */
  readonly beds?: number | undefined;
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
  /** 레벨 올리기(1146 나): 재료를 빼고 한 레벨 올리기 작업을 건다. 못 하면 false. 없으면 레벨을 올리지 않는다 */
  upgrade?(
    faction: SimFaction,
    cityId: number,
    key: number,
    materials: readonly BuildStackJson[],
    ms: number,
    nowMs: number,
  ): boolean;
  /**
   * 면적 모듈 붙이기(기획 D-569 1768 — 플레이어 facility_plot과 같은 재료 = 레벨 1 짓기 재료·시간 = 레벨 1 짓는 시간): 재료를 빼고 모듈 하나를 붙이는
   * 작업을 건다. 못 하면 false. 없으면 붙이지 않는다
   */
  plot?(
    faction: SimFaction,
    cityId: number,
    key: number,
    materials: readonly BuildStackJson[],
    ms: number,
    nowMs: number,
  ): boolean;
  /** 수리(1114 가): 재료를 빼고 restorePpm만큼 고치는 작업을 건다. 못 하면 false. 없으면 고치지 않는다 */
  repair?(
    faction: SimFaction,
    cityId: number,
    key: number,
    materials: readonly BuildStackJson[],
    restorePpm: number,
    ms: number,
    nowMs: number,
  ): boolean;
}

export interface NpcBuildRun {
  readonly builder: NpcBuilder;
  readonly economy: Economy;
  /**
   * 나라 성격 목표(1142 다): 그 세력 그 도시의 시설 ID → 목표 수(국가 프리셋 특산 줄 수·국력 등급 처음 시설 수 가운데 큰 값 — 서버, 시나리오 세력
   * 묶음 도시 계획 — 시뮬). 없으면 목표 없음
   */
  readonly targetsOf?:
    | ((faction: SimFaction, cityId: number) => ReadonlyMap<string, number> | undefined)
    | undefined;
}

/** 수리 한 번에 이을 걸음 수 상한(가득까지 — repairRestorePpm이 모자란 몫에서 자른다) */
const REPAIR_ALL_STEPS = CONDITION_FULL;

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

/** 목록마다 한 번 셈한 레벨 재료 가공 시설(levelSupplyFacilities) */
type SupplyCatalog = Pick<Economy["catalog"], "facilities" | "recipes">;
const levelSupplyCache = new WeakMap<SupplyCatalog, ReadonlyMap<string, RecipeSpec>>();

/**
 * 레벨 재료 가공 시설(질문 1186 나, 기획 D-540): 레벨 2 짓기 재료(팩 레벨 구간 buildCostAt(build, 2) — 판자·벽돌)를 그 시설 첫 레시피의 산출로
 * 내는 시설(채집 단계 빼고 — 제재소·가마). 시설 → 그 첫 레시피(증축 시설이 특산 없이 돌리는 레시피, cityPlan.ts planCityFacilities와 같다).
 * 팩 차례
 */
export function levelSupplyFacilities(catalog: SupplyCatalog): ReadonlyMap<string, RecipeSpec> {
  const cached = levelSupplyCache.get(catalog);
  if (cached) return cached;
  const materials = new Set<string>();
  for (const spec of catalog.facilities.values())
    if (spec.build && (spec.maxLevel ?? FACILITY_LEVEL_MAX) >= 2)
      for (const stack of buildCostAt(spec.build, 2)) if (stack.qty > 0) materials.add(itemAsset(stack.item));
  const out = new Map<string, RecipeSpec>();
  for (const spec of catalog.facilities.values()) {
    if (spec.gather !== undefined || !spec.build) continue;
    let first: RecipeSpec | undefined;
    for (const recipe of catalog.recipes.values())
      if (recipe.facility === spec.id) {
        first = recipe;
        break;
      }
    if (first?.outputs.some((stack) => materials.has(stack.asset)) === true) out.set(spec.id, first);
  }
  levelSupplyCache.set(catalog, out);
  return out;
}

/**
 * 나라 목표 + 레벨 재료 가공 시설(1186 나): 시설마다 목표가 적어도 supply. 입력을 구할 길이 없는 시설(세계 어느 시설도 내지 않고 그 도시에도
 * 없음)은 더하지 않는다(일꾼만 묶인 빈 건물이 된다). supply 0이면 나라 목표 그대로
 */
export function withLevelSupply(
  targets: ReadonlyMap<string, number> | undefined,
  supply: number,
  facilities: ReadonlyMap<string, RecipeSpec>,
  obtainable: (asset: string) => boolean,
): ReadonlyMap<string, number> | undefined {
  const n = Math.max(0, Math.trunc(supply));
  if (n === 0 || facilities.size === 0) return targets;
  const out = new Map(targets ?? []);
  for (const [facility, recipe] of facilities)
    if (recipe.inputs.every((stack) => obtainable(stack.asset)))
      out.set(facility, Math.max(out.get(facility) ?? 0, n));
  return out;
}

/**
 * 레벨 재료 가공 시설을 목표에 넣을 때인가(질문 1291 나, 기획 D-541): 도시 건물 수(상한에 세는 것)가 상한 − lead에 닿았을 때만 —
 * 초반 짓기는 그대로 두고 상한 바로 전에 세운다(제재소가 레벨 1 짓기 재료인 통나무를 먹어 초반 새 건물이 줄던 것). 거리는 1 이상(상한에서는
 * 새로 짓지 않으므로 0이면 영영 들지 않는다)이고, 아직 짓지 않은 가공 시설 수(missing)보다 짧지 않다(lead 1이면 제재소만 서고 가마 자리가
 * 없어 레벨 2 재료가 반쪽이 된다 — 시험으로 확인)
 */
export function levelSupplyDue(buildings: number, cap: number, lead: number, missing = 0): boolean {
  return buildings >= cap - Math.max(1, Math.trunc(lead), Math.trunc(missing));
}

/** 그 도시에 아직 모자란 레벨 재료 가공 시설 수(시설마다 supply − 지은 수, 0 아래는 0) */
export function levelSupplyMissing(
  counts: ReadonlyMap<string, number>,
  supply: number,
  facilities: ReadonlyMap<string, RecipeSpec>,
): number {
  const n = Math.max(0, Math.trunc(supply));
  let missing = 0;
  for (const facility of facilities.keys()) missing += Math.max(0, n - (counts.get(facility) ?? 0));
  return missing;
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
  const stageOf = (facility: string) => economy.catalog.facilities.get(facility)?.stage;
  const upgradeSpec = (facility: string) => {
    const spec = economy.catalog.facilities.get(facility);
    return spec?.build ? { stage: spec.stage, maxLevel: spec.maxLevel ?? FACILITY_LEVEL_MAX } : undefined;
  };
  const weight = (item: string) => lotWeightOf(economy, item);
  const accepts = economy.catalog.bareHandAccepts;
  for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
    /** 재료 줄이 받는 아이템들의 그 도시 재고 합(레벨 0 재료는 같은 원자재 종류 T0~T1 — 기획 D-562 1563·1564) */
    const groupStock = (item: string): bigint => {
      let sum = 0n;
      for (const other of accepts(item)) sum += world.book.balanceOf(faction.id, itemAsset(other), cityId);
      return sum;
    };
    /** 재료를 모두 구할 길이 있나(그 도시에 있거나 세계 어느 시설이 낸다 — 받는 아이템 가운데 하나라도) */
    const canObtain = (materials: readonly BuildStackJson[]): boolean =>
      materials.every(
        (stack) =>
          accepts(stack.item).some((other) => produced.has(itemAsset(other))) ||
          groupStock(stack.item) >= BigInt(stack.qty),
      );
    wants.delete(cityId);
    const site = builder.site(faction, cityId);
    const city = world.cities.get(cityId);
    if (!site || site.busy || !city) continue;
    const humans = economy.cityUnits.get(cityId) ?? 0;
    const housingCap = cityHousingCap(city);
    const cap = buildingCapOf(cityGrade(city.development, c.territory), c.npc);
    const helpers = Math.min(
      Math.max(0, c.npc.buildBuildersMax),
      idleHumans(economy, world, cityId, guards.get(cityId) ?? 0),
    );
    const facilities = site.facilities ?? [];
    let action: { materials: BuildStackJson[]; run: () => boolean } | undefined;
    // 1. 수리(1114 가): 상태 문턱 아래 — 플레이어 수리와 같은 재료(그 레벨 짓기 재료 × 고친 몫)·시간
    const fix = builder.repair ? chooseCityRepair(facilities, c.npc.buildRepairBelowPm ?? 0) : undefined;
    if (fix && builder.repair) {
      const build = economy.catalog.facilities.get(fix.facility)?.build;
      const restore = repairRestorePpm(
        fix.conditionPpm ?? CONDITION_FULL,
        REPAIR_ALL_STEPS,
        c.facilityRuntime,
      );
      const level = Math.max(1, fix.level);
      const materials = build ? repairMaterialsFor(buildCostAt(build, level), restore) : [];
      const ms = repairTimeMs(
        build ? buildTimeAt(build, level, weight, c.facilityBuild).ms : 0,
        restore,
        helpers,
        c.facilityRuntime,
      );
      const repair = builder.repair.bind(builder);
      if (restore > 0)
        action = {
          materials,
          run: () => {
            const ok = repair(faction, cityId, fix.key, materials, restore, ms, nowMs);
            if (ok) ctx.counts.repairs += 1;
            return ok;
          },
        };
    }
    // 2. 짓기(상한 아래): 나라 성격 목표·주거·식량·배후지
    if (!action && cap > 0) {
      const pick = chooseCityBuild(
        {
          humans,
          workers: Math.max(0, humans - (guards.get(cityId) ?? 0)),
          foodPm: ctx.hooks?.foodPmOf?.(cityId) ?? 1000,
          counts: site.counts,
          gatherPm: gatherPmOf(economy, cityId, options),
          // 나라 성격 목표(1142 다) + 레벨 재료 가공 시설(1186 나 — 상한 뒤에도 레벨 올리기로 자라게, 1291 나 — 상한 − lead부터)
          targets: withLevelSupply(
            run.targetsOf?.(faction, cityId),
            levelSupplyDue(
              countedBuildings(site.counts, stageOf),
              cap,
              c.npc.buildLevelSupplyLead ?? 2,
              levelSupplyMissing(
                site.counts,
                c.npc.buildLevelSupply ?? 0,
                levelSupplyFacilities(economy.catalog),
              ),
            )
              ? (c.npc.buildLevelSupply ?? 0)
              : 0,
            levelSupplyFacilities(economy.catalog),
            (asset) => produced.has(asset) || world.book.balanceOf(faction.id, asset, cityId) > 0n,
          ),
          beds: site.beds,
          housingCap,
        },
        options,
        faction.traits,
        c.npc,
        {
          bedsPerLevel: c.logistics.lodgingBedsPerLevel,
          cap,
          blocked: new Set(
            options
              .filter((option) => {
                const build = economy.catalog.facilities.get(option.facility)?.build;
                return !build || !canObtain(buildCostAt(build, 1));
              })
              .map((option) => option.facility),
          ),
        },
      );
      const build = pick === undefined ? undefined : economy.catalog.facilities.get(pick)?.build;
      if (pick !== undefined && build) {
        const materials = buildCostAt(build, 1).filter((stack) => stack.qty > 0);
        const ms = withBuilders(
          buildTimeAt(build, 1, weight, c.facilityBuild).ms,
          helpers,
          c.facilityRuntime,
        );
        action = {
          materials,
          run: () => {
            const ok = builder.start(faction, cityId, pick, materials, ms, nowMs);
            if (ok) ctx.counts.builds += 1;
            return ok;
          },
        };
      }
    }
    // 2-1. 면적 모듈(기획 D-569 1768 — D-212 NPC도 같은 시스템): 지을 것이 없을 때, 재료가 이미 창고에 있을 때만(모듈 재료는 사지 않는다)
    if (!action && builder.plot) {
      const rules = economy.gather.building ?? DEFAULT_BUILDING_GATHER;
      const target = chooseCityPlot(facilities, (facility, level) =>
        economy.catalog.facilities.get(facility)?.gather?.mode === "select" ? plotSlots(level, rules) : 0,
      );
      const build = target ? economy.catalog.facilities.get(target.facility)?.build : undefined;
      if (target && build) {
        const materials = buildCostAt(build, 1).filter((stack) => stack.qty > 0);
        const ms = withBuilders(
          buildTimeAt(build, 1, weight, c.facilityBuild).ms,
          helpers,
          c.facilityRuntime,
        );
        const plot = builder.plot.bind(builder);
        if (builder.has(faction, cityId, materials))
          action = {
            materials,
            run: () => {
              const ok = plot(faction, cityId, target.key, materials, ms, nowMs);
              if (ok) ctx.counts.plots += 1;
              return ok;
            },
          };
      }
    }
    // 3. 상한에 닿았으면 레벨 올리기(1146 나): 한 번에 한 레벨, 플레이어 레벨업과 같은 재료·시간. 구할 길이 없는 재료가 드는 시설은 건너뛴다
    if (!action && cap > 0 && builder.upgrade && countedBuildings(site.counts, stageOf) >= cap) {
      const upgrade = builder.upgrade.bind(builder);
      for (const target of rankCityUpgrades(facilities, { humans, housingCap }, upgradeSpec)) {
        const build = economy.catalog.facilities.get(target.facility)?.build;
        if (!build) continue;
        const level = target.level + 1;
        const materials = buildCostAt(build, level).filter((stack) => stack.qty > 0);
        if (!canObtain(materials)) continue;
        const ms = withBuilders(
          buildTimeAt(build, level, weight, c.facilityBuild).ms,
          helpers,
          c.facilityRuntime,
        );
        action = {
          materials,
          run: () => {
            const ok = upgrade(faction, cityId, target.key, materials, ms, nowMs);
            if (ok) ctx.counts.upgrades += 1;
            return ok;
          },
        };
        break;
      }
    }
    if (!action) continue;
    if (builder.has(faction, cityId, action.materials)) {
      action.run();
      continue;
    }
    // 재료를 산다: 모자란 몫의 지난 값 × 예비 ‰만큼 국고가 있을 때만 도시 목표 재고에 넣는다(같은 판단의 다른 도시 몫은 뺀다).
    // 구할 길이 없는 재료(세계 어느 시설도 내지 않는 물건)면 넣지 않는다 — 채워지지 않는 매수 호가에 국고가 묶인다
    let cost = 0n;
    let obtainable = true;
    const need = new Map<string, bigint>();
    for (const stack of action.materials) {
      const asset = itemAsset(stack.item);
      const qty = BigInt(stack.qty);
      need.set(asset, (need.get(asset) ?? 0n) + qty);
      const short = qty - groupStock(stack.item);
      if (short <= 0n) continue;
      if (
        !accepts(stack.item).some((other) => produced.has(itemAsset(other))) &&
        groupStock(stack.item) <= 0n
      )
        obtainable = false;
      const lot = lotSizeOf(economy.catalog, asset);
      cost += ((short + lot - 1n) / lot) * marketRefPrice(economy, cityId, asset);
    }
    if (!obtainable || funds * 1000n < cost * BigInt(c.npc.reservePm)) continue;
    funds -= cost;
    wants.set(cityId, need);
  }
}

/** 도시 등급 하나의 끝 상태(요약 npc.cities — 질문 1143 나·1146 나 측정) */
export interface NpcCityGrade {
  readonly grade: number;
  readonly cities: number;
  /** 건물 수 합(상한에 세는 것 — 행정 건물·성벽 빼고, 짓는 중 포함) */
  readonly buildings: number;
  /** 다 지은 시설 레벨 합(같은 시설 몫) */
  readonly levels: number;
  /** 레벨 2 이상 시설(같은 시설 몫)이 하나라도 있는 도시 수(질문 1186 나 측정 — 상한 뒤에도 자라는가) */
  readonly leveled: number;
  /** 휴먼 합·인구 상한 합 */
  readonly humans: number;
  readonly housingCap: number;
}

/** 살아 있는 세력 도시를 도시 등급으로 묶은 끝 상태(등급 차례) */
export function npcCityGrades(ctx: NpcContext, run: NpcBuildRun): NpcCityGrade[] {
  const { world, c } = ctx;
  const stageOf = (facility: string) => run.economy.catalog.facilities.get(facility)?.stage;
  const byGrade = new Map<
    number,
    { cities: number; buildings: number; levels: number; leveled: number; humans: number; housingCap: number }
  >();
  for (const city of [...world.cities.values()].toSorted((a, b) => a.id - b.id)) {
    const faction = world.factions.get(city.owner);
    const site = faction ? run.builder.site(faction, city.id) : undefined;
    if (!site) continue;
    const grade = cityGrade(city.development, c.territory);
    const entry = byGrade.get(grade) ?? {
      cities: 0,
      buildings: 0,
      levels: 0,
      leveled: 0,
      humans: 0,
      housingCap: 0,
    };
    entry.cities += 1;
    entry.buildings += countedBuildings(site.counts, stageOf);
    let top = 0;
    for (const facility of site.facilities ?? [])
      if (!BUILD_UNCOUNTED_STAGES.has(stageOf(facility.facility) ?? "")) {
        entry.levels += facility.level;
        top = Math.max(top, facility.level);
      }
    if (top >= 2) entry.leveled += 1;
    entry.humans += run.economy.cityUnits.get(city.id) ?? 0;
    entry.housingCap += cityHousingCap(city);
    byGrade.set(grade, entry);
  }
  return [...byGrade].toSorted((a, b) => a[0] - b[0]).map(([grade, entry]) => ({ grade, ...entry }));
}

/**
 * 시뮬 짓기 자리: 경제 시설만(자리 없음). 다 지으면 그 시설의 첫 레시피로 레벨 1, 일꾼 = 일 없는 휴먼(자리 수까지). 생산하지 않는 시설(숙소 등)은
 * 레벨만 센다 — 숙소 침대(레벨 × lodging_beds_per_level)는 도시 beds에 적어 인구 상한에 더한다(1131 나: 시뮬 도시에는 씨앗 숙소가 없어 지은 숙소는
 * 모두 센다). 레벨 올리기(1146 나)는 끝나면 그 시설 레벨 + 1(자리·일꾼·채집 효과를 다시 셈). 시뮬 시설에는 상태가 없어 수리하지 않는다.
 * bedsPerLevel = 숙소 레벨당 침대(부를 때마다 읽는다)
 */
export function simNpcBuilder(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  bedsPerLevel: () => number = () => 0,
): NpcBuilder {
  /** 도시 → 짓는 것(짓기 = facility, 레벨 올리기 = key) */
  const active = new Map<number, { facility: string; key: number | null; doneAtMs: number; plot?: true }>();
  /** 생산하지 않는 다 지은 시설(숙소 등): 열쇠 → 도시·시설·레벨 */
  const extra = new Map<number, { city: number; facility: string; level: number }>();
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
  /** 도시 숙소 침대 = 그 도시 지은 숙소 레벨 합 × 레벨당 침대 */
  const refreshBeds = (cityId: number): void => {
    const city = world.cities.get(cityId);
    if (!city) return;
    let levels = 0;
    for (const entry of extra.values())
      if (entry.city === cityId && entry.facility === BUILD_LODGING) levels += entry.level;
    city.beds = levels * Math.max(0, Math.trunc(bedsPerLevel()));
  };
  const activate = (cityId: number, facility: string, nowMs: number): void => {
    const spec = economy.catalog.facilities.get(facility);
    const recipe = firstRecipe(facility);
    nextId += 1;
    const id = BUILT_FACILITY_BASE + nextId;
    if (!spec || !recipe) {
      extra.set(id, { city: cityId, facility, level: 1 });
      if (facility === BUILD_LODGING) refreshBeds(cityId);
      return;
    }
    const built = retierFacility(economy, {
      id,
      city: cityId,
      recipe,
      level: 1,
      workers: Math.min(spec.slotsPerLevel, idleHumans(economy, world, cityId, guardsIn(cityId))),
      ...workerEffects(spec.gather, { level: 1 }, economy.gather),
      batches: 0,
      eventId: undefined,
    });
    economy.facilities.set(id, built);
    scheduleProduce(economy, world, loop, built, nowMs);
  };
  /** 레벨 올리기 끝: 레벨 + 1. 생산 시설은 자리가 늘어난 만큼 일 없는 휴먼을 더 넣고 채집 효과를 다시 셈한다(다음 생산부터) */
  const levelUp = (cityId: number, key: number): void => {
    const other = extra.get(key);
    if (other) {
      other.level += 1;
      if (other.facility === BUILD_LODGING) refreshBeds(cityId);
      return;
    }
    const facility = economy.facilities.get(key);
    const spec = facility ? economy.catalog.facilities.get(facility.recipe.facility) : undefined;
    if (!facility || !spec) return;
    const level = facility.level + 1;
    const free = idleHumans(economy, world, cityId, guardsIn(cityId));
    const workers = Math.min(spec.slotsPerLevel * level, facility.workers + free);
    economy.facilities.set(
      key,
      retierFacility(economy, {
        ...facility,
        level,
        workers,
        ...workerEffects(spec.gather, { level, plots: facility.plots }, economy.gather),
      }),
    );
  };
  /** 면적 모듈 붙이기 끝(기획 D-569 1768): 모듈 + 1, 수확 배율을 다시 셈한다(다음 생산부터) */
  const plotDone = (key: number): void => {
    const facility = economy.facilities.get(key);
    const spec = facility ? economy.catalog.facilities.get(facility.recipe.facility) : undefined;
    if (!facility || !spec) return;
    economy.facilities.set(
      key,
      retierFacility(economy, {
        ...facility,
        ...workerEffects(
          spec.gather,
          { level: facility.level, plots: (facility.plots ?? 0) + 1 },
          economy.gather,
        ),
      }),
    );
  };
  /** 그 도시 건물 채집소의 기르는 티어를 시세로 다시 고른다(기획 D-569 1761 — 판단마다, 다음 생산부터) */
  const retierCity = (cityId: number): void => {
    for (const facility of [...economy.facilities.values()].toSorted((a, b) => a.id - b.id)) {
      if (facility.city !== cityId) continue;
      const next = retierFacility(economy, facility);
      if (next !== facility) economy.facilities.set(facility.id, next);
    }
  };
  /**
   * 증축 시설의 빈 자리를 일 없는 휴먼으로 채운다(질문 1186 나 확인 — 서버 도시 경제가 맞출 때마다 휴먼을 시설마다 한 명씩 돌려 나누는 것과 같은
   * 뜻, 서버 npc/economy.ts assignCityWorkers): 지을 때 일 없는 휴먼이 없던 시설(가마 등)이 그 뒤 구인으로 는 휴먼을 받는다. 판단마다(settle)
   * 시설 ID 차례로 한 명씩 돌려 자리 수까지. 그래도 일꾼이 없는 증축 시설은 일꾼이 가장 많은 시설에서 한 명을 옮겨 받는다(시설마다 적어도 한 명)
   */
  const fillBuilt = (cityId: number, nowMs: number): void => {
    let free = idleHumans(economy, world, cityId, guardsIn(cityId));
    const open = [...economy.facilities.values()]
      .filter((facility) => facility.city === cityId && facility.id > BUILT_FACILITY_BASE)
      .toSorted((a, b) => a.id - b.id);
    const add = new Map<number, number>();
    let moved = true;
    while (free > 0 && moved) {
      moved = false;
      for (const facility of open) {
        if (free <= 0) break;
        const slots =
          (economy.catalog.facilities.get(facility.recipe.facility)?.slotsPerLevel ?? 0) * facility.level;
        const given = add.get(facility.id) ?? 0;
        if (facility.workers + given >= slots) continue;
        add.set(facility.id, given + 1);
        free -= 1;
        moved = true;
      }
    }
    // 일 없는 휴먼이 없으면 일꾼이 가장 많은(둘 이상) 그 도시 시설에서 한 명을 옮긴다 — 서버처럼 시설마다 적어도 한 명(같으면 작은 ID)
    for (const facility of open) {
      if (facility.workers + (add.get(facility.id) ?? 0) > 0) continue;
      let donor: { id: number; workers: number } | undefined;
      for (const other of economy.facilities.values()) {
        if (other.city !== cityId || other.id === facility.id) continue;
        const workers = other.workers + (add.get(other.id) ?? 0);
        if (
          workers > 1 &&
          (!donor || workers > donor.workers || (workers === donor.workers && other.id < donor.id))
        )
          donor = { id: other.id, workers };
      }
      if (!donor) break;
      add.set(donor.id, (add.get(donor.id) ?? 0) - 1);
      add.set(facility.id, (add.get(facility.id) ?? 0) + 1);
    }
    for (const [id, delta] of add) {
      const facility = economy.facilities.get(id);
      if (!facility || delta === 0) continue;
      const next = { ...facility, workers: facility.workers + delta };
      economy.facilities.set(id, next);
      // 일꾼이 없어 생산이 걸려 있지 않던 시설은 지금부터 돌린다
      if (next.eventId === undefined) scheduleProduce(economy, world, loop, next, nowMs);
    }
  };
  /** 꺼낼 아이템별 수량(레벨 0 재료는 같은 원자재 종류 T0~T1 — 기획 D-562 1563·1564, @terra/shared/bareHandMaterials). 모자라면 undefined */
  const planOf = (faction: SimFaction, cityId: number, materials: readonly BuildStackJson[]) =>
    allocateMaterials(materials, economy.catalog.bareHandAccepts, (item) =>
      world.book.balanceOf(faction.id, itemAsset(item), cityId),
    );
  const has = (faction: SimFaction, cityId: number, materials: readonly BuildStackJson[]): boolean =>
    planOf(faction, cityId, materials) !== undefined;
  /** 재료를 도시 창고에서 뺀다(sink, 감사 규칙 facility_build) */
  const spend = (
    faction: SimFaction,
    cityId: number,
    materials: readonly BuildStackJson[],
    nowMs: number,
  ) => {
    const { book } = world;
    const plan = planOf(faction, cityId, materials);
    if (!plan) return;
    const entries: { account: number; amount: bigint }[] = [];
    for (const [item, qty] of plan) {
      if (qty <= 0n) continue;
      const asset = itemAsset(item);
      entries.push({ account: book.ownerAccount(faction.id, asset, cityId), amount: -qty });
      entries.push({ account: book.systemAccount(`sink:${asset}`, asset), amount: qty });
    }
    if (entries.length > 0) book.post({ kind: "facility_build", atMs: nowMs, entries });
  };
  return {
    has,
    settle(faction, nowMs) {
      let done = 0;
      for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
        const job = active.get(cityId);
        if (job && job.doneAtMs <= nowMs) {
          active.delete(cityId);
          if (job.key === null) {
            activate(cityId, job.facility, nowMs);
            done += 1;
          } else if (job.plot) plotDone(job.key);
          else levelUp(cityId, job.key);
        }
        fillBuilt(cityId, nowMs);
        retierCity(cityId);
      }
      return done;
    },
    site(_faction, cityId) {
      if (!world.cities.has(cityId)) return undefined;
      const counts = new Map<string, number>();
      const facilities: SiteFacility[] = [];
      let beds = 0;
      for (const [key, entry] of extra)
        if (entry.city === cityId) {
          counts.set(entry.facility, (counts.get(entry.facility) ?? 0) + 1);
          facilities.push({ key, facility: entry.facility, level: entry.level, workers: 0 });
          if (entry.facility === BUILD_LODGING) beds += entry.level;
        }
      for (const facility of economy.facilities.values())
        if (facility.city === cityId) {
          counts.set(facility.recipe.facility, (counts.get(facility.recipe.facility) ?? 0) + 1);
          facilities.push({
            key: facility.id,
            facility: facility.recipe.facility,
            level: facility.level,
            workers: facility.workers,
            ...(facility.plots ? { plots: facility.plots } : {}),
          });
        }
      const job = active.get(cityId);
      if (job && job.key === null) counts.set(job.facility, (counts.get(job.facility) ?? 0) + 1);
      // 시뮬 도시 주거(집)는 침대가 있는 자리로 친다(쉼터 셈이 없다) → 숙소는 붐빌 때만 짓는다
      const city = world.cities.get(cityId);
      return {
        counts,
        busy: job !== undefined,
        facilities: facilities.toSorted((a, b) => a.key - b.key),
        beds: (city?.housing ?? 0) + beds * Math.max(0, bedsPerLevel()),
      };
    },
    start(faction, cityId, facility, materials, ms, nowMs) {
      if (active.has(cityId) || !has(faction, cityId, materials)) return false;
      spend(faction, cityId, materials, nowMs);
      active.set(cityId, { facility, key: null, doneAtMs: nowMs + ms });
      return true;
    },
    upgrade(faction, cityId, key, materials, ms, nowMs) {
      const owned = extra.get(key)?.city ?? economy.facilities.get(key)?.city;
      if (owned !== cityId || active.has(cityId) || !has(faction, cityId, materials)) return false;
      spend(faction, cityId, materials, nowMs);
      const facility = extra.get(key)?.facility ?? economy.facilities.get(key)?.recipe.facility ?? "";
      active.set(cityId, { facility, key, doneAtMs: nowMs + ms });
      return true;
    },
    plot(faction, cityId, key, materials, ms, nowMs) {
      const facility = economy.facilities.get(key);
      if (facility?.city !== cityId || active.has(cityId) || !has(faction, cityId, materials)) return false;
      spend(faction, cityId, materials, nowMs);
      active.set(cityId, { facility: facility.recipe.facility, key, doneAtMs: nowMs + ms, plot: true });
      return true;
    },
  };
}
