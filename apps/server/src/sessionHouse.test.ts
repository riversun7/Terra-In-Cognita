// 가문 소켓 메시지의 판 문턱·준비 전 답(sessionHouse.ts — session.ts에서 덜어 낸 그대로) 시험
import {
  COUP_PROTOCOL_VERSION,
  HOUSE_CITY_JOIN_PROTOCOL_VERSION,
  HOUSE_CITY_PROTOCOL_VERSION,
  HOUSE_CITY_TAX_PROTOCOL_VERSION,
  HOUSE_LEAGUE_PROTOCOL_VERSION,
  HOUSE_MEMBER_PROTOCOL_VERSION,
  HOUSE_POLICY_PROTOCOL_VERSION,
  HOUSE_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@terra/protocol";
import { describe, expect, it } from "vitest";
import {
  HOUSE_SOCKET_TYPES,
  type HouseSocketMessage,
  houseBusyReply,
  houseMessageNeed,
} from "./sessionHouse.ts";

const replyOf = (t: HouseSocketMessage["t"]) => houseBusyReply({ t, id: 7 });

describe("가문 소켓 메시지", () => {
  it("판 문턱: 지금 판 안, 묶음마다 높은 쪽", () => {
    expect(houseMessageNeed({ t: "house_found" })).toBe(HOUSE_PROTOCOL_VERSION);
    expect(houseMessageNeed({ t: "house_kick" })).toBe(HOUSE_MEMBER_PROTOCOL_VERSION);
    expect(houseMessageNeed({ t: "house_tax" })).toBe(
      Math.max(HOUSE_MEMBER_PROTOCOL_VERSION, HOUSE_POLICY_PROTOCOL_VERSION),
    );
    expect(houseMessageNeed({ t: "house_dissolve" })).toBe(HOUSE_CITY_PROTOCOL_VERSION);
    expect(houseMessageNeed({ t: "gov_coup" })).toBe(COUP_PROTOCOL_VERSION);
    expect(houseMessageNeed({ t: "house_league" })).toBe(HOUSE_LEAGUE_PROTOCOL_VERSION);
    for (const t of [
      "house_city_apply",
      "house_city_decide",
      "house_join_policy",
      "house_city_leave",
      "house_city_expel",
      "nation_blacklist",
    ] as const) {
      expect(houseMessageNeed({ t })).toBe(HOUSE_CITY_JOIN_PROTOCOL_VERSION);
      expect(replyOf(t)).toEqual({ t: "house_member_result", id: 7, ok: false, code: "busy" });
    }
    for (const t of ["house_city_tax_policy", "house_city_tax_pay"] as const) {
      expect(houseMessageNeed({ t })).toBe(HOUSE_CITY_TAX_PROTOCOL_VERSION);
      expect(replyOf(t)).toEqual({ t: "house_member_result", id: 7, ok: false, code: "busy" });
    }
    for (const t of HOUSE_SOCKET_TYPES) {
      expect(houseMessageNeed({ t })).toBeLessThanOrEqual(PROTOCOL_VERSION);
    }
  });

  it("준비 전 답: 메시지 묶음마다 그 결과 메시지, 같은 id", () => {
    expect(replyOf("house_found")).toEqual({ t: "house_result", id: 7, ok: false, code: "busy" });
    expect(replyOf("house_heir")).toEqual({ t: "house_member_result", id: 7, ok: false, code: "busy" });
    expect(replyOf("house_ruin")).toEqual({ t: "house_city_result", id: 7, ok: false, code: "busy" });
    expect(replyOf("gov_vote")).toEqual({ t: "gov_result", id: 7, ok: false, code: "busy" });
    expect(replyOf("dip_respond")).toEqual({ t: "dip_result", id: 7, ok: false, code: "busy" });
    expect(replyOf("house_league")).toEqual({ t: "house_league_result", id: 7, ok: false, code: "busy" });
  });
});
