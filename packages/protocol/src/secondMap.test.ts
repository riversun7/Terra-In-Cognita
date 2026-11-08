// 2차맵 메시지 스키마 시험 — 왕복, 범위, 경로 모양, 결과 코드
import { describe, expect, it } from "vitest";
import {
  MAX_PATH_POINTS,
  ProtocolError,
  PROTOCOL_VERSION,
  RESULT_CODES,
  SECOND_MAP_UNITS,
  UNIT_CONTROL_PROTOCOL_VERSION,
  UNIT_KIND_PROTOCOL_VERSION,
  UNIT_WIRE_KINDS,
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
  type ServerMessage,
  unitMotionSchema,
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
      { t: "stop_unit", id: 6, mapKey: 9, unitId: 12 },
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

  it("멈추기(프로토콜 17): 유닛 ID는 1 이상, 위치 칸은 없다", () => {
    expect(UNIT_CONTROL_PROTOCOL_VERSION).toBe(17);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(UNIT_CONTROL_PROTOCOL_VERSION);
    const stop = { t: "stop_unit", id: 1, mapKey: 9, unitId: 3 };
    expect(clientOk(stop)).toBe(true);
    expect(clientOk({ ...stop, unitId: 0 })).toBe(false);
    expect(clientOk({ t: "stop_unit", id: 1, mapKey: 9 })).toBe(false);
    // 결과 코드 둘(내 유닛이 아님·수호신은 머문다)이 결과 메시지로 오간다
    for (const code of ["not_owner", "unit_stays"] as const) {
      expect(RESULT_CODES).toContain(code);
      expect(serverOk({ t: "result", id: 1, ok: false, code })).toBe(true);
    }
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

  it("표시 종류(프로토콜 18): 없거나 영어 소문자 이름. 모르는 이름도 받고(기기가 보통 유닛으로), 17판 기기는 그 칸을 버린다", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(UNIT_KIND_PROTOCOL_VERSION);
    expect(UNIT_WIRE_KINDS).toContain("npc_leader");
    expect(serverOk(pathsWith({ kind: "npc_leader" }))).toBe(true);
    // 나중에 더할 값도 옛 기기가 메시지를 버리지 않는다
    expect(serverOk(pathsWith({ kind: "guardian_2" }))).toBe(true);
    expect(serverOk(pathsWith({ kind: "" }))).toBe(false);
    expect(serverOk(pathsWith({ kind: "Leader" }))).toBe(false);
    expect(serverOk(pathsWith({ kind: "a".repeat(33) }))).toBe(false);
    expect(serverOk(pathsWith({ kind: 7 }))).toBe(false);
    // 17판 정의(종류 칸 없음)로 읽어도 나머지는 그대로 — 모르는 칸은 버린다(strict가 아니다)
    const legacy = unitMotionSchema.omit({ kind: true });
    expect(legacy.parse({ ...unit, kind: "npc_leader" })).toEqual(unit);
  });

  it("빈 unit_paths는 보내지 않는다(스키마가 거부). 사라진 유닛(hidden)만 있으면 된다", () => {
    expect(serverOk({ t: "unit_paths", mapKey: 9, fromRev: 1, rev: 2, units: [] })).toBe(false);
    expect(serverOk({ t: "unit_paths", mapKey: 9, fromRev: 1, rev: 2, units: [], hidden: [] })).toBe(false);
    expect(serverOk({ t: "unit_paths", mapKey: 9, fromRev: 1, rev: 2, units: [], hidden: [3] })).toBe(true);
  });

  it("시야 메시지(탐사 칸 128바이트 base64)와 자른 경로(until)", () => {
    // 0x01 128바이트의 base64(3바이트 = "AQEB", 남는 2바이트 = "AQE=")
    const explored = `${"AQEB".repeat(42)}AQE=`;
    expect(serverOk({ t: "vision", mapKey: 9, explored })).toBe(true);
    expect(serverOk({ t: "vision", mapKey: 9, explored: explored.slice(4) })).toBe(false);
    const clipped = { id: 1, size: 1, speed: 437, departAtMs: 5, path: [0, 0, 1024, 0], until: 2_000 };
    expect(serverOk({ t: "unit_paths", mapKey: 9, fromRev: 1, rev: 2, units: [clipped] })).toBe(true);
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
