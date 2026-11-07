// 건물 화면 자료의 월드 쪽(app.ts → tRPC 맥락) — docs/adr/2026-11-07-buildings-runtime.md
// 세계가 준비되고 DB가 있을 때만 자료를 준다(아니면 화면은 not_ready).
import { TEST_PLANET_ID, type World } from "../world/world.ts";
import type { FacilityScreenSource } from "./screen.ts";

export function facilityScreenSourceOf(world: World): FacilityScreenSource | undefined {
  const persistence = world.persistence;
  if (world.status().state !== "ready" || !persistence) return undefined;
  const { facilities, settlement, ledger, holdings, territory, labor } = persistence;
  return {
    view: {
      service: facilities.service,
      maps: world.maps,
      ledger,
      holdings,
      territory: () => territory,
      rules: facilities.rules,
      catalog: facilities.catalog,
      unitBusy: (unitId) => labor.unitBusy(unitId),
    },
    ownerOf: (userId) => settlement.findOwnerOfUser(userId),
    async beaconsOf(userId) {
      const view = await territory.mineView(TEST_PLANET_ID, userId);
      return (view?.beacons ?? []).map((beacon) => ({
        id: beacon.id,
        planetId: TEST_PLANET_ID,
        cellKey: beacon.cellKey,
      }));
    },
  };
}
