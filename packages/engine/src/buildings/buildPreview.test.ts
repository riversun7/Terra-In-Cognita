import { describe, expect, it } from "vitest";
import { createBuildPreview, previewBox } from "./buildPreview.ts";

describe("건축 미리보기", () => {
  it("돌린 크기와 가운데: 홀수 회전이면 가로·세로가 바뀐다", () => {
    expect(previewBox({ cellX: 10, cellY: 20, width: 4, depth: 2, rotation: 0, valid: true })).toEqual({
      sizeX: 4,
      sizeY: 2,
      centreX: 12,
      centreY: 21,
    });
    expect(previewBox({ cellX: 10, cellY: 20, width: 4, depth: 2, rotation: 1, valid: true })).toEqual({
      sizeX: 2,
      sizeY: 4,
      centreX: 11,
      centreY: 22,
    });
  });

  it("층: 미리보기가 없으면 숨기고, 있으면 땅 위에 그 크기로 세운다", () => {
    const preview = createBuildPreview();
    const object = preview.layer.object;
    if (!object) throw new Error("no object");
    const view = {
      cellM: 2,
      pixelsPerMetre: 10,
      width: 400,
      height: 800,
      groundAt: () => 5,
      project: () => null,
    };
    preview.layer.after?.(view);
    expect(object.visible).toBe(false);
    preview.set({ cellX: 10, cellY: 20, width: 4, depth: 2, rotation: 0, valid: false });
    preview.layer.after?.(view);
    expect(object.visible).toBe(true);
    const plate = object.children[0];
    expect(plate?.position.x).toBe(24);
    expect(plate?.position.z).toBe(42);
    expect(plate?.scale.x).toBe(8);
    expect(plate?.position.y).toBeGreaterThan(5);
    preview.set(null);
    preview.layer.after?.(view);
    expect(object.visible).toBe(false);
    preview.dispose();
  });
});
