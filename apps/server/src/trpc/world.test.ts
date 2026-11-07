// world 라우터 시험 — 로그인, 세계가 없으면 not_ready(빈 목록), 서비스가 있으면 로그인한 본인으로 부른다,
// 출력 타입을 공용 응답 타입(@terra/shared/worldMap)에 넣을 수 있는지. 위도·경도 도우미(표시용)도 본다.
import { cellKey } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import type { WorldCitiesResponse, WorldPositionResponse } from "@terra/shared/worldMap";
import type { inferRouterOutputs } from "@trpc/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createEconomyServices } from "../economyView/services.ts";
import { emptyEconomyCatalog } from "../economyView/catalog.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { NO_HOLDINGS } from "../holdings/reads.ts";
import { createMailServices } from "../mail/list.ts";
import { createRosterServices } from "../roster/services.ts";
import { NO_VITALS } from "../vitals/reads.ts";
import { latLonOfDirection, placeLatLon } from "../worldMap/reads.ts";
import type { TrpcContext, Viewer, WorldMapReads } from "./context.ts";
import { createCallerFactory } from "./init.ts";
import { type AppRouter, appRouter } from "./router.ts";

const NOW = Date.UTC(2026, 10, 7, 3, 0, 0);
const PLAYER: Viewer = { id: "u-player", loginId: "player", roles: ["player"] };

function callerFor(viewer: Viewer | null, worldMap?: WorldMapReads) {
  const ctx: TrpcContext = {
    contentVersion: "test",
    now: () => NOW,
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
    worldMap: worldMap ? () => worldMap : undefined,
  };
  return createCallerFactory(appRouter)(ctx);
}

describe("world 라우터", () => {
  it("로그인하지 않으면 UNAUTHORIZED", async () => {
    await expect(callerFor(null).world.cities()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(callerFor(null).world.myPosition()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("세계가 없으면 not_ready(빈 목록·자리 없음)", async () => {
    const caller = callerFor(PLAYER);
    expect(await caller.world.cities()).toMatchObject({ status: "not_ready", cities: [], factions: [] });
    expect(await caller.world.myPosition()).toMatchObject({
      status: "not_ready",
      position: null,
      fallbackMapKey: null,
    });
  });

  it("서비스가 있으면 로그인한 본인·서버 시각으로 부른다", async () => {
    const seen: string[] = [];
    const caller = callerFor(PLAYER, {
      cities: (viewer, nowMs) => {
        seen.push(`cities:${viewer.id}:${nowMs}`);
        return Promise.resolve({
          status: "ready",
          planetId: "s2_test_planet",
          faceLevel: 9,
          factions: [],
          cities: [],
          hulls: [],
          milliPerRadian: 0,
          myFactionId: null,
          generatedAt: nowMs,
        });
      },
      position: (viewer, nowMs) => {
        seen.push(`position:${viewer.id}:${nowMs}`);
        return { status: "ready", position: null, fallbackMapKey: 42, generatedAt: nowMs };
      },
    });
    expect((await caller.world.cities()).status).toBe("ready");
    expect((await caller.world.myPosition()).fallbackMapKey).toBe(42);
    expect(seen).toEqual([`cities:u-player:${NOW}`, `position:u-player:${NOW}`]);
  });

  it("출력 타입은 공용 응답 타입에 들어간다", () => {
    type Outputs = inferRouterOutputs<AppRouter>["world"];
    expectTypeOf<Outputs["cities"]>().toExtend<WorldCitiesResponse>();
    expectTypeOf<Outputs["myPosition"]>().toExtend<WorldPositionResponse>();
  });
});

describe("위도·경도 도우미(표시용)", () => {
  it("축 방향: 북극 +z, 경도 0 = +x, 동쪽 +y", () => {
    expect(latLonOfDirection(0, 0, 5)).toEqual({ latDeg: 90, lonDeg: 0 });
    expect(latLonOfDirection(2, 0, 0)).toEqual({ latDeg: 0, lonDeg: 0 });
    expect(latLonOfDirection(0, 3, 0)).toEqual({ latDeg: 0, lonDeg: 90 });
  });

  it("2차맵 안 배치 칸 자리는 그 2차맵 칸 가까이, 틀린 칸이면 2차맵 칸 가운데", () => {
    const mapKey = cellKey(0, 9, 282, 328);
    const [x, y, z] = cellCenter(mapKey);
    const center = latLonOfDirection(x, y, z);
    const corner = placeLatLon(mapKey, 0, 0);
    // F9 칸 한 변 ≈ 90° ÷ 512 ≈ 0.18°: 모서리 배치 칸은 가운데에서 반 칸 안
    expect(Math.abs(corner.latDeg - center.latDeg)).toBeLessThan(0.18);
    expect(Math.abs(corner.lonDeg - center.lonDeg)).toBeLessThan(0.18);
    expect(corner).not.toEqual(center);
    expect(placeLatLon(mapKey, -1, 300)).toEqual(center);
  });
});
