// 전송 모양과 조각 나누기 시험 — 모든 조각이 메시지 상한 안, 항목은 한 번씩 순서대로, 가장 큰 항목도 들어간다
import {
  MAX_MESSAGE_BYTES,
  MAX_PATH_POINTS,
  SECOND_MAP_UNITS,
  type UnitMotionWire,
  decodeServerMessage,
  utf8ByteLength,
} from "@terra/protocol";
import { WALK_SPEED, createMotion } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { encodeSnapshot, motionToWire, planChunks, sized, snapshotHeaderBytes } from "./wire.ts";

const TERRAIN = { url: "/api/maps/281474976710665/terrain?v=1", generatorVersion: 1 };

/** 가장 큰 유닛 항목: 점 MAX_PATH_POINTS개, 좌표·ID·시각 모두 가장 긴 자릿수 */
function largestUnit(id: number): UnitMotionWire {
  return {
    id,
    size: 3,
    speed: 1_048_576,
    departAtMs: 9_999_999_999_999,
    path: Array.from({ length: MAX_PATH_POINTS * 2 }, () => SECOND_MAP_UNITS - 1),
  };
}

function snapshotParts(parts: string[]) {
  return parts.map((text) => {
    const message = decodeServerMessage(text);
    if (message.t !== "map_snapshot") throw new Error("not a snapshot");
    return message;
  });
}

describe("유닛 움직임 → 전송 모양", () => {
  it("꺾이는 점을 [x0, y0, x1, y1, …]로 편다", () => {
    const motion = createMotion({
      waypoints: [
        { x: 512, y: 512 },
        { x: 4608, y: 512 },
      ],
      departAtMs: 1_000,
      speed: WALK_SPEED,
    });
    expect(motionToWire(9, 1, motion)).toEqual({
      id: 9,
      size: 1,
      speed: WALK_SPEED,
      departAtMs: 1_000,
      path: [512, 512, 4608, 512],
    });
  });

  it("sized는 JSON 길이를 센다", () => {
    const value = { id: 1, size: 1, speed: 437, departAtMs: 5, path: [1, 2] };
    expect(sized(value).bytes).toBe(JSON.stringify(value).length);
  });
});

describe("스냅샷 조각", () => {
  it("유닛·건물이 없어도 조각 하나를 만든다", () => {
    const parts = snapshotParts(
      encodeSnapshot({
        mapKey: 9,
        snapshotId: 1,
        rev: 0,
        serverTime: 5,
        terrain: TERRAIN,
        units: [],
        buildings: [],
      }),
    );
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ part: 0, parts: 1, units: [], buildings: [] });
  });

  it("유닛 5,000개·건물 1,024개: 조각마다 상한 안, 항목은 한 번씩 순서대로", () => {
    const units = Array.from({ length: 5_000 }, (_, i) =>
      sized<UnitMotionWire>({
        id: i + 1,
        size: 1,
        speed: WALK_SPEED,
        departAtMs: 1_798_000_000_000 + i,
        path: Array.from(
          { length: 2 * (1 + (i % 40)) },
          (_unused, k) => (i * 31 + k * 977) % SECOND_MAP_UNITS,
        ),
      }),
    );
    const buildings = Array.from({ length: 1_024 }, (_, i) =>
      sized({ id: i + 1, x: i % 256, y: (i * 7) % 256, width: 32, height: 32, rotation: 270 as const }),
    );
    const texts = encodeSnapshot({
      mapKey: 281_474_976_710_665,
      snapshotId: 0xffff_ffff,
      rev: 123_456_789,
      serverTime: 1_798_000_000_000,
      terrain: TERRAIN,
      units,
      buildings,
    });
    for (const text of texts) expect(utf8ByteLength(text)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    const parts = snapshotParts(texts);
    expect(parts.length).toBeGreaterThan(10);
    expect(parts.map((part) => part.part)).toEqual(parts.map((_, index) => index));
    expect(new Set(parts.map((part) => part.parts))).toEqual(new Set([parts.length]));
    expect(parts.flatMap((part) => part.units.map((unit) => unit.id))).toEqual(units.map((u) => u.value.id));
    expect(parts.flatMap((part) => part.buildings.map((b) => b.id))).toEqual(
      buildings.map((b) => b.value.id),
    );
    // 조각을 꽉 채운다(마지막 조각 말고는 상한의 90% 이상)
    for (const text of texts.slice(0, -1))
      expect(utf8ByteLength(text)).toBeGreaterThan(MAX_MESSAGE_BYTES * 0.9);
  });

  it("가장 큰 유닛 항목(점 1,024개)도 조각 하나에 들어가고, 여럿이면 나뉜다", () => {
    const units = [1, 2, 3, 4, 5, 6].map((id) => sized(largestUnit(id)));
    const texts = encodeSnapshot({
      mapKey: 281_474_976_710_665,
      snapshotId: 1,
      rev: Number.MAX_SAFE_INTEGER,
      serverTime: 9_999_999_999_999,
      terrain: TERRAIN,
      units,
      buildings: [],
    });
    for (const text of texts) expect(utf8ByteLength(text)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(texts.length).toBeGreaterThan(1);
    expect(snapshotParts(texts).flatMap((part) => part.units.map((unit) => unit.id))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("머리 크기 상한은 실제 머리보다 크거나 같다", () => {
    const [text] = encodeSnapshot({
      mapKey: 281_474_976_710_665,
      snapshotId: 0xffff_ffff,
      rev: Number.MAX_SAFE_INTEGER,
      serverTime: Number.MAX_SAFE_INTEGER,
      terrain: TERRAIN,
      units: [],
      buildings: [],
    });
    expect(snapshotHeaderBytes(281_474_976_710_665, TERRAIN)).toBeGreaterThanOrEqual(
      utf8ByteLength(text ?? ""),
    );
  });

  it("항목 하나가 상한보다 크면 만들지 않는다(서버 버그)", () => {
    expect(() => planChunks(100, [{ value: 1, bytes: MAX_MESSAGE_BYTES }], [])).toThrow(RangeError);
  });
});
