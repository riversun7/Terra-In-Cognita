// 폐허 복원 연결 처리 시험 — 차례 처리, 결과 메시지 모양, 개발 시험 권한, 로그인·세계 준비 전(프로토콜 13, docs/adr/2026-11-07-ruins-restoration.md)
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createRuinGateway } from "./gateway.ts";
import type { RuinService } from "./service.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const dev: Viewer = { id: "user-2", loginId: "dever", roles: ["dev"] };
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const open = { t: "restoration_open", id: 1, ruin: 12 } as const;
const fund = { t: "restoration_fund", id: 2, ruin: 12, amount: "3000" } as const;
const make = { t: "dev_make_ruin", id: 3 } as const;

function fakeService(calls: string[]): RuinService {
  return {
    overview: () => undefined,
    open: (userId, ruinId) => {
      calls.push(`open:${userId}:${ruinId}`);
      return Promise.resolve({ ok: true, ruinId });
    },
    fund: (userId, ruinId, amount) => {
      calls.push(`fund:${userId}:${ruinId}:${amount}`);
      return Promise.resolve({ ok: true, ruinId, accepted: amount, raised: "0", restored: true });
    },
    devMakeRuin: (userId) => {
      calls.push(`make:${userId}`);
      return Promise.resolve({ ok: true, ruinId: 40 });
    },
  };
}

function connect(service: RuinService | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createRuinGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

describe("폐허 복원 연결 처리", () => {
  it("받은 차례대로 서비스에 넘기고 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = connect(fakeService(calls), dev);
    for (const message of [open, fund, make]) socket.handle(message);
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual(["open:user-2:12", "fund:user-2:12:3000", "make:user-2"]);
    expect(sent).toEqual([
      { t: "restoration_result", id: 1, ok: true, ruinId: 12 },
      { t: "restoration_result", id: 2, ok: true, ruinId: 12, accepted: "3000", raised: "0", restored: true },
      { t: "restoration_result", id: 3, ok: true, ruinId: 40 },
    ]);
  });

  it("개발 시험 폐허는 dev·admin만, 로그인하지 않았으면 sign_in_required, 세계 준비 전이면 busy", async () => {
    const calls: string[] = [];
    const asPlayer = connect(fakeService(calls), player);
    asPlayer.socket.handle(make);
    const signedOut = connect(fakeService(calls), null);
    signedOut.socket.handle(fund);
    const booting = connect(undefined, player);
    booting.socket.handle(open);
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual([]);
    expect(asPlayer.sent).toEqual([{ t: "restoration_result", id: 3, ok: false, code: "forbidden" }]);
    expect(signedOut.sent).toEqual([{ t: "restoration_result", id: 2, ok: false, code: "sign_in_required" }]);
    expect(booting.sent).toEqual([{ t: "restoration_result", id: 1, ok: false, code: "busy" }]);
  });
});
