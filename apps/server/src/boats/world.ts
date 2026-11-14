// 배를 세계에 잇기 — docs/adr/2026-11-13-boats.md. world.ts(1,000줄 상한)를 고치지 않고, 세계가 준비된 뒤(부팅 복구 끝) 세계의 부품(원장·건물·
// 노동 계약·정산)으로 배 서비스를 만든다. DB가 없는 세계(시험·DB 없는 서버)는 배가 없다(원장·건물이 없다).
import type { World } from "../world/world.ts";
import { type BoatService, createBoatService } from "./service.ts";

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
    .then(() => {
      const parts = world.persistence;
      if (stopped || !parts) return;
      const facilities = parts.facilities;
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
