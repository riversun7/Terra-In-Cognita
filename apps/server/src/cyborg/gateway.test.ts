// 사이보그 만들기 연결 처리 시험 — 로그인, 세계 준비 전, 속도 제한, 차례 처리, 결과 메시지 모양, 속성 분배(프로토콜 5)
import { CYBORG_ELEMENT_IDS, decodeServerMessage } from "@terra/protocol";
import { DEFAULT_CHARACTER_LOOK } from "@terra/shared/characterLook";
import { ELEMENT_IDS } from "@terra/shared/cyborg";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createCyborgGateway } from "./gateway.ts";
import type { CyborgCommandResult, CyborgService } from "./service.ts";

const viewer: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const roll = {
  temperament: "combat",
  stats: { str: 14, dex: 8, agi: 9, vit: 13, int: 8, wis: 8 },
  rollsLeft: 3,
  rollsMax: 4,
};

const ok = (value: CyborgCommandResult) => Promise.resolve(value);
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeService(calls: string[]): CyborgService {
  return {
    size: 0,
    status: () => ({ cyborg: null }),
    creation: () => {
      throw new Error("not used");
    },
    nameCheck: () => ({ ok: true, display: "x" }),
    roll: (userId, temperament, options) => {
      calls.push(`roll:${userId}:${temperament}${options?.unlimited ? ":unlimited" : ""}`);
      return ok({ ok: true, roll });
    },
    create: (userId, input) => {
      calls.push(`create:${userId}:${input.name}:${JSON.stringify(input.elements ?? null)}`);
      return ok({ ok: false, code: "name_taken" });
    },
    allocateElements: (userId, elements) => {
      calls.push(`elements:${userId}:${JSON.stringify(elements)}`);
      return ok({ ok: true });
    },
    chooseLook: (userId, look) => {
      calls.push(`look:${userId}:${typeof look}`);
      return ok({ ok: false, code: "look_locked" });
    },
    livingUnpaid: () => false,
    record: () => undefined,
    isBodyUnit: () => false,
    userOfUnit: () => undefined,
    repairUnits: () => 0,
    joinable: () => false,
    changeNation: () => false,
    naturalizationRules: () => ({ fee: 0n, restMs: 0, standingDrop: 0, standingDropHostile: 0 }),
    standingOf: () => 0,
    addFaith: () => undefined,
  };
}

function open(service: CyborgService | undefined, who: Viewer | null, now = () => 0, protocolVersion = 5) {
  const sent: unknown[] = [];
  const gateway = createCyborgGateway({ service: () => service, now, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
    protocolVersion,
  });
  return { sent, socket };
}

const create = {
  t: "cyborg_create",
  id: 2,
  name: "Nova",
  factionId: 1,
  cityId: 1,
  appearance: {
    head: "dome",
    face: "visor",
    body: "slim",
    limbs: "piston",
    primary: "mint",
    accent: "lemon",
  },
} as const;

describe("사이보그 연결 처리", () => {
  it("굴리기·만들기를 받은 차례대로 서비스에 넘기고 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    socket.handle({ t: "cyborg_roll", id: 1, temperament: "combat" });
    socket.handle({ ...create, elements: { fire: 10 } });
    await settle();
    await settle();
    expect(calls).toEqual(["roll:user-1:combat", 'create:user-1:Nova:{"fire":10}']);
    expect(sent).toEqual([
      { t: "cyborg_result", id: 1, ok: true, roll },
      { t: "cyborg_result", id: 2, ok: false, code: "name_taken" },
    ]);
  });

  it("로그인하지 않으면 sign_in_required, 세계가 준비 전이면 busy", async () => {
    const signedOut = open(fakeService([]), null);
    signedOut.socket.handle({ t: "cyborg_roll", id: 5, temperament: "tech" });
    await settle();
    expect(signedOut.sent).toEqual([{ t: "cyborg_result", id: 5, ok: false, code: "sign_in_required" }]);
    const booting = open(undefined, viewer);
    booting.socket.handle({ t: "cyborg_roll", id: 6, temperament: "tech" });
    await settle();
    expect(booting.sent).toEqual([{ t: "cyborg_result", id: 6, ok: false, code: "busy" }]);
  });

  it("사용자별 속도 제한(순간 10번)을 넘으면 rate_limited", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    for (let id = 1; id <= 8; id++) socket.handle({ t: "cyborg_roll", id, temperament: "combat" });
    for (let i = 0; i < 10; i++) await settle();
    for (let id = 9; id <= 12; id++) socket.handle({ t: "cyborg_roll", id, temperament: "combat" });
    for (let i = 0; i < 10; i++) await settle();
    expect(calls).toHaveLength(10);
    expect(sent.slice(-2)).toEqual([
      { t: "cyborg_result", id: 11, ok: false, code: "rate_limited" },
      { t: "cyborg_result", id: 12, ok: false, code: "rate_limited" },
    ]);
  });

  it("속성 분배(5): 5판 연결의 만들기는 분배가 꼭 있어야 하고, 4판 연결은 분배 없이 넘긴다(분배 기다림). 한 번 분배도 넘긴다", async () => {
    const calls: string[] = [];
    const v5 = open(fakeService(calls), viewer);
    v5.socket.handle(create);
    v5.socket.handle({ t: "cyborg_elements", id: 3, elements: { earth: 10 } });
    for (let i = 0; i < 4; i++) await settle();
    expect(v5.sent).toEqual([
      { t: "cyborg_result", id: 2, ok: false, code: "elements_invalid" },
      { t: "cyborg_result", id: 3, ok: true },
    ]);
    const v4 = open(fakeService(calls), viewer, () => 0, 4);
    v4.socket.handle(create);
    for (let i = 0; i < 4; i++) await settle();
    expect(calls).toEqual(['elements:user-1:{"earth":10}', "create:user-1:Nova:null"]);
  });

  it("3D 외형 한 번 고르기(22, 질문 961 나): 서비스에 넘기고 결과 코드를 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer, () => 0, 22);
    socket.handle({ t: "cyborg_look", id: 9, look: DEFAULT_CHARACTER_LOOK });
    for (let i = 0; i < 4; i++) await settle();
    expect(calls).toEqual(["look:user-1:object"]);
    expect(sent).toEqual([{ t: "cyborg_result", id: 9, ok: false, code: "look_locked" }]);
  });

  it("운영진(gm·admin·dev)의 굴리기는 횟수 제한 없음으로 넘긴다(2026-11-11), 플레이어는 그대로", async () => {
    const calls: string[] = [];
    const roleSets: Viewer["roles"][] = [["player"], ["gm"], ["dev"], ["admin", "player"]];
    for (const [index, roles] of roleSets.entries()) {
      const who: Viewer = { id: `user-${index}`, loginId: `tester${index}`, roles };
      const { socket } = open(fakeService(calls), who);
      socket.handle({ t: "cyborg_roll", id: 1, temperament: "tech" });
      for (let i = 0; i < 3; i++) await settle();
    }
    expect(calls).toEqual([
      "roll:user-0:tech",
      "roll:user-1:tech:unlimited",
      "roll:user-2:tech:unlimited",
      "roll:user-3:tech:unlimited",
    ]);
  });

  it("프로토콜의 속성 코드는 공용 목록과 같은 차례다", () => {
    expect([...CYBORG_ELEMENT_IDS]).toEqual([...ELEMENT_IDS]);
  });
});
