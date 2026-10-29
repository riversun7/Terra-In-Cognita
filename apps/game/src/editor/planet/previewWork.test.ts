// 미리보기 워커 핵심 시험 — 생성 → 요약 자리 → 단계별 모으기 + 꼭짓점 높이, 단계 알림, 넘길 목록(겹침 없음)·정확한 바이트.
// vitest는 모듈 워커를 띄우지 않으므로 planetEditorWorker.ts가 부르는 순수 함수를 바로 부른다. 면 레벨 4(빠름).
// 해시 값을 적지 않는다: 같은 입력을 생성기에 바로 넣은 결과와 견준다(생성기 판이 바뀌어도 깨지지 않게).
import { aggregatePlanetLevels, planetCornerHeights, planetMapLevels } from "@terra/planet";
import { generatePlanet, planetInputFromDefinition } from "@terra/planet/generator";
import { describe, expect, it } from "vitest";
import { memoryEstimate } from "./memoryEstimate.ts";
import { previewTransferables, transferredBytes } from "./previewProtocol.ts";
import { highestElevation, runPreviewJob } from "./previewWork.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

const LEVEL = 4;
const input = planetInputFromDefinition(TEST_PLANET, PACK_BIOMES, LEVEL);
const SLOW = 60_000;

describe("미리보기 워커 핵심", () => {
  it(
    "생성 결과·단계 값·꼭짓점 높이를 만들고 넘길 버퍼는 겹치지 않는다",
    () => {
      const stages: string[] = [];
      const { reply, transfer } = runPreviewJob(
        { kind: "generate", id: 3, key: "k", input },
        { onStage: (stage) => stages.push(stage) },
      );
      if (reply.kind !== "result") throw new Error(`expected a result, got ${reply.kind}`);
      expect(reply.id).toBe(3);
      expect(reply.key).toBe("k");
      const { result } = reply;
      // 같은 입력을 생성기에 바로 넣은 결과와 같다
      const direct = generatePlanet(input);
      expect(result.fields.meta.hash).toBe(direct.meta.hash);
      expect(result.fields.meta.faceLevel).toBe(LEVEL);
      // 단계: 생성기 단계들(기후 포함) → summary → levels
      expect(stages).toContain("climate");
      expect(stages.slice(-2)).toEqual(["summary", "levels"]);
      // 맵 레벨 F−4 … F, 맨 끝은 생성기 배열 그대로
      expect(result.levels.map((level) => level.level)).toEqual(planetMapLevels(LEVEL));
      const finest = result.levels.at(-1);
      expect(finest?.elevationM).toBe(result.fields.elevationM);
      const expected = aggregatePlanetLevels(direct);
      result.levels.forEach((level, index) => {
        expect(level.biome).toEqual(expected[index]?.biome);
        expect(result.corners[index]).toEqual(planetCornerHeights(level));
      });
      // 넘길 버퍼: 겹침 없음, 바이트 = 합
      expect(new Set(transfer).size).toBe(transfer.length);
      expect(transfer).toEqual(previewTransferables(result));
      expect(result.outputBytes).toBe(transferredBytes(transfer));
      expect(result.maxElevationM).toBe(highestElevation(result.fields.elevationM));
      expect(result.summary).toBeNull();
      expect(result.workerMs).toBeGreaterThanOrEqual(result.generateMs);
      // 레벨별 추정표의 남는 바이트는 이 값(넘긴 바이트)이다
      expect(memoryEstimate(LEVEL)?.keptBytes).toBe(result.outputBytes);
    },
    SLOW,
  );

  it(
    "요약 훅의 값을 결과에 싣는다",
    () => {
      const { reply } = runPreviewJob(
        { kind: "generate", id: 1, key: "k", input },
        { summarize: (details) => ({ cells: details.fields.biome.length }) },
      );
      expect(reply.kind === "result" ? reply.result.summary : null).toEqual({ cells: 6 * 4 ** LEVEL });
    },
    SLOW,
  );

  it("생성기가 받지 않는 입력은 rejected, 넘길 것 없음", () => {
    const { reply, transfer } = runPreviewJob({
      kind: "generate",
      id: 2,
      key: "k",
      input: { ...input, seed: -1 },
    });
    expect(reply).toMatchObject({ kind: "error", id: 2, key: "k", code: "rejected" });
    expect(transfer).toEqual([]);
  });

  it(
    "생성 중 오류는 failed",
    () => {
      const { reply } = runPreviewJob(
        { kind: "generate", id: 4, key: "k", input },
        {
          summarize: () => {
            throw new Error("boom");
          },
        },
      );
      expect(reply).toMatchObject({ kind: "error", code: "failed", message: "boom" });
    },
    SLOW,
  );

  it("가장 높은 칸", () => {
    expect(highestElevation(Int16Array.from([-5, 12, 3]))).toBe(12);
    expect(highestElevation(new Int16Array(0))).toBe(0);
  });
});
