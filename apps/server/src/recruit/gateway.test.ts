// 구인 카드 고용 연결 처리 시험 — 로그인, 세계 준비 전, 속도 제한, 차례 처리, 결과 메시지 모양(D-469, 프로토콜 7)
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createRecruitGateway } from "./gateway.ts";
import type { RecruitService } from "./service.ts";

const viewer: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const hire = { t: "recruit_hire", id: 3, cityId: 1, window: 10, slot: 0, cost: "60" } as const;

function fakeService(calls: string[]): RecruitService {
  return {
    board: () => undefined,
    hire: (userId, input) => {
      calls.push(`${userId}:${input.cityId}:${input.window}:${input.slot}:${input.cost}`);
      return Promise.resolve(input.slot === 0 ? { ok: true, unitId: 77 } : { ok: false, code: "taken" });
    },
  };
}

function open(service: RecruitService | undefined, who: Viewer | null, now = () => 0) {
  const sent: unknown[] = [];
  const gateway = createRecruitGateway({ service: () => service, now, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

describe("구인 카드 연결 처리", () => {
  it("받은 차례대로 서비스에 넘기고 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    socket.handle(hire);
    socket.handle({ ...hire, id: 4, slot: 1 });
    await settle();
    await settle();
    expect(calls).toEqual(["user-1:1:10:0:60", "user-1:1:10:1:60"]);
    expect(sent).toEqual([
      { t: "recruit_result", id: 3, ok: true, unitId: 77 },
      { t: "recruit_result", id: 4, ok: false, code: "taken" },
    ]);
  });

  it("로그인하지 않았으면 sign_in_required, 세계가 없으면 busy", async () => {
    const signedOut = open(fakeService([]), null);
    signedOut.socket.handle(hire);
    const notReady = open(undefined, viewer);
    notReady.socket.handle(hire);
    await settle();
    await settle();
    expect(signedOut.sent).toEqual([{ t: "recruit_result", id: 3, ok: false, code: "sign_in_required" }]);
    expect(notReady.sent).toEqual([{ t: "recruit_result", id: 3, ok: false, code: "busy" }]);
  });

  it("사용자별 속도 제한(순간 10번)을 넘으면 rate_limited", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    for (let id = 1; id <= 8; id++) socket.handle({ ...hire, id });
    for (let i = 0; i < 4; i++) await settle();
    for (let id = 9; id <= 11; id++) socket.handle({ ...hire, id });
    for (let i = 0; i < 4; i++) await settle();
    expect(calls).toHaveLength(10);
    expect(sent.at(-1)).toEqual({ t: "recruit_result", id: 11, ok: false, code: "rate_limited" });
  });
});
