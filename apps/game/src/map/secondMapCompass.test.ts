// 나침반: 2차맵 축에 따른 북쪽, 카메라를 돌리면 바늘이 반대로 돈다
import { secondMapPlace } from "@terra/engine";
import { cellKey } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { compassAngle, northOnMap } from "./secondMapCompass.ts";

const place = (x: [number, number, number], z: [number, number, number]) => ({
  latDeg: 0,
  lonDeg: 0,
  xAxis: x,
  up: [1, 0, 0] as [number, number, number],
  zAxis: z,
});

describe("2차맵 나침반", () => {
  it("2차맵 −z가 북쪽이면 카메라 yaw 0에서 바늘이 위(0)", () => {
    const north = northOnMap(place([0, 1, 0], [0, 0, -1]));
    expect(north).toEqual({ x: 0, z: -1 });
    expect(compassAngle(north ?? { x: 0, z: 0 }, 0)).toBeCloseTo(0);
  });

  it("2차맵 +x가 북쪽이면 바늘이 오른쪽(+90°), 카메라를 90° 돌리면 위로", () => {
    const north = northOnMap(place([0, 0, 1], [0, 1, 0])) ?? { x: 0, z: 0 };
    expect(north.x).toBeCloseTo(1);
    expect(compassAngle(north, 0)).toBeCloseTo(Math.PI / 2);
    // yaw = −90°: 카메라 앞 = (1, 0) = +x
    expect(compassAngle(north, -Math.PI / 2)).toBeCloseTo(0);
  });

  it("실제 2차맵: 북쪽이 단위 방향이고 극에서는 없다", () => {
    const real = secondMapPlace(cellKey(0, 9, 282, 328));
    if (!real) throw new Error("place missing");
    const north = northOnMap(real);
    expect(Math.hypot(north?.x ?? 0, north?.z ?? 0)).toBeCloseTo(1);
    expect(northOnMap(place([0, 1, 0], [1, 0, 0]))).toBeNull();
  });
});
