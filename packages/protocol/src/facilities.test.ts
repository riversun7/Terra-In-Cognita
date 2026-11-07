import { describe, expect, it } from "vitest";
import { decodeClientMessage, decodeServerMessage } from "./codec.ts";
import { encodeMessage } from "./encode.ts";
import {
  ATTACK_PROTOCOL_VERSION,
  FACILITY_PROTOCOL_VERSION,
  STORAGE_PROTOCOL_VERSION,
} from "./facilities.ts";
import { MIN_SUPPORTED_PROTOCOL_VERSION, PROTOCOL_VERSION } from "./version.ts";

const bad = (message: object) => JSON.stringify(message);

describe("건물 메시지(프로토콜 10, 창고 11, 공격 12)", () => {
  it("판 10부터(창고 옮기기 11, 공격 12), 지금 판 12·최소 판 11", () => {
    expect(FACILITY_PROTOCOL_VERSION).toBe(10);
    expect(STORAGE_PROTOCOL_VERSION).toBe(11);
    expect(ATTACK_PROTOCOL_VERSION).toBe(12);
    expect(PROTOCOL_VERSION).toBe(12);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(11);
  });

  it("건물·비콘 공격(12)이 왕복하고, 둘 다·둘 다 없음·유닛 없음은 받지 않는다. 새 코드는 결과로 온다", () => {
    const building = { t: "facility_attack" as const, id: 3, buildingId: 9, unitIds: [4, 5] };
    expect(decodeClientMessage(encodeMessage(building))).toEqual(building);
    const beacon = { t: "facility_attack" as const, id: 4, beaconId: 2, unitIds: [4] };
    expect(decodeClientMessage(encodeMessage(beacon))).toEqual(beacon);
    expect(() => decodeClientMessage(bad({ ...building, beaconId: 2 }))).toThrow();
    expect(() => decodeClientMessage(bad({ t: "facility_attack", id: 5, unitIds: [4] }))).toThrow();
    expect(() => decodeClientMessage(bad({ ...building, unitIds: [] }))).toThrow();
    for (const code of ["own_target", "target_ruined", "out_of_reach", "safe_zone"] as const) {
      const failed = { t: "facility_result", id: 3, ok: false, code } as const;
      expect(decodeServerMessage(encodeMessage(failed))).toEqual(failed);
    }
    const started = { t: "facility_result", id: 3, ok: true, doneAtMs: 1_800_000_060_000 } as const;
    expect(decodeServerMessage(encodeMessage(started))).toEqual(started);
  });

  it("창고 옮기기(11)·개발 재료 받기 자리 칸이 왕복하고, 틀린 방향·자산·수량은 받지 않는다", () => {
    const move = {
      t: "storage_move" as const,
      id: 8,
      buildingId: 9,
      asset: "item:pine_log",
      qty: 30,
      direction: "in" as const,
    };
    expect(decodeClientMessage(encodeMessage(move))).toEqual(move);
    const out = { ...move, asset: "s3_test_ore", direction: "out" as const };
    expect(decodeClientMessage(encodeMessage(out))).toEqual(out);
    const grant = {
      t: "dev_facility_grant",
      id: 6,
      item: "pine_log",
      qty: 4,
      mapKey: 3,
      x: 10,
      y: 255,
    } as const;
    expect(decodeClientMessage(encodeMessage(grant))).toEqual(grant);
    expect(() => decodeClientMessage(bad({ ...move, direction: "up" }))).toThrow();
    expect(() => decodeClientMessage(bad({ ...move, asset: "Item:Pine" }))).toThrow();
    expect(() => decodeClientMessage(bad({ ...move, qty: 0 }))).toThrow();
    expect(() => decodeClientMessage(bad({ ...grant, x: 256 }))).toThrow();
    const full = { t: "facility_result", id: 8, ok: false, code: "storage_full" } as const;
    expect(decodeServerMessage(encodeMessage(full))).toEqual(full);
  });

  it("짓기·레벨업·수리·장비 수리·개발 명령·결과가 왕복한다", () => {
    const build = {
      t: "facility_build" as const,
      id: 1,
      mapKey: 312_905_547_382_793,
      facility: "farm",
      x: 10,
      y: 20,
      rotation: 90 as const,
      unitIds: [3, 4],
    };
    expect(decodeClientMessage(encodeMessage(build))).toEqual(build);
    const upgrade = { t: "facility_upgrade", id: 2, buildingId: 7 } as const;
    expect(decodeClientMessage(encodeMessage(upgrade))).toEqual(upgrade);
    const repair = { t: "facility_repair" as const, id: 3, buildingId: 7, steps: 10, unitIds: [3] };
    expect(decodeClientMessage(encodeMessage(repair))).toEqual(repair);
    const beacon = { t: "facility_repair" as const, id: 4, beaconId: 2, steps: 1, unitIds: [3] };
    expect(decodeClientMessage(encodeMessage(beacon))).toEqual(beacon);
    const equip = { t: "equipment_repair" as const, id: 5, buildingId: 7, holdingId: 11, unitIds: [3] };
    expect(decodeClientMessage(encodeMessage(equip))).toEqual(equip);
    const grant = { t: "dev_facility_grant", id: 6, item: "pine_log", qty: 40 } as const;
    expect(decodeClientMessage(encodeMessage(grant))).toEqual(grant);
    const finish = { t: "dev_facility_finish", id: 7, buildingId: 7 } as const;
    expect(decodeClientMessage(encodeMessage(finish))).toEqual(finish);
    const ok = { t: "facility_result", id: 1, ok: true, buildingId: 7, doneAtMs: 1_000 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    const no = { t: "facility_result", id: 2, ok: false, code: "insufficient_materials" } as const;
    expect(decodeServerMessage(encodeMessage(no))).toEqual(no);
  });

  it("수리는 대상 하나·일꾼 하나 이상, 틀린 칸·회전·결과 코드는 받지 않는다", () => {
    expect(() => decodeClientMessage(bad({ t: "facility_repair", id: 1, steps: 1, unitIds: [3] }))).toThrow();
    expect(() =>
      decodeClientMessage(
        bad({ t: "facility_repair", id: 1, buildingId: 1, beaconId: 2, steps: 1, unitIds: [3] }),
      ),
    ).toThrow();
    expect(() =>
      decodeClientMessage(bad({ t: "facility_repair", id: 1, buildingId: 1, steps: 1, unitIds: [] })),
    ).toThrow();
    expect(() =>
      decodeClientMessage(
        bad({ t: "facility_build", id: 1, mapKey: 1, facility: "farm", x: 256, y: 0, rotation: 0 }),
      ),
    ).toThrow();
    expect(() =>
      decodeClientMessage(
        bad({ t: "facility_build", id: 1, mapKey: 1, facility: "farm", x: 0, y: 0, rotation: 45 }),
      ),
    ).toThrow();
    expect(() =>
      decodeServerMessage(bad({ t: "facility_result", id: 1, ok: false, code: "nope" })),
    ).toThrow();
  });
});
