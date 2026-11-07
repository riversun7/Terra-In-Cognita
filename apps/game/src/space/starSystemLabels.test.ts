// 항성계 그림 이름표 자리 시험 — 가장자리 천체는 위아래에 붙어 안쪽으로 뻗고(잘리지 않게), 가운데 천체는 옆 바깥쪽
import { describe, expect, it } from "vitest";
import { labelPlacement } from "./StarSystemView.tsx";

describe("이름표 자리", () => {
  it("가로 가장자리: 위아래에 붙고 글은 안쪽으로(오른쪽 천체는 끝 맞춤, 왼쪽 천체는 시작 맞춤)", () => {
    expect(labelPlacement(0.85, -0.3)).toEqual({ side: "top", align: "end" });
    expect(labelPlacement(-0.8, 0.2)).toEqual({ side: "bottom", align: "start" });
  });

  it("세로 가장자리 가까이(|y| > 0.75)는 안쪽(아래 천체는 위에)", () => {
    expect(labelPlacement(0.1, 0.85)).toEqual({ side: "top", align: "center" });
    expect(labelPlacement(-0.1, -0.85)).toEqual({ side: "bottom", align: "center" });
  });

  it("가운데 띠: 위아래로 멀면 위아래 바깥쪽, 가까우면 옆 바깥쪽", () => {
    expect(labelPlacement(0.1, -0.5)).toEqual({ side: "top", align: "center" });
    expect(labelPlacement(0.2, 0.1)).toEqual({ side: "right", align: "center" });
    expect(labelPlacement(-0.2, -0.1)).toEqual({ side: "left", align: "center" });
  });
});
