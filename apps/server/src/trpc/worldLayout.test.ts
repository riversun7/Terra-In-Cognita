// worldLayout 라우터 시험 — 권한(dev·admin만), 세계가 없으면 WORLD_NOT_READY, 다른 행성은 UNKNOWN_PLANET, 놓기는 본인·요청 IP로 부르고
// 칸 키 글자를 수로 바꾼다(기획 D-528).
import { cellKey } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { emptyEconomyCatalog } from "../economyView/catalog.ts";
import { createEconomyServices } from "../economyView/services.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { NO_HOLDINGS } from "../holdings/reads.ts";
import { createMailServices } from "../mail/list.ts";
import { createRosterServices } from "../roster/services.ts";
import { NO_VITALS } from "../vitals/reads.ts";
import type { PlacementActor, PlacementService } from "../world/placementService.ts";
import type { TrpcContext, Viewer } from "./context.ts";
import { createCallerFactory } from "./init.ts";
import { appRouter } from "./router.ts";

const PLAYER: Viewer = { id: "u-player", loginId: "player", roles: ["player"] };
const DEV: Viewer = { id: "u-dev", loginId: "dev", roles: ["dev"] };
const ADMIN: Viewer = { id: "u-admin", loginId: "admin", roles: ["admin"] };

function callerFor(viewer: Viewer, service?: PlacementService) {
  const ctx: TrpcContext = {
    contentVersion: "test",
    now: () => 0,
    viewer: () => Promise.resolve(viewer),
    admin: undefined,
    settings: undefined,
    planetEditor: undefined,
    home: createHomeServices(),
    roster: createRosterServices(),
    faction: createFactionScreenServices(),
    mail: createMailServices(),
    holdings: NO_HOLDINGS,
    vitals: NO_VITALS,
    economy: createEconomyServices({ catalog: emptyEconomyCatalog("test") }),
    worldLayout: {
      service: () => (service ? { planetId: "s2_test_planet", service } : undefined),
      ip: "10.0.0.1",
    },
  };
  return createCallerFactory(appRouter)(ctx);
}

function fakeService(calls: { entries: unknown; actor: PlacementActor }[]): PlacementService {
  return {
    view: async () => ({ planetId: "s2_test_planet", faceLevel: 9, gapCells: 30, reserved: [], nations: [] }),
    suggest: async () => ({ homes: [] }),
    place: async (entries, actor) => {
      calls.push({ entries, actor });
      return entries.map((entry) => ({
        code: entry.code,
        result: "ok" as const,
        mapKey: String(entry.mapKey),
        blocked: [],
        near: null,
      }));
    },
    clear: async () => true,
  };
}

describe("worldLayout 라우터", () => {
  it("플레이어는 FORBIDDEN, 서비스가 없으면 WORLD_NOT_READY, 다른 행성은 UNKNOWN_PLANET", async () => {
    await expect(callerFor(PLAYER).worldLayout.view({ planetId: "s2_test_planet" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(DEV).worldLayout.view({ planetId: "s2_test_planet" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "WORLD_NOT_READY",
    });
    await expect(
      callerFor(ADMIN, fakeService([])).worldLayout.view({ planetId: "other_planet" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "UNKNOWN_PLANET" });
  });

  it("놓기: 본인·요청 IP로, 칸 키 글자는 수로(칸 키가 아니면 0 → 서비스가 bad_cell)", async () => {
    const calls: { entries: unknown; actor: PlacementActor }[] = [];
    const caller = callerFor(DEV, fakeService(calls));
    const key = String(cellKey(1, 9, 256, 256));
    await caller.worldLayout.place({
      planetId: "s2_test_planet",
      placements: [
        { code: "npc_a", mapKey: key },
        { code: "npc_b", mapKey: "31" },
      ],
    });
    expect(calls[0]?.actor).toEqual({ userId: "u-dev", ip: "10.0.0.1" });
    expect(calls[0]?.entries).toEqual([
      { code: "npc_a", mapKey: Number(key) },
      { code: "npc_b", mapKey: 0 },
    ]);
    expect(await caller.worldLayout.clear({ planetId: "s2_test_planet", code: "npc_a" })).toEqual({
      cleared: true,
    });
    await expect(
      callerFor(PLAYER, fakeService(calls)).worldLayout.place({
        planetId: "s2_test_planet",
        placements: [{ code: "npc_a", mapKey: key }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
