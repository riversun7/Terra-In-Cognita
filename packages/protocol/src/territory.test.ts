import { describe, expect, it } from "vitest";
import { decodeClientMessage, decodeServerMessage } from "./codec.ts";
import { encodeMessage } from "./encode.ts";
import { TERRITORY_PROTOCOL_VERSION } from "./territory.ts";
import { PROTOCOL_VERSION } from "./version.ts";

const bad = (message: object) => JSON.stringify(message);

describe("영토 비콘 메시지", () => {
  it("프로토콜 7부터, 놓기·치우기·결과가 왕복한다", () => {
    expect(TERRITORY_PROTOCOL_VERSION).toBe(7);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(TERRITORY_PROTOCOL_VERSION);
    const place = {
      t: "beacon_place",
      id: 1,
      planetId: "s2_test_planet",
      cellKey: 312_905_547_382_793,
    } as const;
    expect(decodeClientMessage(encodeMessage(place))).toEqual(place);
    const forOther = { ...place, factionId: 4 };
    expect(decodeClientMessage(encodeMessage(forOther))).toEqual(forOther);
    const remove = { t: "beacon_remove", id: 2, beaconId: 9 } as const;
    expect(decodeClientMessage(encodeMessage(remove))).toEqual(remove);
    const ok = { t: "beacon_result", id: 1, ok: true, beaconId: 3 } as const;
    expect(decodeServerMessage(encodeMessage(ok))).toEqual(ok);
    const no = { t: "beacon_result", id: 2, ok: false, code: "foreign_city" } as const;
    expect(decodeServerMessage(encodeMessage(no))).toEqual(no);
  });

  it("행성 ID 모양·음수 칸 키·모르는 결과 코드는 받지 않는다", () => {
    expect(() =>
      decodeClientMessage(bad({ t: "beacon_place", id: 1, planetId: "Bad-Id", cellKey: 1 })),
    ).toThrow();
    expect(() =>
      decodeClientMessage(bad({ t: "beacon_place", id: 1, planetId: "ok_id", cellKey: -1 })),
    ).toThrow();
    expect(() => decodeServerMessage(bad({ t: "beacon_result", id: 1, ok: false, code: "nope" }))).toThrow();
  });
});
