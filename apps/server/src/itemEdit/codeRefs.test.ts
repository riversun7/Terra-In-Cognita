// 코드 참조 표 시험(설계안 3.6) — 시안 소스 파일에 적힌 팩 아이템 ID가 모두 표에 있고, 표의 ID는 팩에 있다.
import { readFileSync } from "node:fs";
import { loadContentPack } from "@terra/content/node";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { ECONOMY_PREVIEW_ITEMS, ROSTER_PREVIEW_ITEMS, itemCodeRefs } from "./codeRefs.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
const packItems = new Set((loaded.pack?.entries.get("items") ?? []).map((entry) => entry.id));

/** 소스 파일에 따옴표로 적힌 팩 아이템 ID */
function itemIdsIn(file: string): string[] {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  return [...new Set([...text.matchAll(/"([a-z][a-z0-9_]{1,47})"/g)].map((match) => match[1] ?? ""))]
    .filter((id) => packItems.has(id))
    .toSorted();
}

describe("코드 참조 표", () => {
  it("유닛·경제 시안 소스에 적힌 아이템 ID = 표", () => {
    expect(itemIdsIn("../roster/preview.ts")).toEqual([...ROSTER_PREVIEW_ITEMS].toSorted());
    expect(
      [
        ...new Set([
          ...itemIdsIn("../economyView/previewWorld.ts"),
          ...itemIdsIn("../economyView/previewProduction.ts"),
        ]),
      ].toSorted(),
    ).toEqual([...ECONOMY_PREVIEW_ITEMS].toSorted());
  });

  it("표의 아이템은 모두 팩에 있고, 시뮬·정원사·다시보기·실험실 쓰임을 모은다", () => {
    const refs = itemCodeRefs();
    for (const id of refs.keys()) expect(packItems.has(id)).toBe(true);
    expect(refs.get("test_staff")?.map((ref) => ref.use)).toEqual(
      expect.arrayContaining(["sim_wave", "replay_demo", "roster_preview"]),
    );
    expect(refs.get("test_sword")?.map((ref) => ref.use)).toEqual(
      expect.arrayContaining(["sim_combat", "battle_lab", "economy_preview"]),
    );
  });
});
