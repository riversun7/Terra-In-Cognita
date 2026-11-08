// 편집기 크리처 JSON(creatureJsonOf)이 팩 파일(content/core/creatures.json) 한 줄과 같은지 검증.
import { creatureEntrySchema, readCategoryFile } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { creatureJsonOf } from "./views.ts";

describe("creatureJsonOf = 팩 creatures.json 한 줄", () => {
  it("팩의 모든 크리처(91종)가 원형 초상화 좌표·고유 무기 범위·전리품까지 손실 없이 같은 JSON으로 돌아온다", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const raw = readCategoryFile(loaded.source, "creatures").entries;
    expect(raw.length).toBeGreaterThanOrEqual(91);
    for (const entry of raw) {
      expect(creatureJsonOf(creatureEntrySchema.parse(entry))).toEqual(entry);
    }
  });
});
