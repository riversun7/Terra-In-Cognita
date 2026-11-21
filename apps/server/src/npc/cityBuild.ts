// NPC 도시 증축(서버 짓기 자리) — 기획 D-534(질문 1101 나 "NPC 증축은 유저와 같은 규칙", D-212), docs/adr/2026-11-11-city-building-layout.md
// "바뀜 (2026-11-12, NPC 증축)". 무엇을 지을지·재료·시간은 시뮬과 같은 함수(@terra/sim buildPolicy — NPC 판단 decide가 구인 규칙식 다음에 부른다).
// 여기는 서버 몫만 한다:
// - 자리: 전략 배치 함수(facilities/npcPlacement.ts planNpcSpots — 세계 씨앗과 같은 함수)로 그 도시에 그 세력이 가진 건물을 두고 하나를 놓는다.
// - 짓기: 건물 서비스 npcBuild(플레이어 짓기와 같은 재료 자리·건물 칸·짓기 작업 — 저장·복구도 같다).
// - 짓는 중 = 그 세력의 짓기 작업이 그 도시 시설에 걸려 있음(다시 켜도 작업 줄로 안다). 다 지으면 다음 판단(settle)에 도시 경제가 시설을 다시
//   맞춘다(refreshCity). 서버를 다시 켜 기억을 잃은 짓기는 다음 하루 끝 시설 맞추기(afterDay)가 넣는다.
// 바뀜 (2026-11-12, 기획 D-535 — 질문 1146 나·1114 가·1142 다·1131 나):
// - 레벨 올리기·수리: 건물 서비스 npcJob(플레이어 upgrade·repair와 같은 재료 자리·작업 줄). 그 도시에 그 세력의 짓기·레벨 올리기·수리 작업이
//   걸려 있으면 바쁘다(도시마다 한 번에 하나). 끝나면 다음 판단에 도시 경제를 다시 맞춘다(레벨 = 자리·생산).
// - 후보(site.facilities) = 그 세력이 그 도시에 가진 다 지은 시설: 레벨·상태(ppm)·도시 경제 일꾼 수. 침대 = 그 도시 숙소 침대 합(쉼터 계획).
// - 나라 성격 목표(targetsOf) = 국가 프리셋 특산 줄 수와 국력 등급 처음 시설 수 가운데 큰 값(runtime.ts가 넘긴다).
// 바뀜 (2026-11-14, 기획 D-541 1281 나 — docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)"): 바닷가 도시(전략 배치 함수가 그 도시에 부두를 놓을
// 물가 자리를 찾는 도시)는 목표에 부두(배를 만드는 시설 — 단계 교통 + 물가 조건) 하나를 더한다. 바닷가인지는 도시마다 COAST_TTL_MS 동안 기억하고,
// 부두 자리를 못 찾아 짓기가 실패하면 그 도시는 바닷가가 아닌 것으로 본다(같은 목표에 묶여 다른 짓기가 멈추지 않게). 시뮬 도시는 땅을 몰라 부두를
// 짓지 않는다(시뮬 판정은 그대로 — SIM_VERSION 그대로).
// 바뀜 (2026-11-16, 기획 D-561 — docs/adr/2026-11-16-exchange-buildings.md): 목표에 물자·외환 거래소 하나씩을 더한다(서버만 — 시뮬 도시는 거래소 건물이
// 없다. SIM_VERSION 그대로).
// 바뀜 (house-10, 기획 대조 2301 — D-555 1505·1509·D-554): 그 도시 운반 수요가 크면(기다리는 NPC 운반 일 × 상업 성향 배율 ≥ 설정 칸, 도시 휴먼 ≥ 설정 칸)
// 목표에 물류센터 하나(npcLogistics.ts wantsCenter — 서버만, SIM_VERSION 그대로).
// 바뀜(share-market-2, 기획 D-587 질문 2474 다): 상업 성향 배율이 설정 칸 city_share_npc_exchange_pm 이상인 나라는 목표에 증권 거래소 하나(wantsShareExchange).
// 바뀜(fixes-1116t, 기획 대조 2348 다 — D-554 "고정 규칙 대신 성향 변수"): 하나 상한을 없앤다. 목표 수 = npcLogistics.ts centerTarget(지금 그 세력의 그 도시
// 물류센터 수 k — 짓는 중 포함 — 에서 문턱·하한 × (k + 1)을 넘으면 k + 1).
import type { CityCell } from "@terra/shared/goodsPlaces";
import type {
  Economy,
  NpcBuilder,
  NpcBuildRun,
  NpcBuildSite,
  SimFaction,
  SiteFacility,
  WorldSeedCoefficients,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import { hasGoods } from "../facilities/materials.ts";
import { planNpcSpots } from "../facilities/npcPlacement.ts";
import type { SeedLand } from "../facilities/npcSeed.ts";
import { materialScope } from "../facilities/places.ts";
import type { FacilityService, NpcJobInput } from "../facilities/service.ts";
import type { GatherKind } from "../gather/kinds.ts";
import { isBerth, isShipyard } from "../boats/rules.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { LogisticsCoefficients } from "@terra/sim";
import { centerTarget } from "./npcLogistics.ts";
import { traitScalePm } from "./rulingSpend.ts";

/** 월드가 넘기는 짓기 입력(market/worldInput.ts — NPC 도시 경제 입력의 build 칸) */
export interface NpcBuildWorld {
  readonly service: FacilityService;
  readonly catalog: () => FacilityCatalog;
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 원자재 오브젝트 종류(전략 배치의 채집소 자리). 없으면 방향만 흩는다 */
  readonly gatherKinds?: (() => readonly GatherKind[]) | undefined;
  /** 2차맵 키 → 둘레 땅(행성 값). 없으면 모름 */
  readonly landOf?: ((mapKey: number) => SeedLand | undefined) | undefined;
}

export interface ServerNpcBuilderOptions {
  readonly world: NpcBuildWorld;
  readonly ledger: Ledger;
  /** 도시 자리(2차맵·시청 칸) */
  readonly places: ReadonlyMap<
    number,
    { readonly mapKey: number; readonly cellX: number; readonly cellY: number }
  >;
  /** 세계 씨앗 계수표(배치 규칙, 부를 때마다 읽는다) */
  readonly seed: () => WorldSeedCoefficients;
  /** 다 지은 건물을 도시 경제에 넣는다(ServerEconomy.refreshCity) */
  readonly refresh: (cityId: number, nowMs: number) => void;
  /** 시설(건물 ID)의 지금 도시 경제 일꾼 수(레벨 올리기 차례). 없으면 0 */
  readonly workersOf?: ((buildingId: number) => number) | undefined;
  /** 그 도시 숙소 침대 합(쉼터 계획 bedTotal). 없으면 숙소 수 × 레벨당 침대 */
  readonly bedsOf?: ((cityId: number) => number | undefined) | undefined;
  /** 짓기 자리를 못 찾았다(바닷가 부두 목표를 거둔다). 없으면 아무것도 하지 않는다 */
  readonly onNoSpot?: ((cityId: number, facility: string) => void) | undefined;
  readonly log: { info(obj: object, message: string): void };
}

/** 서버 짓기 자리(위 머리 주석) */
export function createServerNpcBuilder(o: ServerNpcBuilderOptions): NpcBuilder {
  const { service } = o.world;
  /** 이번 실행에서 건 짓기·레벨 올리기·수리(도시 → 건물·종류) — 끝나면 settle이 도시 경제를 다시 맞춘다 */
  const started = new Map<number, { buildingId: number; kind: "build" | "upgrade" | "repair" | "plot" }>();
  const mapOf = (cityId: number) => {
    const place = o.places.get(cityId);
    const map = place ? o.world.maps.get(place.mapKey) : undefined;
    return place && map ? { place, map } : undefined;
  };
  /** 그 도시에 그 세력의 짓기·레벨 올리기·수리 작업이 있나 */
  const building = (ownerId: number, cityId: number): boolean => {
    for (const job of service.jobs.values()) {
      if (job.ownerId !== ownerId || job.buildingId === null) continue;
      if (job.kind !== "build" && job.kind !== "upgrade" && job.kind !== "repair" && job.kind !== "plot")
        continue;
      if (service.facilities.get(job.buildingId)?.cityId === cityId) return true;
    }
    return false;
  };
  /** 그 건물에 걸린 작업이 있나 */
  const jobOn = (buildingId: number): boolean => {
    for (const job of service.jobs.values()) if (job.buildingId === buildingId) return true;
    return false;
  };
  const anchorsOf = (mapKey: number): CityCell[] =>
    service.places.cities().filter((cell) => cell.mapKey === mapKey);
  /** 레벨 올리기·수리 작업을 건다(그 도시 시설만) */
  const job = (faction: SimFaction, cityId: number, input: NpcJobInput, nowMs: number): boolean => {
    if (service.facilities.get(input.buildingId)?.cityId !== cityId) return false;
    const result = service.npcJob(input);
    if (!result.ok) return false;
    started.set(cityId, { buildingId: input.buildingId, kind: input.kind });
    o.log.info(
      {
        cityId,
        owner: faction.id,
        kind: input.kind,
        buildingId: input.buildingId,
        doneAtMs: result.doneAtMs,
        nowMs,
      },
      "npc city facility job started",
    );
    return true;
  };
  return {
    settle(faction: SimFaction, nowMs: number) {
      let done = 0;
      for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
        const run = started.get(cityId);
        if (run === undefined) continue;
        const record = service.facilities.get(run.buildingId);
        if (record && (record.level < 1 || jobOn(run.buildingId))) continue;
        started.delete(cityId);
        if (!record) continue;
        o.refresh(cityId, nowMs);
        if (run.kind === "build") done += 1;
      }
      return done;
    },
    site(faction, cityId): NpcBuildSite | undefined {
      const at = mapOf(cityId);
      if (!at) return undefined;
      const counts = new Map<string, number>();
      const facilities: SiteFacility[] = [];
      for (const record of service.facilities.values()) {
        if (record.cityId !== cityId || at.map.buildingOwner(record.buildingId) !== faction.id) continue;
        counts.set(record.facilityId, (counts.get(record.facilityId) ?? 0) + 1);
        if (record.level >= 1)
          facilities.push({
            key: record.buildingId,
            facility: record.facilityId,
            level: record.level,
            workers: o.workersOf?.(record.buildingId) ?? 0,
            conditionPpm: record.conditionPpm,
            ...(record.plots ? { plots: record.plots } : {}),
          });
      }
      // 다 지었지만 아직 도시 경제에 넣지 않은 것(다음 판단 settle)도 바쁨으로 친다
      const run = started.get(cityId);
      const waiting = run !== undefined && !jobOn(run.buildingId);
      return {
        counts,
        busy: building(faction.id, cityId) || waiting,
        facilities: facilities.toSorted((a, b) => a.key - b.key),
        beds: o.bedsOf?.(cityId),
      };
    },
    has(faction, cityId, materials) {
      const at = mapOf(cityId);
      if (!at) return false;
      // 레벨 0 재료는 같은 원자재 종류 T0~T1을 받는다(기획 D-562 1563·1564 — 건물 서비스 npcBuild·npcJob과 같다)
      const accepts = o.world.catalog().bareHandAccepts?.bind(o.world.catalog());
      return hasGoods(
        o.ledger,
        faction.id,
        accepts ? materials.map((stack) => ({ ...stack, accepts: accepts(stack.item) })) : materials,
        materialScope(service.places, faction.id, at.place.mapKey, cityId, false),
      );
    },
    start(faction, cityId, facility, materials, ms, nowMs) {
      const at = mapOf(cityId);
      if (!at) return false;
      const catalog = o.world.catalog();
      const spot = planNpcSpots({
        map: at.map,
        catalog,
        facilities: service.facilities,
        city: { id: cityId, ...at.place },
        ownerId: faction.id,
        anchors: anchorsOf(at.place.mapKey),
        items: [facility],
        kinds: o.world.gatherKinds?.() ?? [],
        land: o.world.landOf?.(at.place.mapKey),
        seed: o.seed(),
      }).placed[0];
      if (!spot) {
        o.onNoSpot?.(cityId, facility);
        return false;
      }
      const result = service.npcBuild({
        ownerId: faction.id,
        mapKey: at.place.mapKey,
        cityId,
        facility,
        x: spot.x,
        y: spot.y,
        materials,
        ms,
      });
      if (!result.ok || result.buildingId === undefined) return false;
      started.set(cityId, { buildingId: result.buildingId, kind: "build" });
      o.log.info(
        {
          cityId,
          owner: faction.id,
          facility,
          buildingId: result.buildingId,
          doneAtMs: result.doneAtMs,
          nowMs,
        },
        "npc city build started",
      );
      return true;
    },
    upgrade(faction, cityId, key, materials, ms, nowMs) {
      return job(
        faction,
        cityId,
        { kind: "upgrade", ownerId: faction.id, buildingId: key, materials, ms },
        nowMs,
      );
    },
    plot(faction, cityId, key, materials, ms, nowMs) {
      // 면적 모듈(기획 D-569 1768): 플레이어 facility_plot과 같은 자리 규칙·작업 줄(건물 서비스 npcJob kind plot)
      return job(
        faction,
        cityId,
        { kind: "plot", ownerId: faction.id, buildingId: key, materials, ms },
        nowMs,
      );
    },
    repair(faction, cityId, key, materials, restorePpm, ms, nowMs) {
      return job(
        faction,
        cityId,
        { kind: "repair", ownerId: faction.id, buildingId: key, materials, ms, restorePpm },
        nowMs,
      );
    },
  };
}

