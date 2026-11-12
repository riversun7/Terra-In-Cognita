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
import type { SecondMap } from "../world/secondMap.ts";

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
  readonly log: { info(obj: object, message: string): void };
}

/** 서버 짓기 자리(위 머리 주석) */
export function createServerNpcBuilder(o: ServerNpcBuilderOptions): NpcBuilder {
  const { service } = o.world;
  /** 이번 실행에서 건 짓기·레벨 올리기·수리(도시 → 건물·종류) — 끝나면 settle이 도시 경제를 다시 맞춘다 */
  const started = new Map<number, { buildingId: number; kind: "build" | "upgrade" | "repair" }>();
  const mapOf = (cityId: number) => {
    const place = o.places.get(cityId);
    const map = place ? o.world.maps.get(place.mapKey) : undefined;
    return place && map ? { place, map } : undefined;
  };
  /** 그 도시에 그 세력의 짓기·레벨 올리기·수리 작업이 있나 */
  const building = (ownerId: number, cityId: number): boolean => {
    for (const job of service.jobs.values()) {
      if (job.ownerId !== ownerId || job.buildingId === null) continue;
      if (job.kind !== "build" && job.kind !== "upgrade" && job.kind !== "repair") continue;
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
      return hasGoods(
        o.ledger,
        faction.id,
        materials,
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
      if (!spot) return false;
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
      }
    | undefined;
  /** 나라 성격 목표(질문 1142 다). 없으면 목표 없음 */
  readonly targetsOf?: NpcBuildRun["targetsOf"];
  readonly world: NpcBuildWorld | undefined;
  readonly ledger: Ledger;
  readonly places: ServerNpcBuilderOptions["places"];
  readonly rules: () => { readonly worldSeed: WorldSeedCoefficients };
  readonly log: ServerNpcBuilderOptions["log"];
}): NpcBuildRun | undefined {
  const { econ, world } = o;
  if (!econ || !world) return undefined;
  const builder = createServerNpcBuilder({
    world,
    ledger: o.ledger,
    places: o.places,
    seed: () => o.rules().worldSeed,
    refresh: (cityId, nowMs) => econ.refreshCity(cityId, nowMs),
    workersOf: (buildingId) => econ.economy.facilities.get(buildingId)?.workers ?? 0,
    bedsOf: (cityId) => econ.restPlan(cityId)?.bedTotal,
    log: o.log,
  });
  return { economy: econ.economy, builder, ...(o.targetsOf ? { targetsOf: o.targetsOf } : {}) };
}
