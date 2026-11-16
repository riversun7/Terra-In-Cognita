// 배를 세계에 잇기 — docs/adr/2026-11-13-boats.md, docs/adr/2026-11-15-shipyard-harbor.md. world.ts(1,000줄 상한)를 고치지 않고, 세계가 준비된 뒤(부팅 복구 끝)
// 세계의 부품(원장·건물·노동 계약·정산)으로 배 서비스를 만든다. DB가 없는 세계(시험·DB 없는 서버)는 배가 없다(원장·건물이 없다).
// - 먼저 옛 배·부두 지우기(기획 D-547 1499 "배·부두만 지움", purge.ts — 행성마다 한 번)를 한 뒤 작업·상태·시설 설정 줄을 읽는다.
// - 배 고리(hooks.ts)에 배 종류·내구도 빠르기와 표시 정보를 채운다.
// - 받기 범위의 나라는 시야 공유와 같은 나라(world/nationVision.ts), 전쟁은 faction_wars(건물 공격과 같은 읽기).
// - 요금 화폐(D-559 1524 "요금은 그 나라 화폐"): 시설이 선 도시 → 그 도시 주인 세력의 나라 화폐(도시 경제 런타임, 거래소와 같은 읽기). 도시·경제가 없으면 서버 시험 화폐.
// B3("바뀜 (2026-11-14, B3)", 기획 D-542 1329 나): 이동 서비스에 "행성 값이 바다인 2차맵"을 붙인다(배가 띄우지 않은 바다 2차맵을 건너뛴다).
import { WATER_OCEAN } from "@terra/planet";
import { convertFair, fairPrice, fairPriceView, laborCostOf } from "@terra/shared/fairPrice";
import { buildingPlace } from "../facilities/places.ts";
import { TEST_PLANET_ID, type World } from "../world/world.ts";
import { nationOfOwner } from "../world/nationVision.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { GatherKind } from "../gather/kinds.ts";
import type { GatherService } from "../gather/service.ts";
import { type NpcFleet, createNpcFleet } from "./npcFleet.ts";
import { purgeLegacyBoats } from "./purge.ts";
import { type BoatService, createBoatService } from "./service.ts";
import { loadBoatFacilities, loadBoatJobs, loadBoatStates, pruneBoatStates } from "./store.ts";

export interface WorldBoats {
  /** 준비되면 배 서비스(아직이면 undefined) */
  current(): BoatService | undefined;
  stop(): void;
}