/**
 * 나라 성격 목표(질문 1142 다, 기획 D-535): 시설마다 국력 등급 처음 시설 수(프리셋 성격 칸 → 등급 표 → 설정 칸 — npc/nations.ts nationStartOf)와
 * 특산 줄(cityJobs)에 그 시설이 나온 수 가운데 큰 값. 특산 줄이 시설을 두 번 적으면(통나무·목재 벌목장) 건물 둘이 목표다
 */
export function nationBuildTargets(
  start: Readonly<Record<string, number>>,
  jobs: readonly { readonly facility: string }[],
): Map<string, number> {
  const out = new Map<string, number>(Object.entries(start));
  const rows = new Map<string, number>();
  for (const job of jobs) rows.set(job.facility, (rows.get(job.facility) ?? 0) + 1);
  for (const [facility, n] of rows) out.set(facility, Math.max(out.get(facility) ?? 0, n));
  return out;
}

/** NPC 판단 맥락의 증축 칸(runtime.ts): 도시 경제와 짓기 입력이 있을 때만. 없으면 undefined(짓지 않는다) */
export function npcBuildRunOf(o: {
  readonly econ:
    | {
        readonly economy: Economy;
        refreshCity(cityId: number, nowMs: number): void;
        restPlan(cityId: number): { readonly bedTotal: number } | undefined;
        /** NPC 운반 일 판(물류센터 증축 수요 — house-10 2301). 없으면 물류센터를 목표에 넣지 않는다 */
        readonly carry?: { waitingIn(cityId: number): number } | undefined;
      }
    | undefined;
  /** 나라 성격 목표(질문 1142 다). 없으면 목표 없음 */
  readonly targetsOf?: NpcBuildRun["targetsOf"];
  readonly world: NpcBuildWorld | undefined;
  readonly ledger: Ledger;
  readonly places: ServerNpcBuilderOptions["places"];
  readonly rules: () => {
    readonly worldSeed: WorldSeedCoefficients;
    /** 물류센터 증축 문턱(house-10 2301). 없으면 물류센터를 목표에 넣지 않는다 */
    readonly logistics?: LogisticsCoefficients | undefined;
    readonly npc?: { readonly traitMin: number; readonly traitMax: number } | undefined;
    /** 증권 거래소 짓기 상업 성향 문턱(D-587 2474 다 — 설정 칸 city_share_npc_exchange_pm). 없으면 짓지 않는다 */
    readonly business?: { readonly cityShareNpcExchangePm?: number | undefined } | undefined;
  };
  readonly log: ServerNpcBuilderOptions["log"];
}): NpcBuildRun | undefined {
  const { econ, world } = o;
  if (!econ || !world) return undefined;
  const coast = coastalDocks({ world, places: o.places, rules: o.rules });
  const builder = createServerNpcBuilder({
    world,
    ledger: o.ledger,
    places: o.places,
    seed: () => o.rules().worldSeed,
    refresh: (cityId, nowMs) => econ.refreshCity(cityId, nowMs),
    workersOf: (buildingId) => econ.economy.facilities.get(buildingId)?.workers ?? 0,
    bedsOf: (cityId) => econ.restPlan(cityId)?.bedTotal,
    onNoSpot: (cityId, facility) => coast.noSpot(cityId, facility),
    log: o.log,
  });
  const base = o.targetsOf;
  return {
    economy: econ.economy,
    builder,
    // 바닷가 도시는 정박장 하나 + 조선소 하나(D-541 1281 나, D-547 1497 — NPC도 플레이어와 같은 규칙)
    // 거래소 건물(기획 D-561): 도시마다 물자·외환 거래소 하나(씨앗이 세우지만 부서지거나 지운 것은 증축이 다시 짓는다)
    targetsOf: (faction, cityId) => {
      const berth = coast.dockOf(cityId, faction.id);
      let targets = withCoastalDock(
        withCoastalDock(base?.(faction, cityId), berth),
        berth === undefined ? undefined : coast.shipyard(),
      );
      for (const exchange of exchangeTargets(world)) targets = withCoastalDock(targets, exchange);
      // 증권 거래소(D-587 질문 2474 다): 상업 성향 배율이 문턱 이상인 나라만 도시마다 하나
      const rules = o.rules();
      const securities = shareExchangeTarget(world);
      if (securities !== undefined && rules.npc && wantsShareExchange(faction.traits.commerce, rules))
        targets = withCoastalDock(targets, securities);
      // 물류센터(2301·2348 다): 운반 수요가 크고 상업 성향이 받쳐 줄 때 — 수요가 계속 크면 둘째·셋째도
      const center = logisticsTarget(world);
      // 기다리는 일이 없으면 더 지을 까닭이 없다(지금 수 그대로 — 시설 훑기를 건너뛴다)
      const waiting = econ.carry?.waitingIn(cityId) ?? 0;
      if (center !== undefined && rules.logistics && rules.npc && waiting > 0) {
        const existing = builder.site(faction, cityId)?.counts.get(center) ?? 0;
        const want = centerTarget(
          {
            waiting,
            humans: econ.economy.cityUnits.get(cityId) ?? 0,
            commerce: faction.traits.commerce,
            existing,
          },
          { ...rules.npc, ...rules.logistics },
        );
        targets = withTarget(targets, center, want);
      }
      return targets;
    },
  };
}

