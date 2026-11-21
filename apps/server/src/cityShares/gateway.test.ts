// 도시 지분 소켓 시험 — 로그인·서비스 없음·결과 꼴·가문/의결 소켓과 한 소켓으로 묶기(withCityShares), docs/adr/2026-11-21-share-market.md
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { HouseGovernanceGateway } from "../governance/gateway.ts";
import { createCityShareSocket, withCityShares } from "./gateway.ts";
import type { CityShareService } from "./service.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const log = { error: () => undefined };

function fakeService(calls: string[]): Pick<CityShareService, "place" | "cancel"> {
  return {
    place: (userId, input) => {
      calls.push(
        `place:${userId}:${input.cityId}:${input.side}:${input.price}:${input.shares}:${input.asHouse}`,
      );
      return Promise.resolve({ ok: true, orderId: 7 });
    },
    cancel: (userId, orderId) => {
      calls.push(`cancel:${userId}:${orderId}`);
      return Promise.resolve({ ok: false, code: "unknown_order" });
    },
  };
}

describe("도시 지분 소켓", () => {
  it("로그인한 사용자 주문을 서비스로 넘기고 city_share_result로 답한다", async () => {
    const calls: string[] = [];
    const sent: unknown[] = [];
    const socket = createCityShareSocket({ service: () => fakeService(calls), now: () => 0, log }).open({
      send: (text) => sent.push(decodeServerMessage(text)),
      viewer: () => Promise.resolve({ id: "u1", loginId: "u1", roles: ["player"] }),
    });
    socket.handle({
      t: "city_share_order",
      id: 1,
      cityId: 3,
      side: "buy",
      price: "12",
      shares: "4",
      asHouse: true,
    });
    socket.handle({ t: "city_share_cancel", id: 2, orderId: 9 });
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toEqual(["place:u1:3:buy:12:4:true", "cancel:u1:9"]);
    expect(sent).toEqual([
      { t: "city_share_result", id: 1, ok: true, orderId: 7 },
      { t: "city_share_result", id: 2, ok: false, code: "unknown_order" },
    ]);
  });

  it("로그인하지 않았으면 sign_in_required, 서비스가 없으면 busy", async () => {
    const sent: unknown[] = [];
    const anon = createCityShareSocket({ service: () => undefined, now: () => 0, log }).open({
      send: (text) => sent.push(decodeServerMessage(text)),
      viewer: () => Promise.resolve(null),
    });
    anon.handle({ t: "city_share_cancel", id: 5, orderId: 1 });
    const user = createCityShareSocket({ service: () => undefined, now: () => 0, log }).open({
      send: (text) => sent.push(decodeServerMessage(text)),
      viewer: () => Promise.resolve({ id: "u2", loginId: "u2", roles: ["player"] }),
    });
    user.handle({ t: "city_share_cancel", id: 6, orderId: 1 });
    for (let i = 0; i < 6; i++) await settle();
    expect(sent).toEqual([
      { t: "city_share_result", id: 5, ok: false, code: "sign_in_required" },
      { t: "city_share_result", id: 6, ok: false, code: "busy" },
    ]);
  });

  it("묶은 소켓: 도시 지분 메시지만 지분 소켓으로, 나머지는 가문·의결 소켓으로", async () => {
    const routed: string[] = [];
    const base: HouseGovernanceGateway = {
      open: () => ({ handle: (message) => routed.push(`base:${message.t}`), close: () => undefined }),
    };
    const calls: string[] = [];
    const socket = withCityShares(
      base,
      createCityShareSocket({ service: () => fakeService(calls), now: () => 0, log }),
    ).open({
      send: () => undefined,
      viewer: () => Promise.resolve({ id: "u3", loginId: "u3", roles: ["player"] }),
    });
    socket.handle({ t: "gov_coup", id: 1 });
    socket.handle({ t: "city_share_cancel", id: 2, orderId: 4 });
    for (let i = 0; i < 6; i++) await settle();
    expect(routed).toEqual(["base:gov_coup"]);
    expect(calls).toEqual(["cancel:u3:4"]);
    socket.close();
  });
});
