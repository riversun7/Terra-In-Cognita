// 배를 세계에 잇기 — docs/adr/2026-11-13-boats.md. world.ts(1,000줄 상한)를 고치지 않고, 세계가 준비된 뒤(부팅 복구 끝) 세계의 부품(원장·건물·
// 노동 계약·정산)으로 배 서비스를 만든다. DB가 없는 세계(시험·DB 없는 서버)는 배가 없다(원장·건물이 없다).
// B2("바뀜 (2026-11-14, B2)", 기획 D-541 1271 나): 배 만들기 작업 줄(boat_jobs)을 읽어 다시 걸고, 만드는 시간 = 부두 레벨 1 건설 시간(M14 buildTimeAt) ×
// 설정 칸 boat_build_time_pm.
// B3("바뀜 (2026-11-14, B3)", 기획 D-542 1329 나): 이동 서비스에 "행성 값이 바다인 2차맵"을 붙인다(배가 띄우지 않은 바다 2차맵을 건너뛴다).
import { WATER_OCEAN } from "@terra/planet";
import { buildTimeAt } from "@terra/shared/facilityBuild";
import { TEST_PLANET_ID, type World } from "../world/world.ts";
import { type BoatService, createBoatService } from "./service.ts";
import { loadBoatJobs } from "./store.ts";

export interface WorldBoats {
  /** 준비되면 배 서비스(아직이면 undefined) */
  current(): BoatService | undefined;
  stop(): void;
}

export function startWorldBoats(
  world: World,
  options: { readonly now: () => number; readonly log: { error(obj: object, message: string): void } },
): WorldBoats {
  let built: BoatService | undefined;
  let stopped = false;
  void world.ready
    .then(async () => {
      const parts = world.persistence;
      if (stopped || !parts) return;
      const jobs = await loadBoatJobs(parts.pool, TEST_PLANET_ID);
      if (stopped) return;
      const facilities = parts.facilities;
      parts.travel.attachSea((mapKey) => {
        const land = world.terrain?.cellValues?.(mapKey);
        return land !== undefined && (land.water & WATER_OCEAN) !== 0;
      });
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
        dockBuildMs: (def) => {
          const catalog = facilities.service.places.catalog();
          return def.build
            ? buildTimeAt(def.build, 1, (item) => catalog.weightOf(item), facilities.rules().facilityBuild).ms
            : 0;
        },
        writer: parts.writer,
        planetId: TEST_PLANET_ID,
        jobs,
      });
    })
    .catch((error: unknown) => options.log.error({ err: error }, "boats start failed"));
  return {
    current: () => built,
    stop() {
      stopped = true;
      built?.stop();
    },
  };
}
