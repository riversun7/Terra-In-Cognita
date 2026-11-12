// 자원 분포 지도 시험(DB 없음) — 셈이 서버 경제와 같은 함수(cellSharesPm "supply"·highOrePm)인지, 규칙 열쇠·ETag·경로 답
import { gunzipSync } from "node:zlib";
import { cellKey } from "@terra/planet";
import { runPlanetGenerator } from "@terra/planet/generator";
import {
  encodePlanetValues,
  planetCellValuesFromFile,
  planetValuesFromGeneration,
} from "@terra/planet/secondMap";
import { decodePlanetResource, planetResourcePath, pmToByte } from "@terra/protocol";
import { cellSharesPm, highOrePm } from "@terra/shared/catchment";
import { START_WORLD_SEED } from "@terra/sim";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { loadPack } from "../planetEditor/testSupport.ts";
import { TEST_PLANET_ID } from "../world/world.ts";
import { computeResourcePlanes, createResourceMaps, resourceRulesKey } from "./resourceMap.ts";
import { registerPlanetRoutes } from "./routes.ts";
import { createInlineBaker } from "./baker.ts";
import { createPlanetService } from "./service.ts";
import { planetSpecsFromPack } from "./sources.ts";

const LEVEL = 5;
const spec = planetSpecsFromPack(loadPack().pack).find((item) => item.id === TEST_PLANET_ID);
if (!spec) throw new Error("pack has no S2 test planet");
const input = { ...spec.input, faceLevel: LEVEL };
const details = runPlanetGenerator(input);
const bytes = encodePlanetValues(
  planetValuesFromGeneration(
    details.fields,
    details,
    input.biomes.map((biome) => biome.id),
  ),
);
const rules = START_WORLD_SEED;
const noYield = () => Promise.resolve();
const SILENT_LOG = { info: () => undefined, warn: () => undefined, error: () => undefined };

const PLAYER: Viewer = {
  id: "00000000-0000-4000-8000-000000000002",
  loginId: "Fake_Player",
  roles: ["player"],
};

