// 3D 관람 효과 이름(effectNames.ts) — 팩 effects의 ko·en. 지운 전투 다시보기 시험(D-543 1377 가)이 보던 몫을 옮겼다.
import { loadContentPack } from "@terra/content/node";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { effectNamesOf } from "./effectNames.ts";

describe("효과 이름", () => {
  it("팩 effects의 ko·en 이름을 ID로 찾는다. effects.json이 없으면 빈 표", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.ok) throw new Error("content pack failed");
    const names = effectNamesOf(loaded.source);
    expect(names.chill).toEqual({ ko: "냉기", en: "Chill" });
    expect(effectNamesOf({ ...loaded.source, files: new Map() })).toEqual({});
  });
});
