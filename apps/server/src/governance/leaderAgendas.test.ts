// 지도자 안건 순수 셈 시험(leaderAgendas.ts) — NPC 가문 독립 힘 비(D-585, 질문 2500 기술 기본값, 줄기 governance-6)
import { describe, expect, it } from "vitest";
import { independencePowerOk } from "./leaderAgendas.ts";

describe("NPC 가문 독립 힘 비(질문 2500)", () => {
  it("가문 힘 × 1000 ≥ 옛 나라에 남는 군대 힘 × 문턱‰", () => {
    expect(independencePowerOk(10, 10, 1000)).toBe(true);
    expect(independencePowerOk(9, 10, 1000)).toBe(false);
    expect(independencePowerOk(5, 10, 500)).toBe(true);
    // 문턱 0이면 늘 넘는다(시험 설정), 남는 군대가 없어도 넘는다
    expect(independencePowerOk(0, 100, 0)).toBe(true);
    expect(independencePowerOk(0, 0, 1000)).toBe(true);
  });
});
