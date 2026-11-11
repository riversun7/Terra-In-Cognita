// 가문 연결 처리 시험 — 가입 메시지(프로토콜 23, 질문 985 다)를 서비스에 넘기고 house_member_result로 답한다. 로그인 안 함·서비스 없음,
// 창설 메시지는 그대로 house_result(docs/adr/2026-11-11-faction-identity.md "바뀜 (981~986 답)")
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import type { HouseFounder } from "./found.ts";
import { createHouseGateway } from "./gateway.ts";
import type { HouseMembers } from "./members.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const log = { info: () => {}, error: () => {} };

function fakeMembers(calls: string[]): HouseMembers {
  const ok = (label: string, action: "invited" | "applied" | "joined" | "withdrawn" | "kicked") => {
    calls.push(label);
    return Promise.resolve({ ok: true as const, action, factionId: 40 });
  };
  return {
    invite: (userId, name) => ok(`invite:${userId}:${name}`, "invited"),
    apply: (userId, factionId) => ok(`apply:${userId}:${factionId}`, "applied"),
    answer: (userId, requestId, accept) => ok(`answer:${userId}:${requestId}:${accept}`, "joined"),
    withdraw: (userId, requestId) => ok(`withdraw:${userId}:${requestId}`, "withdrawn"),
    leave: (userId) => {
      calls.push(`leave:${userId}`);
      return Promise.resolve({ ok: false, code: "leader_cannot_leave" });
    },
    kick: (userId, target) => ok(`kick:${userId}:${target}`, "kicked"),
  };
}

const founder: HouseFounder = { found: () => Promise.resolve({ ok: true, factionId: 40, paid: "0" }) };

function open(members: HouseMembers | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createHouseGateway({ founder: () => founder, members: () => members, now: () => 0, log });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

const KICKED = "0b6f3f7e-1a2b-4c3d-8e9f-0123456789ab";

describe("가문 연결 처리(가입 메시지)", () => {
  it("받은 차례대로 서비스에 넘기고 house_member_result로 답한다(창설은 house_result 그대로)", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeMembers(calls), player);
    socket.handle({ t: "house_invite", id: 1, name: "철수" });
    socket.handle({ t: "house_apply", id: 2, factionId: 40 });
    socket.handle({ t: "house_answer", id: 3, requestId: 9, accept: true });
    socket.handle({ t: "house_found", id: 4, cost: "0" });
    for (let i = 0; i < 10; i++) await settle();
    socket.handle({ t: "house_withdraw", id: 5, requestId: 9 });
    socket.handle({ t: "house_leave", id: 6 });
    socket.handle({ t: "house_kick", id: 7, userId: KICKED });
    for (let i = 0; i < 10; i++) await settle();
    expect(calls).toEqual([
      "invite:user-1:철수",
      "apply:user-1:40",
      "answer:user-1:9:true",
      "withdraw:user-1:9",
      "leave:user-1",
      `kick:user-1:${KICKED}`,
    ]);
    expect(sent).toEqual([
      { t: "house_member_result", id: 1, ok: true, action: "invited", factionId: 40 },
      { t: "house_member_result", id: 2, ok: true, action: "applied", factionId: 40 },
      { t: "house_member_result", id: 3, ok: true, action: "joined", factionId: 40 },
      { t: "house_result", id: 4, ok: true, factionId: 40, paid: "0" },
      { t: "house_member_result", id: 5, ok: true, action: "withdrawn", factionId: 40 },
      { t: "house_member_result", id: 6, ok: false, code: "leader_cannot_leave" },
      { t: "house_member_result", id: 7, ok: true, action: "kicked", factionId: 40 },
    ]);
  });

  it("로그인 안 함은 sign_in_required, 가입 서비스가 없으면 busy", async () => {
    const signedOut = open(fakeMembers([]), null);
    signedOut.socket.handle({ t: "house_leave", id: 1 });
    const none = open(undefined, player);
    none.socket.handle({ t: "house_leave", id: 2 });
    for (let i = 0; i < 6; i++) await settle();
    expect(signedOut.sent).toEqual([
      { t: "house_member_result", id: 1, ok: false, code: "sign_in_required" },
    ]);
    expect(none.sent).toEqual([{ t: "house_member_result", id: 2, ok: false, code: "busy" }]);
  });
});

