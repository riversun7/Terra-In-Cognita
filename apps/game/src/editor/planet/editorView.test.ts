// 편집기 화면 고르기 시험 — 지구본·미니맵 결과, 면적 차이(같은 레벨만), 열 때 확인, 내보내기 막기, 시드 글
import type { PlanetSummary } from "@terra/planet/generator";
import { describe, expect, it } from "vitest";
import {
  type RoleViews,
  areaRows,
  comparableBaseSummary,
  deviceCheck,
  exportBlock,
  globeEntry,
  isCurrentEntry,
  latestEntry,
  parseSeedText,
  randomSeed,
} from "./editorView.ts";
import { fakeResult } from "./previewTestKit.ts";
import { previewInput } from "./previewController.ts";
import type { PreviewEntry, RoleView } from "./previewTypes.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

const input = previewInput({ entry: TEST_PLANET, biomes: PACK_BIOMES }, 5);

function entry(level: number, sequence: number, planetSummary: PlanetSummary | null = null): PreviewEntry {
  return {
    key: `${level}:${sequence}`,
    level,
    input,
    result: { ...fakeResult(level), summary: planetSummary },
    elapsedMs: 10,
    sequence,
  };
}

function view(found: PreviewEntry | null, current = true, error: RoleView["error"] = null): RoleView {
  return {
    key: found?.key ?? null,
    level: found?.level ?? null,
    status: found ? "ready" : "idle",
    entry: found,
    current: found !== null && current,
    error,
  };
}

function summary(faceLevel: number, shares: Record<string, number>): PlanetSummary {
  return {
    faceLevel,
    cellCount: 1,
    biomes: Object.entries(shares).map(([id, planetShare], index) => ({
      index,
      id,
      planetShare,
      landShare: null,
    })),
    landShare: 0,
    lakeShare: 0,
    oceanShare: 1,
    riverShare: 0,
    oceanDepthShares: { coastal: 0, shelf: 0, deep: 1 },
    meanTemperatureC: 0,
    landMeanTemperatureC: null,
    maxElevationM: 0,
    minElevationM: 0,
  };
}

describe("보일 결과", () => {
  it("지구본은 본 결과(낡아도)를 먼저, 미니맵은 늦게 받은 것을 고른다", () => {
    const quick = entry(5, 3);
    const final = entry(7, 2);
    const role: RoleViews = { quick: view(quick), final: view(final, false) };
    expect(globeEntry(role)).toBe(final);
    expect(latestEntry(role)).toBe(quick);
    expect(isCurrentEntry(role, final)).toBe(false);
    expect(isCurrentEntry(role, quick)).toBe(true);
    expect(globeEntry({ quick: view(quick), final: view(null) })).toBe(quick);
    expect(latestEntry({ quick: view(null), final: view(null) })).toBeNull();
  });
});

describe("면적표", () => {
  it("같은 면 레벨 공개본과만 견준다", () => {
    const draft = summary(7, { a: 0.6, b: 0.4 });
    const rows = areaRows(draft, summary(7, { a: 0.5, b: 0.5 }));
    expect(rows.map((row) => row.diff)).toEqual([0.6 - 0.5, 0.4 - 0.5]);
    expect(areaRows(draft, summary(5, { a: 0.5, b: 0.5 })).every((row) => row.diff === null)).toBe(true);
    expect(areaRows(draft, null)[0]?.diff).toBeNull();
  });

  it("견줄 공개본 요약: 지금 청한 본 결과 → 빠른 결과, 레벨이 같아야 한다", () => {
    const base: RoleViews = {
      quick: view(entry(5, 1, summary(5, { a: 1 }))),
      final: view(entry(7, 2, summary(7, { a: 1 })), false),
    };
    expect(comparableBaseSummary(base, 7)).toBeNull();
    expect(comparableBaseSummary(base, 5)?.faceLevel).toBe(5);
  });
});

describe("열 때 확인·내보내기", () => {
  const server = { generatorVersion: 3, check: { faceLevel: 5, hash: "00000005" } };

  it("생성기 판이 다르면 바로 판 다름, 해시가 같으면 같음, 다르면 다름, 오기 전은 기다림", () => {
    expect(deviceCheck(server, 2, view(null))).toBe("generator_mismatch");
    expect(deviceCheck(server, 3, view(null))).toBe("pending");
    expect(deviceCheck(server, 3, view(entry(5, 1)))).toBe("match");
    expect(deviceCheck({ ...server, check: { faceLevel: 5, hash: "ffffffff" } }, 3, view(entry(5, 1)))).toBe(
      "mismatch",
    );
    expect(deviceCheck(server, 3, view(null, true, "crashed"))).toBe("failed");
    // 낡은 결과·다른 레벨로는 판단하지 않는다
    expect(deviceCheck(server, 3, view(entry(5, 1), false))).toBe("pending");
  });

  it("같음일 때만 내보낸다", () => {
    expect(exportBlock("match", true)).toBeNull();
    expect(exportBlock("match", false)).toBe("no_draft");
    expect(exportBlock("mismatch", true)).toBe("mismatch");
    expect(exportBlock("pending", true)).toBe("pending");
  });
});

describe("시드", () => {
  it("u32 10진 글만 받는다", () => {
    expect(parseSeedText(" 2718281828 ")).toBe(2_718_281_828);
    expect(parseSeedText("4294967295")).toBe(0xffff_ffff);
    expect(parseSeedText("4294967296")).toBeNull();
    expect(parseSeedText("-1")).toBeNull();
    expect(parseSeedText("1e3")).toBeNull();
    expect(parseSeedText("")).toBeNull();
    expect(randomSeed((array) => array.fill(42))).toBe(42);
  });
});
