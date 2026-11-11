import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { createCharacterGeometry, triangleCount } from "./characterGeometry.ts";
import { CHARACTER_SHAPES, SHAPE_TRIANGLES } from "./characterParts.ts";

describe("캐릭터 단위 도형", () => {
  it("삼각형 수가 표(SHAPE_TRIANGLES)와 같다", () => {
    for (const shape of CHARACTER_SHAPES) {
      const geometry = createCharacterGeometry(shape);
      expect(triangleCount(geometry), shape).toBe(SHAPE_TRIANGLES[shape]);
      geometry.dispose();
    }
  });

  it("모두 [-0.5, 0.5]³ 상자 안이고 수가 유한하며 법선이 있다", () => {
    for (const shape of CHARACTER_SHAPES) {
      const geometry = createCharacterGeometry(shape);
      const position = geometry.getAttribute("position");
      for (let i = 0; i < position.count * 3; i++) {
        expect(Number.isFinite(position.array[i]), shape).toBe(true);
      }
      const box = new Box3().setFromBufferAttribute(position);
      for (const value of [box.min.x, box.min.y, box.min.z])
        expect(value, shape).toBeGreaterThanOrEqual(-0.5001);
      for (const value of [box.max.x, box.max.y, box.max.z]) expect(value, shape).toBeLessThanOrEqual(0.5001);
      // 높이는 상자를 다 채운다(자리 셈이 "가운데 ± 높이 반"이라)
      expect(box.min.y, shape).toBeCloseTo(-0.5, 4);
      expect(box.max.y, shape).toBeCloseTo(0.5, 4);
      expect(geometry.getAttribute("normal").count, shape).toBe(position.count);
      geometry.dispose();
    }
  });

  it("직접 만든 도형(사다리꼴·쐐기·사각뿔)은 면이 바깥을 본다", () => {
    for (const shape of ["taper", "wedge", "pyramid"] as const) {
      const geometry = createCharacterGeometry(shape);
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      for (let v = 0; v < position.count; v += 3) {
        // 면 가운데 → 바깥 방향과 법선이 같은 쪽
        const cx = (position.getX(v) + position.getX(v + 1) + position.getX(v + 2)) / 3;
        const cy = (position.getY(v) + position.getY(v + 1) + position.getY(v + 2)) / 3;
        const cz = (position.getZ(v) + position.getZ(v + 1) + position.getZ(v + 2)) / 3;
        const dot = cx * normal.getX(v) + cy * normal.getY(v) + cz * normal.getZ(v);
        expect(dot, `${shape} 면 ${v / 3}`).toBeGreaterThan(0);
      }
      geometry.dispose();
    }
  });
});