describe("자원 분포 지도 셈", () => {
  it("칸마다 서버 경제와 같은 몫(cellSharesPm supply·highOrePm)을 바이트로 담는다", async () => {
    const { faceLevel, level, planes, high } = await computeResourcePlanes(bytes, rules, noYield);
    expect(faceLevel).toBe(LEVEL);
    expect(level).toBe(LEVEL);
    expect(planes).toHaveLength(6);
    const n = 1 << LEVEL;
    let landWithOre = 0;
    for (const [face, i, j] of [
      [0, 3, 7],
      [1, 20, 11],
      [2, 31, 0],
      [4, 16, 16],
      [5, 9, 28],
    ] as const) {
      const land = planetCellValuesFromFile(bytes, cellKey(face, LEVEL, i, j));
      const shares = cellSharesPm(land, rules, "supply");
      const index = face * n * n + j * n + i;
      expect(planes[0]?.[index]).toBe(pmToByte(shares.ore));
      expect(planes[1]?.[index]).toBe(pmToByte(shares.wood));
      // 약초·축산물은 칸 자리 노이즈를 쓴다(기획 D-536) — 행성 값 읽개에 붙인 자리가 서버 경제(PlanetCellValues)와 같은 값을 낸다
      expect(planes[2]?.[index]).toBe(pmToByte(shares.herb));
      expect(planes[4]?.[index]).toBe(pmToByte(shares.livestock));
      expect(planes[5]?.[index]).toBe(pmToByte(shares.fish));
      expect(high[index]).toBe(pmToByte(highOrePm(land, rules)));
      if (shares.ore > 0) landWithOre += 1;
    }
    expect(landWithOre).toBeGreaterThan(0);
  });

  it("규칙 열쇠: 몫 규칙 칸이 바뀌면 다르다", () => {
    expect(resourceRulesKey(rules)).not.toBe(
      resourceRulesKey({ ...rules, oreShareHillPm: rules.oreShareHillPm + 1 }),
    );
    // 목재·약초·목장 바이옴 규칙(기획 D-536)
    expect(resourceRulesKey(rules)).not.toBe(
      resourceRulesKey({ ...rules, herbNoiseSeed: rules.herbNoiseSeed + 1 }),
    );
    expect(resourceRulesKey(rules)).not.toBe(
      resourceRulesKey({ ...rules, livestockPasturePm: rules.livestockPasturePm - 1 }),
    );
  });

  it("공개 행성·원자재·준비를 보고, 규칙이 바뀌면 다시 셈해 ETag가 바뀐다", async () => {
    let current = rules;
    let ready = false;
    let computed = 0;
    const maps = createResourceMaps({
      planetId: TEST_PLANET_ID,
      ready: () => ready,
      values: () => {
        computed += 1;
        return Promise.resolve(bytes);
      },
      rules: () => current,
      definitionHash: "a".repeat(64),
      yieldNow: noYield,
    });
    expect((await maps.get(TEST_PLANET_ID, "ore")).kind).toBe("not_ready");
    ready = true;
    expect((await maps.get("s2_editor_planet", "ore")).kind).toBe("unknown_planet");
    expect((await maps.get(TEST_PLANET_ID, "gold")).kind).toBe("unknown_material");
    const ore = await maps.get(TEST_PLANET_ID, "ore");
    const wood = await maps.get(TEST_PLANET_ID, "wood");
    if (ore.kind !== "ok" || wood.kind !== "ok") throw new Error("expected maps");
    expect(computed).toBe(1);
    const decoded = decodePlanetResource(gunzipSync(ore.file.gzip));
    expect(decoded.material).toBe(0);
    expect(decoded.high).not.toBeNull();
    expect(decodePlanetResource(gunzipSync(wood.file.gzip)).high).toBeNull();
    current = { ...rules, mineMinHeightM: rules.mineMinHeightM + 50 };
    const again = await maps.get(TEST_PLANET_ID, "ore");
    if (again.kind !== "ok") throw new Error("expected map");
    expect(computed).toBe(2);
    expect(again.file.etag).not.toBe(ore.file.etag);
  });
});

/** 자원 분포 지도 경로만 붙인 Fastify(로그인 = viewer) */
async function serve(viewer: Viewer | null) {
  const app = Fastify();
  const maps = createResourceMaps({
    planetId: TEST_PLANET_ID,
    ready: () => true,
    values: () => Promise.resolve(bytes),
    rules: () => rules,
    definitionHash: "b".repeat(64),
    yieldNow: noYield,
  });
  // 이 시험은 자원 경로만 부른다(행성 없는 행성 서비스)
  const planets = createPlanetService({ sources: [], baker: createInlineBaker(), log: SILENT_LOG });
  registerPlanetRoutes(app, {
    planets,
    viewer: () => Promise.resolve(viewer),
    now: Date.now,
    resources: maps,
  });
  await app.ready();
  return app;
}

describe("자원 분포 지도 경로", () => {
  it("로그인 → gzip 이진(no-cache + ETag), 같은 ETag면 304, 없는 원자재 404, 로그인 안 하면 401", async () => {
    const app = await serve(PLAYER);
    const url = planetResourcePath(TEST_PLANET_ID, "crop");
    const res = await app.inject({ method: "GET", url, headers: { "accept-encoding": "gzip" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers["cache-control"]).toBe("private, no-cache");
    const decoded = decodePlanetResource(gunzipSync(res.rawPayload));
    expect(decoded.level).toBe(LEVEL);
    const etag = String(res.headers.etag);
    const cached = await app.inject({ method: "GET", url, headers: { "if-none-match": etag } });
    expect(cached.statusCode).toBe(304);
    const missing = await app.inject({ method: "GET", url: planetResourcePath(TEST_PLANET_ID, "gold") });
    expect(missing.json()).toEqual({ error: "MATERIAL_NOT_FOUND" });
    await app.close();
    const signedOut = await serve(null);
    expect((await signedOut.inject({ method: "GET", url })).statusCode).toBe(401);
    await signedOut.close();
  });
});