/** NPC 증축 목표에 넣는 물류센터 시설(팩에 있고 지을 수 있는 첫 물류센터, docs/adr/2026-11-16-logistics-center.md). 없으면 undefined */
function logisticsTarget(world: NpcBuildWorld): string | undefined {
  return world.catalog().facilities.find((def) => def.logistics === true && def.build && def.footprint)?.id;
}

/** NPC 증축 목표에 넣는 거래소 시설(팩에 있고 지을 수 있고 잠기지 않은 물자·외환 거래소, docs/adr/2026-11-16-exchange-buildings.md) */
function exchangeTargets(world: NpcBuildWorld): string[] {
  return world
    .catalog()
    .facilities.filter(
      (def) => (def.exchange === "goods" || def.exchange === "fx") && def.build && def.footprint,
    )
    .map((def) => def.id);
}

/** NPC 증축 목표에 넣는 증권 거래소 시설(팩에 있고 지을 수 있는 첫 증권 거래소 — D-587 질문 2474 다). 없으면 undefined */
function shareExchangeTarget(world: NpcBuildWorld): string | undefined {
  return world.catalog().facilities.find((def) => def.exchange === "securities" && def.build && def.footprint)
    ?.id;
}

/**
 * 그 나라가 증권 거래소를 짓나(D-587 질문 2474 다 "NPC는 성향에 따라 증권 거래소를 짓는다"): 상업 성향 배율(500~1500‰ — rulingSpend.ts traitScalePm)이
 * 설정 칸 city_share_npc_exchange_pm 이상 [임시]. 문턱이 없으면 짓지 않는다
 */
