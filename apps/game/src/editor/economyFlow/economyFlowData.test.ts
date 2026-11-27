// 경제 흐름 모식도 자료 무결성 + 팩(content/core/tuning.json) 기본값 1:1 일치 시험
import { describe, expect, it } from "vitest";
import tuningPack from "../../../../../content/core/tuning.json";
import {
  DIAGRAM_VIEWBOX,
  ECONOMY_ACTORS,
  ECONOMY_FLOW_EDGES,
  flattenEconomyItems,
  formatEconomyValue,
} from "./economyFlowData.ts";

describe("economyFlowData", () => {
  it("모든 모식도 화살표가 존재하는 주체 ID를 가리키고 노드가 캔버스 안에 들어온다", () => {
    const ids = new Set(ECONOMY_ACTORS.map((a) => a.id));
    expect(ids.size).toBe(ECONOMY_ACTORS.length);
    for (const actor of ECONOMY_ACTORS) {
      expect(actor.x).toBeGreaterThanOrEqual(0);
      expect(actor.y).toBeGreaterThanOrEqual(0);
      expect(actor.x + actor.w).toBeLessThanOrEqual(DIAGRAM_VIEWBOX.width);
      expect(actor.y + actor.h).toBeLessThanOrEqual(DIAGRAM_VIEWBOX.height);
      expect(actor.equation.length).toBeGreaterThan(0);
      expect(actor.items.length).toBeGreaterThan(0);
    }
    const edgeIds = new Set<string>();
    for (const edge of ECONOMY_FLOW_EDGES) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
      expect(edgeIds.has(edge.id)).toBe(false);
      edgeIds.add(edge.id);
    }
  });

  it("tuningId가 붙은 항목은 content/core/tuning.json 실제 키·팩 기본값과 일치한다", () => {
    const byId = new Map(tuningPack.entries.map((entry) => [entry.id, entry.value]));

    const rows = flattenEconomyItems();
    const withTuning = rows.filter((row) => row.item.tuningId !== undefined);
    expect(withTuning.length).toBeGreaterThanOrEqual(20);

    for (const { item } of withTuning) {
      const id = item.tuningId!;
      expect(byId.has(id), `tuning.json에 없는 키: ${id}`).toBe(true);
      expect(byId.get(id), `팩 기본값 불일치: ${id}`).toBe(item.packValue);
    }
  });

  it("단위별 숫자 포맷을 읽기 좋은 문자열로 바꾼다", () => {
    expect(formatEconomyValue(200, "bp", true)).toBe("200 bp (2%)");
    expect(formatEconomyValue(50, "bp", true)).toBe("50 bp (0.50%)");
    expect(formatEconomyValue(300, "pm", true)).toBe("300‰ (30%)");
    expect(formatEconomyValue(86_400_000, "ms", true)).toBe("1일 (86,400,000 ms)");
    expect(formatEconomyValue(1_800_000, "ms", false)).toBe("30m (1,800,000 ms)");
    expect(formatEconomyValue(100_000, "grams", true)).toBe("100 kg (100,000 g)");
    expect(formatEconomyValue(2000, "milli", true)).toBe("2 (2,000m)");
  });
});
