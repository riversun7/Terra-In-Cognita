// 랭킹 화면 순수 셈 시험 — 순위 변화, 판 고르기 값 ↔ 판, 주소 → 판 요청, 영역 묶기, 등급 퍼센트
import type { RouteMatch } from "@terra/shared";
import type { RankingPathInfo } from "@terra/shared/ranking";
import { describe, expect, it } from "vitest";
import {
  boardFromValue,
  boardRequestOf,
  boardTarget,
  boardValue,
  nameText,
  pathsByArea,
  rankChange,
  tierPercent,
} from "./rankingText.ts";

const path = (id: string, area: RankingPathInfo["area"], open = true): RankingPathInfo => ({
  id,
  name: { ko: id, en: id.toUpperCase() },
  area,
  open,
  measures: [],
});

describe("랭킹 화면 글", () => {
  it("순위 변화: 처음 = 새로, 작아지면 오름, 커지면 내림", () => {
    expect(rankChange(3, null)).toEqual({ kind: "new" });
    expect(rankChange(3, 3)).toEqual({ kind: "same" });
    expect(rankChange(2, 7)).toEqual({ kind: "up", steps: 5 });
    expect(rankChange(9, 4)).toEqual({ kind: "down", steps: 5 });
  });

  it("판 고르기 값 ↔ 판, 판 → 주소, 모르는 값은 null", () => {
    for (const board of [{ kind: "faction" } as const, { kind: "path", path: "conqueror" } as const])
      expect(boardFromValue(boardValue(board))).toEqual(board);
    expect(boardFromValue("path:")).toBeNull();
    expect(boardFromValue("x")).toBeNull();
    expect(boardTarget({ kind: "faction" })).toEqual({ route: "faction_ranking" });
    expect(boardTarget({ kind: "path", path: "landlord" })).toEqual({
      route: "cyborg_ranking",
      search: { path: "landlord" },
    });
  });

  it("주소 → 판 요청: 세력 주소 = 세력 판, ?path= 없으면 서버가 고른다(null)", () => {
    const faction = { id: "faction_ranking", params: {}, search: {} } as RouteMatch;
    const chosen = { id: "cyborg_ranking", params: {}, search: { path: "mercenary" } } as RouteMatch;
    const open = { id: "cyborg_ranking", params: {}, search: {} } as RouteMatch;
    expect(boardRequestOf(faction)).toEqual({ kind: "faction" });
    expect(boardRequestOf(chosen)).toEqual({ kind: "path", path: "mercenary" });
    expect(boardRequestOf(open)).toEqual({ kind: "path", path: null });
  });

  it("영역마다 묶기(팩 차례 그대로), 이름은 지금 언어, 등급 퍼센트", () => {
    const groups = pathsByArea([path("a", "force"), path("b", "wealth"), path("c", "force", false)]);
    expect(groups.map((group) => [group.area, group.paths.map((entry) => entry.id)])).toEqual([
      ["force", ["a", "c"]],
      ["wealth", ["b"]],
    ]);
    expect(nameText({ ko: "정복자", en: "Conqueror" }, "en")).toBe("Conqueror");
    expect(nameText({ ko: "정복자", en: "Conqueror" }, "ko")).toBe("정복자");
    expect(tierPercent(10)).toMatch(/^1$/);
    expect(tierPercent(5)).toMatch(/^0[.,]5$/);
  });
});