export function wantsShareExchange(
  commerce: number,
  rules: {
    readonly npc?: { readonly traitMin: number; readonly traitMax: number } | undefined;
    readonly business?: { readonly cityShareNpcExchangePm?: number | undefined } | undefined;
  },
): boolean {
  const threshold = rules.business?.cityShareNpcExchangePm;
  if (!rules.npc || threshold === undefined || !Number.isFinite(threshold)) return false;
  return traitScalePm(commerce, rules.npc) >= threshold;
}

/** 바닷가인지 기억하는 시간(ms) — 건물이 물가를 채우면 다시 본다 */
export const COAST_TTL_MS = 6 * 60 * 60_000;

/** 목표에 배 시설 하나를 더한다(이미 목표가 있으면 그대로). dock이 없으면 목표 그대로 */
export function withCoastalDock(
  targets: ReadonlyMap<string, number> | undefined,
  dock: string | undefined,
): ReadonlyMap<string, number> | undefined {
  if (dock === undefined || (targets?.get(dock) ?? 0) >= 1) return targets;
  const out = new Map(targets ?? []);
  out.set(dock, 1);
  return out;
}

/** 목표에 그 시설 n개(이미 더 큰 목표면 그대로, n이 0 이하면 그대로) */
export function withTarget(
  targets: ReadonlyMap<string, number> | undefined,
  facility: string,
  n: number,
): ReadonlyMap<string, number> | undefined {
  if (n <= 0 || (targets?.get(facility) ?? 0) >= n) return targets;
  const out = new Map(targets ?? []);
  out.set(facility, n);
  return out;
}

