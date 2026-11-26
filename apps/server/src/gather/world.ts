// 채집을 세계에 잇기 — docs/adr/2026-11-07-gather-objects.md 7절. world.ts(1,000줄 상한)를 고치지 않고, 세계가 준비된 뒤(부팅 복구 끝) 세계의
// 부품(원장·정산·건물·노동 계약·보유 물건·정원사 오염)으로 채집 서비스를 만든다. 오브젝트 상태 줄은 그때 한 번 읽는다.
// DB가 없는 세계(시험·DB 없는 서버)는 채집이 없다(원장·건물이 없다).
// 채집소(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요", station.ts)도 여기서 만들어 노동 계약 서비스에 고리를 잇는다(labor.attachStation).
import type { SocietyCoefficients } from "@terra/sim";
import type { PlaceWorld } from "../facilities/places.ts";
import type { JobRecord } from "../facilities/state.ts";
import type { StorageContext } from "../facilities/storage.ts";
import { PROPERTY_UNIT_KINDS } from "../labor/wagePurse.ts";
import type { LaborWorkerEntry } from "../labor/workerEntry.ts";
import { type WorkerRest, attachWorkerRest } from "../labor/workerRest.ts";
import { unitLifeOf } from "../life/store.ts";
import { nationOfOwner } from "../world/nationVision.ts";
import { createGatherInjury } from "../world/unitCondition.ts";
import { UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN, isGuardianUnit } from "../world/unitKinds.ts";
import { TEST_PLANET_ID, type World } from "../world/world.ts";
import type { GatherKind } from "./kinds.ts";
import { registerGather } from "./registry.ts";
import { type GatherService, createGatherService } from "./service.ts";
import { type ObjectStore, createObjectStore, loadObjectStates } from "./state.ts";
import { type StationRuntime, createStationRuntime } from "./station.ts";
import { cellMaterials, oreSharePm, woodSharePm } from "@terra/shared/catchment";
import { exchangeRoom } from "../market/lockerRoom.ts";
import { withNpcStaff } from "../npc/npcLogistics.ts";
import { attachResidence, registerResidenceService } from "../residence/attach.ts";
import { floorQuoteOf } from "../residence/floorQuote.ts";
import { npcFloorWorldOf, npcRentWorldOf } from "../residence/npcRentWorld.ts";
import { loadResidenceRents } from "../residence/rent.ts";
import { loadResidences } from "../residence/store.ts";
import type { ResidenceService } from "../residence/service.ts";

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
  /** 플레이어 일꾼 쉼터(숙소 회복, 질문 1088 가) */
  readonly workerRest: WorkerRest;
  /** 사는 곳 고르기·조회(D-585 1 — residence/) */
  readonly residence: ResidenceService;
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
  /** 사는 곳 쉼 훑기 멈추기(질문 2485 가) */
  let stopResidence: (() => void) | undefined;
  void world.ready
    .then(async () => {
      const parts = world.persistence;
      if (stopped || !parts) return;
      const rows = await loadObjectStates(parts.pool, TEST_PLANET_ID);
      // 고른 사는 곳(D-585 1 — 아래 일꾼 쉼터 뒤에 장부를 만든다)
      const residenceRows = await loadResidences(parts.pool);
      // 주인이 내놓은 집세(D-591 2 — residence/rent.ts)
      const rentRows = await loadResidenceRents(parts.pool);
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
        // 관목·나뭇가지 더미(사용자 결정 2026-11-12 기본 재료 바닥 보장): 그 2차맵 칸 목재 몫(숲·목재 바닥, NPC 배후지와 같은 설정 칸)
        woodSharePm: (mapKey) => {
          const land = world.terrain?.cellValues?.(mapKey);
          return land ? woodSharePm(land, rules().worldSeed) : undefined;
        },
        // 지형별 오브젝트·어군(기획 D-536): 그 2차맵 칸 행성 값의 바이옴·물 비트
        terrainKind: (mapKey) => {
          const land = world.terrain?.cellValues?.(mapKey);
          return land ? { biomeId: land.biomeId, waterBits: land.water } : undefined;
        },
        // 채집 중 부상(D-521, docs/adr/2026-11-08-injury.md 5절): 직무 정산과 같은 판정·시드
        workInjury: createGatherInjury(),
        // 쉬러 가는 피로(유닛 생활 규칙 — 사용자 결정 2026-11-26): 이끄는 유닛이 그 피로에 닿으면 줄을 끝낸다
        restAt: (unitId) => unitLifeOf(world.persistence)?.of(unitId).restAt,
        // 채집 경험치(docs/adr/2026-11-26-gather-exp.md): 사이보그 본체면 사이보그 경험치로(그 밖 유닛은 아직 받지 않는다)
        gainExp: (unitId, amount) => {
          const cyborgs = world.persistence?.cyborgs;
          const userId = cyborgs?.userOfUnit(unitId);
          if (cyborgs && userId !== undefined) cyborgs.addExp(userId, amount);
        },
        // 배 창고 상한(D-568 배 단위 채집 — 배 서비스가 배 고리에 채운다)
        boatHoldGrams: (boatId) => world.persistence?.boatHooks.info(boatId)?.holdCapGrams,
        // 배 채집 일꾼(D-570 1821 — 낚시 선원 ↔ 포획 장비)
        boatCatch: (boatId) => world.persistence?.boatHooks.catchCrew(boatId),
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
        // 어군(기획 D-536)은 정산 시각의 자리로 반경을 본다
        objects: (mapKey) => service.objectsAt(mapKey, options.now()),
        pollution: (mapKey) => world.npc?.gardener.run.layer().get(mapKey) ?? 0,
        // 운반꾼(질문 1090 가): 그 채집소 일꾼 가운데 채집 줄이 없는 유닛. 노동 계약 일꾼이 없는 NPC 물류센터는 NPC 운반꾼(house-10 2301 — npcLogistics.ts)
        workersAt: (id) =>
          withNpcStaff(
            workersAt(id),
            world.npc?.economy?.centerStaff(id),
            (unitId) => world.npc?.world.units.get(unitId)?.owner,
          ),
        // 거래소 거래 직무(질문 2084): 그 자리 유닛이 반입·반출을 먼저 나르고 시간이 설정 칸 배(‰)
        deskHaulPm: (buildingId) => {
          const record = facilities.service.facilities.get(buildingId);
          const kind = record ? facilities.catalog().facility(record.facilityId)?.exchange : undefined;
          return kind === "goods" ? Math.floor(rules().business.exchangeDeskHaulPm) : undefined;
        },
        busy: (unitId) => service.acting(unitId),
        // 일꾼 다음 운반꾼(기획 D-569 1784): 받을 사람의 그 2차맵 휴먼·사이보그 유닛(사이보그 본체는 빼낸다 [임시])
        ownUnits: (ownerId, mapKey) => {
          const found: number[] = [];
          world.maps.get(mapKey)?.forEachUnit((unit) => {
            // 배에 탄 유닛은 빼낸다(움직이면 배가 움직인다 — 배 상하역 운반꾼, D-555 1505)
            if (
              unit.ownerId === ownerId &&
              unit.aboard === undefined &&
              !isGuardianUnit(unit) &&
              (unit.kind === UNIT_KIND_HUMAN || unit.kind === UNIT_KIND_CYBORG_UNIT)
            )
              found.push(unit.id);
          });
          return found;
        },
        // 자동 옮김은 주인 자동 구매(기획 D-569 1781 — 판매가, 매출로 잡힘)
        ownerSale: (ownerId, buildingId, asset, qty, atMs) =>
          facilities.service.ownerSale(ownerId, buildingId, asset, qty, atMs),
        // 물류센터 운반 대행(기획 D-576 — logistics/haulService.ts): 고른 물류센터·자동 맡기기
        haulService: facilities.haul,
      });
      facilities.attachHaulStaff((buildingId, mapKey, nowMs) => station.freeStaff(buildingId, mapKey, nowMs));
      // NPC 운반 맡기기도 같은 실제 운반 길(기획 대조 2274 — logistics/npcOutsource.ts)
      facilities.haul.attachCarrier((spec) => station.carry(spec));
      parts.labor.attachStation(station.hook);
      // 손으로 옮기기도 운반꾼·거리 시간(질문 1091 가)
      // 사업장 판매(business_buy)·창고 시설 꺼내기도 같은 운반꾼(기획 D-569 1784 — sellerId = 판 사람)
      // 물류센터 맡기기도 같은 via(기획 대조 2273 — 고른 물류센터·자동 맡기기, 사기 값 keep)
      facilities.service.attachStorageOut((ownerId, input, atMs, sellerId, keep) =>
        station.haulOut(
          ownerId,
          input.buildingId,
          input.asset,
          BigInt(input.qty),
          atMs,
          sellerId,
          input.via,
          keep,
        ),
      );
      // 물자 거래소 건물 넣기도 운반꾼(기획 D-564 1628 — docs/adr/2026-11-16-exchange-buildings.md)
      // 개인 창고 자리(기획 D-571 1943 — market/lockers.ts): 넘치면 떠나지 않는다(storage_full)
      facilities.service.attachExchangeIn((ownerId, input, atMs) => {
        const room = exchangeRoom(
          world,
          facilities,
          ownerId,
          input.buildingId,
          input.asset,
          BigInt(input.qty),
        );
        if (room === false) return "storage_full";
        return station.haulIn(ownerId, input.buildingId, input.asset, BigInt(input.qty), atMs, input.via);
      });
      // 플레이어 일꾼도 숙소에서 회복한다(질문 1088 가, labor/workerRest.ts) — 세계가 준비된 뒤 정산에 잇는다(DB가 있는 세계만 일꾼이 있다)
      const workerRest = attachWorkerRest({
        settlement: parts.settlement,
        labor: parts.labor,
        facilities,
        maps: world.maps,
        ledger: parts.ledger,
        rules,
        now: options.now,
        npc: () => world.npc,
      });
      // 컨디션 주거 = 그 일꾼의 쉼터(D-535 1152 나, facilities/world.ts attachRest)
      facilities.attachRest((unitId) => workerRest.restOf(unitId));
      // 사는 곳(D-585 1): 고른 거주지 표를 읽어 장부를 원장에 붙인다(주민세 거주·신용 조회가 읽는다)
      let npcRent: { runtime: unknown; world: ReturnType<typeof npcRentWorldOf> } = {
        runtime: undefined,
        world: undefined,
      };
      let npcFloor: { runtime: unknown; world: ReturnType<typeof npcFloorWorldOf> } = {
        runtime: undefined,
        world: undefined,
      };
      const residence = attachResidence({
        rows: residenceRows,
        rentRows,
        pool: parts.pool,
        ledger: parts.ledger,
        facilities,
        maps: world.maps,
        workerRest,
        // 사는 곳 정원 = 층 × 설정 칸, 층 올리기·집세 기간(질문 2481 가·D-591 — 줄기 governance-6·residence-3)
        rules: () => rules().business,
        // 집세·미리 내는 숙박비 화폐 = 그 건물의 돈(숙박비와 같다 — labor/workerRest.ts, facilities/buildingMoney.ts)
        feeAssetOf: (buildingId) => facilities.money(buildingId),
        floorQuote: (buildingId, ownerId) =>
          floorQuoteOf(
            { places, ledger: parts.ledger, rules, jobs: () => facilities.service.jobs },
            buildingId,
            ownerId,
          ),
        ownerOf,
        now: options.now,
        // NPC 휴먼 세 들기(npc-rent, 질문 2674 — D-555 1509): NPC 런타임이 켜진 뒤 읽는다(같은 런타임이면 같은 몫)
        npc: () => {
          if (world.npc !== npcRent.runtime)
            npcRent = { runtime: world.npc, world: npcRentWorldOf(world.npc, rules) };
          return npcRent.world;
        },
        // NPC 층 올리기(fixes-1117k 2762 — D-555 1509): 같은 층 공사 길(건물 서비스 npcJob kind floor)
        npcFloor: () => {
          if (world.npc !== npcFloor.runtime)
            npcFloor = { runtime: world.npc, world: npcFloorWorldOf(world.npc, rules) };
          return npcFloor.world;
        },
        npcFloorJob: (input) => facilities.service.npcJob({ kind: "floor", ...input }).ok,
        // 사이보그 본체·재산 없는 유닛은 플레이어(소유자) 지갑에서 집세를 부담한다(ADR 2026-11-24-house-membership-separation.md)
        useOwnerPurse(unitId) {
          for (const map of world.maps.values()) {
            const info = map.unitInfo(unitId);
            if (info) return !PROPERTY_UNIT_KINDS.has(info.kind);
          }
          return false;
        },
        // 전쟁 발발 시 적국 도시 주거지 강제 퇴거(ADR 2026-11-24-house-membership-separation.md)
        isHostileResidence(ownerId, cityId) {
          const npc = world.npc;
          if (!npc) return false;
          const myNationRow = nationOfOwner(world, ownerId);
          const myNationOwner = myNationRow === undefined ? undefined : npc.houses.ownerOfRow(myNationRow);
          const wars = myNationOwner === undefined ? undefined : npc.world.factions.get(myNationOwner)?.wars;
          if (!wars || wars.size === 0) return false;
          let cityOwner: number | undefined = npc.world.cities.get(cityId)?.owner;
          for (let depth = 0; depth < 8 && cityOwner !== undefined; depth++) {
            if (wars.has(cityOwner)) return true;
            cityOwner = npc.world.factions.get(cityOwner)?.overlord ?? undefined;
          }
          return false;
        },
      });
      registerResidenceService(service, residence.service);
      stopResidence = () => residence.stop();
      built = {
        service,
        store,
        station,
        workerRest,
        residence: residence.service,
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
      registerGather(parts, service);
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
      stopResidence?.();
    },
  };
}
