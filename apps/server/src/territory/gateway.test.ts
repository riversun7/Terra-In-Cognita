// 영토 비콘 연결 처리 시험 — 로그인, 세계 준비 전, 개발 권한 표시, 같은 요청 번호 다시 보내기, 결과 메시지 모양
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createTerritoryGateway } from "./gateway.ts";
import type { BeaconCommandResult, TerritoryActor, TerritoryService } from "./service.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const dev: Viewer = { id: "dev-1", loginId: "builder", roles: ["dev"] };
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeService(calls: string[]): TerritoryService {
  let next = 0;
  return {
    place: (actor: TerritoryActor, input): Promise<BeaconCommandResult> => {
      next += 1;
      calls.push(
        `place:${actor.userId}:${actor.devPlace}:${input.planetId}:${input.cellKey}:${input.factionId ?? "-"}`,
      );
      return Promise.resolve(
        input.cellKey === 7 ? { ok: false, code: "out_of_range" } : { ok: true, beaconId: next },
      );
    },
    remove: (actor, beaconId) => {
      calls.push(`remove:${actor.userId}:${actor.devPlace}:${beaconId}`);
      return Promise.resolve({ ok: true });
    },
    planetView: () => Promise.resolve(undefined),
    mineView: () => Promise.resolve(undefined),
    cityOwnerChanged: () => 0,
    beaconCount: () => next,
    beaconState: () => undefined,
    canManage: () => Promise.resolve(false),
    repairBeacon: () => false,
    finishBeacon: () => false,
    supplyCity: () => Promise.resolve(null),
    urbanCity: () => Promise.resolve(null),
    damageBeacon: () => false,
    provinceAt: () => undefined,
    warm: async () => undefined,
  };
}

function open(service: TerritoryService | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createTerritoryGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

const place = { t: "beacon_place", id: 1, planetId: "s2_test_planet", cellKey: 5 } as const;

describe("영토 비콘 연결", () => {
  it("로그인하지 않았거나 세계가 준비 전이면 명령을 넘기지 않는다", async () => {
    const calls: string[] = [];
    const signedOut = open(fakeService(calls), null);
    signedOut.socket.handle(place);
    const booting = open(undefined, player);
    booting.socket.handle(place);
    await settle();
    expect(signedOut.sent).toEqual([{ t: "beacon_result", id: 1, ok: false, code: "sign_in_required" }]);
    expect(booting.sent).toEqual([{ t: "beacon_result", id: 1, ok: false, code: "busy" }]);
    expect(calls).toEqual([]);
  });

  it("개발 권한(territory: dev-place)은 서비스에 알리고, 결과 코드를 그대로 보낸다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), dev);
    socket.handle({ ...place, factionId: 3 });
    socket.handle({ ...place, id: 2, cellKey: 7 });
    socket.handle({ t: "beacon_remove", id: 3, beaconId: 1 });
    await settle();
    await settle();
    expect(calls).toEqual([
      "place:dev-1:true:s2_test_planet:5:3",
      "place:dev-1:true:s2_test_planet:7:-",
      "remove:dev-1:true:1",
    ]);
    expect(sent).toEqual([
      { t: "beacon_result", id: 1, ok: true, beaconId: 1 },
      { t: "beacon_result", id: 2, ok: false, code: "out_of_range" },
      { t: "beacon_result", id: 3, ok: true },
    ]);
  });

  it("같은 요청 번호를 다시 보내면 처음 결과를 다시 준다(두 번 놓지 않는다)", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), player);
    socket.handle(place);
    socket.handle(place);
    await settle();
    await settle();
    expect(calls).toEqual(["place:user-1:false:s2_test_planet:5:-"]);
    expect(sent).toEqual([
      { t: "beacon_result", id: 1, ok: true, beaconId: 1 },
      { t: "beacon_result", id: 1, ok: true, beaconId: 1 },
    ]);
  });
});
