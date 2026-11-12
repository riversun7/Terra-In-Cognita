// NPC 도시 증축(서버 짓기 자리) — 기획 D-534(질문 1101 나 "NPC 증축은 유저와 같은 규칙", D-212), docs/adr/2026-11-11-city-building-layout.md
// "바뀜 (2026-11-12, NPC 증축)". 무엇을 지을지·재료·시간은 시뮬과 같은 함수(@terra/sim buildPolicy — NPC 판단 decide가 구인 규칙식 다음에 부른다).
// 여기는 서버 몫만 한다:
// - 자리: 전략 배치 함수(facilities/npcPlacement.ts planNpcSpots — 세계 씨앗과 같은 함수)로 그 도시에 그 세력이 가진 건물을 두고 하나를 놓는다.
// - 짓기: 건물 서비스 npcBuild(플레이어 짓기와 같은 재료 자리·건물 칸·짓기 작업 — 저장·복구도 같다).
// - 짓는 중 = 그 세력의 짓기 작업이 그 도시 시설에 걸려 있음(다시 켜도 작업 줄로 안다). 다 지으면 다음 판단(settle)에 도시 경제가 시설을 다시
//   맞춘다(refreshCity). 서버를 다시 켜 기억을 잃은 짓기는 다음 하루 끝 시설 맞추기(afterDay)가 넣는다.
import type { CityCell } from "@terra/shared/goodsPlaces";
import type {
  Economy,
  NpcBuilder,
  NpcBuildRun,
  NpcBuildSite,
  SimFaction,
  WorldSeedCoefficients,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import { hasGoods } from "../facilities/materials.ts";
import { planNpcSpots } from "../facilities/npcPlacement.ts";
import type { SeedLand } from "../facilities/npcSeed.ts";
import { materialScope } from "../facilities/places.ts";
import type { FacilityService } from "../facilities/service.ts";
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
  readonly log: { info(obj: object, message: string): void };
}

/** 서버 짓기 자리(위 머리 주석) */
export function createServerNpcBuilder(o: ServerNpcBuilderOptions): NpcBuilder {
  const { service } = o.world;
  /** 이번 실행에서 건 짓기(도시 → 건물) — 다 지으면 settle이 도시 경제에 넣는다 */
  const started = new Map<number, number>();
  const mapOf = (cityId: number) => {
    const place = o.places.get(cityId);
    const map = place ? o.world.maps.get(place.mapKey) : undefined;
    return place && map ? { place, map } : undefined;
  };
  /** 그 도시에 그 세력의 짓기 작업이 있나 */
  const building = (ownerId: number, cityId: number): boolean => {
    for (const job of service.jobs.values()) {
      if (job.kind !== "build" || job.ownerId !== ownerId || job.buildingId === null) continue;
      if (service.facilities.get(job.buildingId)?.cityId === cityId) return true;
    }
    return false;
  };
  const anchorsOf = (mapKey: number): CityCell[] =>
    service.places.cities().filter((cell) => cell.mapKey === mapKey);
  return {
    settle(faction: SimFaction, nowMs: number) {
      let done = 0;
      for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
        const buildingId = started.get(cityId);
        if (buildingId === undefined) continue;
        const record = service.facilities.get(buildingId);
        if (record && record.level < 1) continue;
        started.delete(cityId);
        if (!record) continue;
        o.refresh(cityId, nowMs);
        done += 1;
      }
      return done;
    },
    site(faction, cityId): NpcBuildSite | undefined {
      const at = mapOf(cityId);
      if (!at) return undefined;
      const counts = new Map<string, number>();
      for (const record of service.facilities.values())
        if (record.cityId === cityId && at.map.buildingOwner(record.buildingId) === faction.id)
          counts.set(record.facilityId, (counts.get(record.facilityId) ?? 0) + 1);
      const waiting =
        started.has(cityId) && (service.facilities.get(started.get(cityId) ?? -1)?.level ?? 1) >= 1;
      return { counts, busy: building(faction.id, cityId) || waiting };
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
      started.set(cityId, result.buildingId);
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
  };
}

/** NPC 판단 맥락의 증축 칸(runtime.ts): 도시 경제와 짓기 입력이 있을 때만. 없으면 undefined(짓지 않는다) */
export function npcBuildRunOf(o: {
  readonly econ: { readonly economy: Economy; refreshCity(cityId: number, nowMs: number): void } | undefined;
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
    log: o.log,
  });
  return { economy: econ.economy, builder };
}
