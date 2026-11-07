// 랭킹 판 세력 이름 — 국가 1(시험 NPC 세력)도 코드가 아니라 사이보그 만들기·지도와 같은 이름(16번째 프리셋)
import { loadContentPack } from "@terra/content/node";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { nationName } from "../npc/nations.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { nationNamesOf } from "./paths.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.pack) throw new Error("content pack");
const pack = loaded.pack;

describe("랭킹 세력 이름(nationNamesOf)", () => {
  it("프리셋 코드 → 프리셋 이름, 시험 NPC 세력 → 16번째 프리셋 이름(nationName과 같다)", () => {
    const names = nationNamesOf(pack);
    const presets = nationPresetsOf(pack);
    expect(names.get("s3_test_npc")).toEqual(nationName("s3_test_npc", presets));
    expect(names.get("s3_test_npc")?.ko).not.toBe("s3_test_npc");
    expect(names.get(presets[0]?.code ?? "")).toEqual(presets[0]?.name);
  });
});