const now = (): number => Date.now();

/** 도시마다 바닷가 부두 판단(전략 배치 함수로 부두 자리가 있는지 본다 — 도시마다 COAST_TTL_MS 동안 기억) */
function coastalDocks(o: {
  readonly world: NpcBuildWorld;
  readonly places: ServerNpcBuilderOptions["places"];
  readonly rules: () => { readonly worldSeed: WorldSeedCoefficients };
}) {
  const known = new Map<number, { dock: string | undefined; atMs: number }>();
  // 바닷가 판단은 정박장 자리로 본다(조선소는 같은 물가 규칙이라 같은 도시에 선다)
  const dockId = (): string | undefined =>
    o.world.catalog().facilities.find((def) => isBerth(def) && def.build)?.id;
  const shipyardId = (): string | undefined =>
    o.world.catalog().facilities.find((def) => isShipyard(def) && def.build)?.id;
  return {
    /** 조선소 시설 ID(팩에 없으면 undefined) */
    shipyard: shipyardId,
    /** 그 도시가 바닷가면 정박장 시설 ID(아니면 undefined) */
    dockOf(cityId: number, ownerId: number): string | undefined {
      const cached = known.get(cityId);
      if (cached && now() - cached.atMs < COAST_TTL_MS) return cached.dock;
      const place = o.places.get(cityId);
      const map = place ? o.world.maps.get(place.mapKey) : undefined;
      const dock = dockId();
      let found: string | undefined;
      if (place && map && dock) {
        const spot = planNpcSpots({
          map,
          catalog: o.world.catalog(),
          facilities: o.world.service.facilities,
          city: { id: cityId, ...place },
          ownerId,
          anchors: o.world.service.places.cities().filter((cell) => cell.mapKey === place.mapKey),
          items: [dock],
          kinds: o.world.gatherKinds?.() ?? [],
          land: o.world.landOf?.(place.mapKey),
          seed: o.rules().worldSeed,
        }).placed[0];
        if (spot) found = dock;
      }
      known.set(cityId, { dock: found, atMs: now() });
      return found;
    },
    /** 짓기 자리를 못 찾은 정박장·조선소 → 그 도시는 바닷가가 아니다(기억 시간 동안) */
    noSpot(cityId: number, facility: string): void {
      if (facility === dockId() || facility === shipyardId())
        known.set(cityId, { dock: undefined, atMs: now() });
    },
  };
}
