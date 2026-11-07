// 플레이어 카메라 범위 시험(기획 정리 630, docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)") — 내 유닛·건물 둘레 원, 없으면 탐사 칸,
// 운영자·받기 전이면 범위 없음, 열쇠는 칸 단위로 같다
import { describe, expect, it } from "vitest";
import { areaKey, cameraArea } from "./cameraArea.ts";

const VIEW = { unitRadius: 40, buildingRadius: 32, buildings: [{ x: 60, y: 70 }] };

describe("카메라 범위", () => {
  it("내 유닛(지금 자리)과 내 건물마다 원", () => {
    expect(
      cameraArea({ operator: false, view: VIEW, units: [{ x: 10.5, y: 20.25 }], explored: null }),
    ).toEqual([
      { x: 10.5, y: 20.25, r: 40 },
      { x: 60.5, y: 70.5, r: 32 },
    ]);
  });

  it("운영자 모드·받기 전이면 범위 없음(null)", () => {
    expect(cameraArea({ operator: true, view: VIEW, units: [{ x: 1, y: 1 }], explored: null })).toBeNull();
    expect(cameraArea({ operator: false, view: null, units: [{ x: 1, y: 1 }], explored: null })).toBeNull();
  });

  it("이 2차맵에 내 유닛·건물이 없으면 탐사한 시야 칸마다 작은 원, 그것도 없으면 null", () => {
    const empty = { ...VIEW, buildings: [] };
    const bits = new Uint8Array(128);
    // 시야 칸 (1, 0)과 (0, 2) = 번호 1, 64
    bits[0] = 0b10;
    bits[8] = 0b1;
    expect(cameraArea({ operator: false, view: empty, units: [], explored: bits })).toEqual([
      { x: 12, y: 4, r: 6 },
      { x: 4, y: 20, r: 6 },
    ]);
    expect(cameraArea({ operator: false, view: empty, units: [], explored: new Uint8Array(128) })).toBeNull();
    expect(cameraArea({ operator: false, view: empty, units: [], explored: null })).toBeNull();
  });

  it("열쇠: 칸 단위로 반올림해 조금 움직이면 같고, 범위 없음은 빈 글", () => {
    expect(areaKey([{ x: 10.2, y: 20.4, r: 40 }])).toBe(areaKey([{ x: 9.9, y: 19.6, r: 40 }]));
    expect(areaKey([{ x: 10, y: 20, r: 40 }])).not.toBe(areaKey([{ x: 12, y: 20, r: 40 }]));
    expect(areaKey(null)).toBe("");
  });
});
