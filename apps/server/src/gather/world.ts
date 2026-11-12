// 채집을 세계에 잇기 — docs/adr/2026-11-07-gather-objects.md 7절. world.ts(1,000줄 상한)를 고치지 않고, 세계가 준비된 뒤(부팅 복구 끝) 세계의
// 부품(원장·정산·건물·노동 계약·보유 물건·정원사 오염)으로 채집 서비스를 만든다. 오브젝트 상태 줄은 그때 한 번 읽는다.
// DB가 없는 세계(시험·DB 없는 서버)는 채집이 없다(원장·건물이 없다).
// 채집소(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요", station.ts)도 여기서 만들어 노동 계약 서비스에 고리를 잇는다(labor.attachStation).
import type { SocietyCoefficients } from "@terra/sim";
import type { PlaceWorld } from "../facilities/places.ts";
import type { JobRecord } from "../facilities/state.ts";
import type { StorageContext } from "../facilities/storage.ts";
import type { LaborWorkerEntry } from "../labor/service.ts";
import { createGatherInjury } from "../world/unitCondition.ts";
import { TEST_PLANET_ID, type World } from "../world/world.ts";
import type { GatherKind } from "./kinds.ts";
import { type GatherService, createGatherService } from "./service.ts";
import { type ObjectStore, createObjectStore, loadObjectStates } from "./state.ts";
import { type StationRuntime, createStationRuntime } from "./station.ts";
import { cellMaterials, oreSharePm } from "@terra/shared/catchment";

/** 조회가 쓰는 채집 세계 */
export interface GatherWorld {
  readonly service: GatherService;
  readonly store: ObjectStore;
  kinds(): readonly GatherKind[];
  places(): PlaceWorld | undefined;
  storage(): StorageContext | undefined;
  ownerOf(userId: string): number | undefined;
  works(buildingId: number): boolean;
  workersAt(buildingId: number): readonly LaborWorkerEntry[];
  /** 채집소(반경 안 오브젝트·채집소 창고·레벨 버프·자동 옮김) */
  readonly station: StationRuntime;
  /** 세력·사회 계수표(설정 칸 실효 값) */
  rules(): SocietyCoefficients;
  /** 건물 작업(레벨 올리는 중 등) */
  jobs(): ReadonlyMap<number, JobRecord>;
}

export interface WorldGather {
  /** 준비되면 채집 세계(아직이면 undefined) */
  current(): GatherWorld | undefined;
  stop(): void;
}

export function startWorldGather(
  world: World,
  options: {
    readonly kinds: () => readonly GatherKind[];
    readonly now: () => number;
    readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
  },
): WorldGather {
  let built: GatherWorld | undefined;
  let stopped = false;
  void world.ready
    .then(async () => {
      const parts = world.persistence;
      if (stopped || !parts) return;
      const rows = await loadObjectStates(parts.pool, TEST_PLANET_ID);
      if (stopped) return;
      const store = createObjectStore({ planetId: TEST_PLANET_ID, rows, writer: parts.writer });
      const facilities = parts.facilities;
      const rules = (): SocietyCoefficients => facilities.rules();
      const places = (): PlaceWorld | undefined => facilities.service.places;
      const works = (id: number): boolean => facilities.service.works(id);
      const ownerOf = (userId: string): number | undefined => parts.settlement.findOwnerOfUser(userId);
      const workersAt = (id: number) => parts.labor.workersAt(id);
      const service = createGatherService({
        maps: world.maps,
        now: options.now,
        log: options.log,
        kinds: options.kinds,
        rules,
        ledger: parts.ledger,
        store,
        ownerOf,
        places,
        works,
        unitBusy: (unitId) => parts.labor.unitBusy(unitId) || facilities.service.unitInJob(unitId),
        // 내가 내 시설에 직무 배치한 유닛(채집을 시키면 배치를 푼다)
        assignedBy: (ownerId, unitId) => {
          const placeWorld = places();
          if (!placeWorld) return undefined;
          for (const record of placeWorld.facilities.values()) {
            const owner = [...world.maps.values()]
              .map((map) => map.buildingOwner(record.buildingId))
              .find((value) => value !== undefined);
            if (owner !== ownerId) continue;
            if (
              workersAt(record.buildingId).some((entry) => entry.unitId === unitId && entry.via === "assign")
            )
              return record.buildingId;
          }
          return undefined;
        },
        unassign: (userId, unitId) => parts.labor.unassign(userId, unitId),
        assign: (userId, buildingId, unitId) => parts.labor.assign(userId, buildingId, unitId),
        workersAt,
        primaries: (unitId) => parts.holdings.primariesOf(unitId),
        pollution: (mapKey) => world.npc?.gardener.run.layer().get(mapKey) ?? 0,
        // 밭·목초지의 기후 조건: 그 2차맵 칸 행성 값의 원자재(문턱 = NPC 씨앗 설정 칸, docs/adr/2026-11-11-city-catchment.md)
        materials: (mapKey) => {
          const land = world.terrain?.cellValues?.(mapKey);
          return land ? cellMaterials(land, rules().worldSeed) : undefined;
        },
        // 노두(기획 D-534 질문 1083 나): 그 2차맵 칸 행성 값의 광석 고도 몫(NPC 배후지와 같은 설정 칸 ore_share_*)
        oreSharePm: (mapKey) => {
          const land = world.terrain?.cellValues?.(mapKey);
          return land ? oreSharePm(land, rules().worldSeed) : undefined;
        },
        // 채집 중 부상(D-521, docs/adr/2026-11-08-injury.md 5절): 직무 정산과 같은 판정·시드
        workInjury: createGatherInjury(),
        ready: () => world.status().state === "ready",
      });
      const station = createStationRuntime({
        maps: world.maps,
        now: options.now,
        log: options.log,
        kinds: options.kinds,
        rules,
        ledger: parts.ledger,
        store,
        places,
        works,
        objects: (mapKey) => service.objects(mapKey),
        pollution: (mapKey) => world.npc?.gardener.run.layer().get(mapKey) ?? 0,
      });
      parts.labor.attachStation(station.hook);
      built = {
        service,
        store,
        station,
        rules,
        jobs: () => facilities.service.jobs,
        kinds: options.kinds,
        places,
        storage: () => {
          const placeWorld = places();
          return placeWorld
            ? {
                world: placeWorld,
                ledger: parts.ledger,
                catalog: placeWorld.catalog(),
                rules: rules().facilityRuntime,
              }
            : undefined;
        },
        ownerOf,
        works,
        workersAt,
      };
      options.log.info({ objectStates: rows.length }, "gather objects ready");
    })
    .catch((error: unknown) => {
      options.log.error({ err: error }, "gather objects failed to start");
    });
  return {
    current: () => built,
    stop() {
      stopped = true;
      built?.service.stop();
      built?.station.stop();
    },
  };
}
