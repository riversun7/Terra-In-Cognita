// 2차맵 메시지 스키마 시험 — 왕복, 범위, 경로 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  MAX_PATH_POINTS,
  ProtocolError,
  RESULT_CODES,
  SECOND_MAP_UNITS,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
  type ServerMessage,
} from "./index.ts";

const unit = { id: 7, size: 1, speed: 437, departAtMs: 1_798_000_000_000, path: [512, 512, 4608, 512] };

const snapshot: ServerMessage = {
  t: "map_snapshot",
  mapKey: 281_474_976_710_665,
  snapshotId: 1,
  part: 0,
  parts: 1,
  rev: 12,
  serverTime: 1_798_000_000_123,
  terrain: { url: "/api/maps/281474976710665/terrain?v=1", generatorVersion: 1 },
  units: [{ id: 7, size: 1, speed: 437, departAtMs: 1_798_000_000_000, path: [512, 512, 4608, 512] }],
  buildings: [{ id: 3, x: 10, y: 20, width: 4, height: 2, rotation: 90 }],
};

/** 서버 메시지가 스키마에 맞는지(던지지 않으면 true) */
function serverOk(message: unknown): boolean {
  try {
    decodeServerMessage(JSON.stringify(message));
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) return false;
    throw error;
  }
}

function clientOk(message: unknown): boolean {
  try {
    decodeClientMessage(JSON.stringify(message));
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) return false;
    throw error;
  }
}

/** 유닛 하나를 고친 unit_paths 메시지 */
function pathsWith(patch: object) {
  return { t: "unit_paths", mapKey: 9, fromRev: 1, rev: 2, units: [{ ...unit, ...patch }] };
}

describe("2차맵 기기 → 서버 메시지", () => {
  it("구독·해제·명령을 왕복 변환한다", () => {
    const messages = [
      { t: "subscribe", id: 1, mapKey: 281_474_976_710_665 },
      { t: "unsubscribe", id: 2, mapKey: 281_474_976_710_665 },
      { t: "move_unit", id: 3, mapKey: 9, unitId: 12, x: 0, y: SECOND_MAP_UNITS - 1 },
      { t: "place_building", id: 4, mapKey: 9, x: 255, y: 0, width: 32, height: 1, rotation: 270 },
      { t: "remove_building", id: 5, mapKey: 9, buildingId: 1 },
    ] as const;
    for (const message of messages) {
      expect(decodeClientMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it("2차맵 밖 위치·소수·음수 ID는 거부한다", () => {
    const move = { t: "move_unit", id: 1, mapKey: 9, unitId: 1, x: 10, y: 10 };
    expect(clientOk(move)).toBe(true);
    expect(clientOk({ ...move, x: SECOND_MAP_UNITS })).toBe(false);
    expect(clientOk({ ...move, y: -1 })).toBe(false);
    expect(clientOk({ ...move, x: 1.5 })).toBe(false);
    expect(clientOk({ ...move, unitId: 0 })).toBe(false);
    expect(clientOk({ ...move, id: 2 ** 32 })).toBe(false);
    expect(clientOk({ ...move, mapKey: 2 ** 53 })).toBe(false);
  });

  it("건물: 회전은 90° 단위, 한 변 1~32칸, 칸 좌표 0~255", () => {
    const place = { t: "place_building", id: 1, mapKey: 9, x: 1, y: 2, width: 3, height: 4, rotation: 0 };
    expect(clientOk(place)).toBe(true);
    expect(clientOk({ ...place, rotation: 45 })).toBe(false);
    expect(clientOk({ ...place, width: 0 })).toBe(false);
    expect(clientOk({ ...place, height: 33 })).toBe(false);
    expect(clientOk({ ...place, x: 256 })).toBe(false);
  });
});

describe("2차맵 서버 → 기기 메시지", () => {
  it("스냅샷 조각을 왕복 변환한다", () => {
    expect(decodeServerMessage(encodeMessage(snapshot))).toEqual(snapshot);
  });

  it("경로는 x, y 쌍이고 점 1개 이상, MAX_PATH_POINTS개 이하", () => {
    expect(serverOk(pathsWith({ path: [1, 2] }))).toBe(true);
    expect(serverOk(pathsWith({ path: [] }))).toBe(false);
    expect(serverOk(pathsWith({ path: [1, 2, 3] }))).toBe(false);
    expect(serverOk(pathsWith({ path: Array.from({ length: MAX_PATH_POINTS * 2 }, () => 5) }))).toBe(true);
    expect(serverOk(pathsWith({ path: Array.from({ length: MAX_PATH_POINTS * 2 + 2 }, () => 5) }))).toBe(
      false,
    );
    expect(serverOk(pathsWith({ path: [0, SECOND_MAP_UNITS] }))).toBe(false);
  });

  it("유닛 크기 등급은 1~3, 속도는 1 이상 정수", () => {
    expect(serverOk(pathsWith({ size: 3 }))).toBe(true);
    expect(serverOk(pathsWith({ size: 4 }))).toBe(false);
    expect(serverOk(pathsWith({ speed: 0 }))).toBe(false);
    expect(serverOk(pathsWith({ speed: 1.5 }))).toBe(false);
  });

  it("빈 unit_paths는 보내지 않는다(스키마가 거부)", () => {
    expect(serverOk({ t: "unit_paths", mapKey: 9, fromRev: 1, rev: 2, units: [] })).toBe(false);
  });

  it("건물 놓임·치움을 왕복 변환한다", () => {
    const placed: ServerMessage = {
      t: "building_placed",
      mapKey: 9,
      rev: 3,
      building: { id: 1, x: 0, y: 0, width: 2, height: 2, rotation: 180 },
    };
    const removed: ServerMessage = { t: "building_removed", mapKey: 9, rev: 4, buildingId: 1 };
    expect(decodeServerMessage(encodeMessage(placed))).toEqual(placed);
    expect(decodeServerMessage(encodeMessage(removed))).toEqual(removed);
  });

  it("result: 성공은 코드 없이(건물 ID는 선택), 실패는 정해진 코드만", () => {
    expect(serverOk({ t: "result", id: 1, ok: true })).toBe(true);
    expect(serverOk({ t: "result", id: 1, ok: true, buildingId: 5 })).toBe(true);
    expect(serverOk({ t: "result", id: 1, ok: false, code: "forbidden" })).toBe(true);
    expect(serverOk({ t: "result", id: 1, ok: false })).toBe(false);
    expect(serverOk({ t: "result", id: 1, ok: false, code: "nope" })).toBe(false);
    for (const code of RESULT_CODES) {
      expect(serverOk({ t: "result", id: 1, ok: false, code })).toBe(true);
    }
  });
});