export function startWorldBoats(
  world: World,
  options: {
    readonly now: () => number;
    readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
    /** 채집 서비스(NPC 배 어부 — 없으면 NPC 배를 띄우지 않는다) */
    readonly gather?: (() => GatherService | undefined) | undefined;
    readonly kinds?: (() => readonly GatherKind[]) | undefined;
  },
): WorldBoats {
  let built: BoatService | undefined;
  let fleet: NpcFleet | undefined;
  let stopped = false;
  void world.ready
    .then(async () => {
      const parts = world.persistence;
      if (stopped || !parts) return;
      const facilities = parts.facilities;
      // 옛 배·부두 지우기(D-547 1499) — 서비스를 만들기 전에(작업·상태 줄을 읽기 전에)
      await purgeLegacyBoats({
        pool: parts.pool,
        planetId: TEST_PLANET_ID,
        maps: world.maps,
        places: facilities.service.places,
        ledger: parts.ledger,
        now: options.now,
        durable: () => parts.writer.durable(),
        log: options.log,
      });
      await pruneBoatStates(parts.pool, TEST_PLANET_ID);
      const [jobs, states, facilityRows] = await Promise.all([
        loadBoatJobs(parts.pool, TEST_PLANET_ID),
        loadBoatStates(parts.pool, TEST_PLANET_ID),
        loadBoatFacilities(parts.pool, TEST_PLANET_ID),
      ]);
      if (stopped) return;
      parts.travel.attachSea((mapKey) => {
        const land = world.terrain?.cellValues?.(mapKey);
        return land !== undefined && (land.water & WATER_OCEAN) !== 0;
      });
      const isNpc = (ownerId: number): boolean => {
        const row = parts.owners.get(ownerId);
        return world.npc !== undefined && row !== undefined && row.userId === null && row.factionId !== null;
      };
      // 요금 화폐(D-559 1524): 시설이 선 도시 주인 나라의 화폐
      const feeAssetOf = (buildingId: number): string | undefined => {
        const cityId = facilities.service.places?.facilities.get(buildingId)?.cityId;
        const runtime = world.npc;
        if (cityId === null || cityId === undefined || !runtime?.economy) return undefined;
        const owner = runtime.world.cities.get(cityId)?.owner;
        return owner === undefined ? undefined : runtime.economy.economy.currencyOf.get(owner);
      };
      built = createBoatService({
        maps: world.maps,
        now: options.now,
        log: options.log,
        ledger: parts.ledger,
        rules: () => facilities.rules().boats,
        nextUnitId: parts.nextId.unit,
        ownerOf: (userId) => parts.settlement.findOwnerOfUser(userId),
        places: () => facilities.service.places,
        works: (id) => facilities.service.works(id),
        unitBusy: (unitId) => parts.labor.unitBusy(unitId) || facilities.service.unitInJob(unitId),
        isNpc,
        nationOf: (ownerId) => nationOfOwner(world, ownerId),
        atWar: async (a, b) => {
          if (a === b) return false;
          // NPC 사회 런타임이 쓰기 대기열로 쓴 전쟁 줄까지 본다
          await parts.writer.durable();
          const found = await parts.pool.query(
            `select 1 from faction_wars where faction_a = $1 and faction_b = $2 and state = 'war'`,
            [Math.min(a, b), Math.max(a, b)],
          );
          return found.rows.length > 0;
        },
        feeAssetOf,
        feeAsset: ASSET_CREDIT,
        business: facilities.business,
        // 배 주문·수리 적정가(D-570 1822): 재료 기준 값 + 조선소 일꾼 인건비 × 시간 + 수수료 + 세금. 셈은 서버 기준 통화 눈금, 보이는 값·받는 값은 그
        // 항구 나라 화폐(기획 대조 2158 — 지난 환전 체결가, 없으면 같은 값)
        fairOf: (buildingId, materials, ms) => {
          const owner = buildingPlace(facilities.service.places, buildingId)?.ownerId ?? null;
          const fair = fairPrice({
            materials,
            labor: laborCostOf(parts.labor.hourlyLabor(buildingId), ms),
            feePm: facilities.rules().business.serviceFeePm,
            taxBp: owner === null ? 0 : facilities.business.taxRateOf(buildingId, owner),
          });
          const asset = feeAssetOf(buildingId);
          const economy = world.npc?.economy?.economy;
          if (asset === undefined || asset === ASSET_CREDIT || !economy) return fairPriceView(fair);
          // 기준 통화 C → 나라 화폐 = C × 로트 ÷ (로트당 기준 통화 값)
          const rate = economy.fx.get(asset)?.lastPrice ?? economy.settings.fxLot;
          return fairPriceView(convertFair(fair, economy.settings.fxLot, rate));
        },
        writer: parts.writer,
        planetId: TEST_PLANET_ID,
        jobs,
        states,
        facilityRows,
      });
      const service = built;
      parts.boatHooks.attach({
        speedPm: (unitId) => service.speedPm(unitId),
        info: (unitId) => service.info(unitId),
        catchCrew: (unitId) => service.catchCrew(unitId),
      });
      // NPC 배(기획 D-547 1497 — 플레이어와 같은 규칙): NPC 사회가 켜진 세계에서 세력 정박장마다(npcFleet.ts)
      const gather = options.gather;
      if (gather)
        fleet = createNpcFleet({
          maps: world.maps,
          now: options.now,
          log: options.log,
          rules: () => facilities.rules(),
          places: () => facilities.service.places,
          works: (id) => facilities.service.works(id),
          isNpc,
          boats: () => built,
          gather,
          kinds: options.kinds ?? (() => []),
        });
    })
    .catch((error: unknown) => options.log.error({ err: error }, "boats start failed"));
  return {
    current: () => built,
    stop() {
      stopped = true;
      world.persistence?.boatHooks.attach(undefined);
      built?.stop();
      fleet?.stop();
    },
  };
}
