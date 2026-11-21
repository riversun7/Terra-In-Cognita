// 조약 받아들이는 길 시험 — D-444 167(카드마다 투표 필요 칸), 사용자 결정 D-588
import { describe, expect, it } from "vitest";
import { isOpenTreaty, treatyPathOf } from "./treaty.ts";

describe("treatyPathOf", () => {
  it("투표가 필요한 카드가 하나라도 있으면 투표, 그 카드가 모두 휴전·강화면 짧은 투표, 독재는 지도자", () => {
    expect(treatyPathOf(["non_aggression"], "democracy")).toBe("leader");
    expect(treatyPathOf(["ceasefire"], "capitalism")).toBe("short_vote");
    expect(treatyPathOf(["ceasefire", "non_aggression"], "democracy")).toBe("short_vote");
    expect(treatyPathOf(["ceasefire", "alliance"], "democracy")).toBe("vote");
    expect(treatyPathOf(["protection"], null)).toBe("vote");
    expect(treatyPathOf(["alliance", "protection"], "dictatorship")).toBe("leader");
  });
  it("열린 상태 = 제안·협상", () => {
    expect(isOpenTreaty("proposed")).toBe(true);
    expect(isOpenTreaty("negotiating")).toBe(true);
    expect(isOpenTreaty("active")).toBe(false);
    expect(isOpenTreaty("lapsed")).toBe(false);
  });
});