describe("가문 연결 처리(넘기기·해산·가문 도시, 프로토콜 24)", () => {
  it("넘기기·해산은 house_member_result, 마을·폐허 고르기는 house_city_result로 답하고 성공한 가입 일 뒤 시야 묶음을 다시 읽는다", async () => {
    const calls: string[] = [];
    let reloads = 0;
    const sent: unknown[] = [];
    const gateway = createHouseGateway({
      founder: () => founder,
      members: () => fakeMembers(calls),
      succession: () => ({
        handover: (userId, target) => {
          calls.push(`handover:${userId}:${target}`);
          return Promise.resolve({ ok: true, action: "handed_over", factionId: 40 });
        },
        dissolve: (userId) => {
          calls.push(`dissolve:${userId}`);
          return Promise.resolve({ ok: false, code: "not_alone" });
        },
      }),
      city: () => ({
        village: (userId, input) => {
          calls.push(
            `village:${userId}:${input.mapKey}:${input.x}:${input.y}:${input.mode}:${input.regime ?? "-"}`,
          );
          return Promise.resolve({ ok: true, factionId: 40, mode: input.mode, cityId: 77, paid: input.cost });
        },
        ruin: (userId, input) => {
          calls.push(`ruin:${userId}:${input.ruinId}:${input.mode}`);
          return Promise.resolve({ ok: false, code: "not_owner" });
        },
        view: () => Promise.reject(new Error("not used")),
      }),
      afterMembership: () => {
        reloads += 1;
        return Promise.resolve();
      },
      now: () => 0,
      log,
    });
    const socket = gateway.open({
      send: (text) => sent.push(decodeServerMessage(text)),
      viewer: () => Promise.resolve(player),
    });
    socket.handle({ t: "house_handover", id: 1, userId: KICKED });
    socket.handle({ t: "house_dissolve", id: 2 });
    for (let i = 0; i < 10; i++) await settle();
    socket.handle({
      t: "house_village",
      id: 3,
      mapKey: 9,
      x: 40,
      y: 50,
      cost: "5000",
      mode: "independent",
      regime: "democracy",
    });
    socket.handle({ t: "house_ruin", id: 4, ruinId: 12, mode: "vassal" });
    for (let i = 0; i < 10; i++) await settle();
    expect(calls).toEqual([
      `handover:user-1:${KICKED}`,
      "dissolve:user-1",
      "village:user-1:9:40:50:independent:democracy",
      "ruin:user-1:12:vassal",
    ]);
    expect(sent).toEqual([
      { t: "house_member_result", id: 1, ok: true, action: "handed_over", factionId: 40 },
      { t: "house_member_result", id: 2, ok: false, code: "not_alone" },
      {
        t: "house_city_result",
        id: 3,
        ok: true,
        factionId: 40,
        mode: "independent",
        cityId: 77,
        paid: "5000",
      },
      { t: "house_city_result", id: 4, ok: false, code: "not_owner" },
    ]);
    expect(reloads).toBe(1);
  });

  it("가문 도시 서비스가 없으면 busy", async () => {
    const { sent, socket } = open(fakeMembers([]), player);
    socket.handle({ t: "house_ruin", id: 5, ruinId: 1, mode: "vassal" });
    socket.handle({ t: "house_dissolve", id: 6 });
    for (let i = 0; i < 6; i++) await settle();
    expect(sent).toEqual([
      { t: "house_city_result", id: 5, ok: false, code: "busy" },
      { t: "house_member_result", id: 6, ok: false, code: "busy" },
    ]);
  });
});
