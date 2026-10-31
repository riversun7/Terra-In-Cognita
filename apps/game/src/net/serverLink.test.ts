// 기능 통로 시험 — 준비·끊김 알림, 보내기, 시계 차이 유지, 연결 바꾸기, 로그인한 사용자가 바뀔 때 다시 맺기
import { describe, expect, it, vi } from "vitest";
import { type LinkEvent, createLinkHub } from "./serverLink.ts";

const clock = (offsetMs: number) => ({ offsetMs, roundTripMs: 10, sampleCount: 3 });
const result = { t: "result", id: 7, ok: true } as const;

function setup() {
  const errors: unknown[] = [];
  const hub = createLinkHub((error) => errors.push(error));
  const events: LinkEvent[] = [];
  hub.link.listen((event) => events.push(event));
  const reconnect = vi.fn();
  const driver = hub.attach({ reconnect });
  const sent: string[] = [];
  const send = (text: string) => {
    sent.push(text);
    return true;
  };
  return { hub, events, driver, reconnect, sent, send, errors };
}

describe("기능 통로", () => {
  it("인사 전에는 보내지 않고, 인사 뒤에는 JSON으로 보낸다", () => {
    const { hub, driver, sent, send, events } = setup();
    expect(hub.link.isReady()).toBe(false);
    expect(hub.link.send({ t: "subscribe", id: 1, mapKey: 5 })).toBe(false);
    driver.ready(send);
    expect(events).toEqual([{ kind: "ready" }]);
    expect(hub.link.isReady()).toBe(true);
    expect(hub.link.send({ t: "subscribe", id: 1, mapKey: 5 })).toBe(true);
    expect(sent.map((text) => JSON.parse(text))).toEqual([{ t: "subscribe", id: 1, mapKey: 5 }]);
  });

  it("소켓이 보내지 못하면 false를 그대로 돌려준다", () => {
    const { hub, driver } = setup();
    driver.ready(() => false);
    expect(hub.link.send({ t: "unsubscribe", id: 2, mapKey: 5 })).toBe(false);
  });

  it("끊김은 준비된 뒤 한 번만 알리고, 끊긴 동안 온 메시지는 넘기지 않는다", () => {
    const { hub, driver, send, events } = setup();
    driver.down();
    driver.message(result, 30);
    expect(events).toEqual([]);
    driver.ready(send);
    driver.message(result, 30);
    driver.down();
    driver.down();
    driver.message(result, 30);
    expect(events).toEqual([
      { kind: "ready" },
      { kind: "message", message: result, size: 30 },
      { kind: "down" },
    ]);
    expect(hub.link.isReady()).toBe(false);
  });

  it("시계 차이는 다시 연결해도 새로 잴 때까지 앞의 값을 쓴다", () => {
    const { hub, driver, send } = setup();
    expect(hub.link.clockOffsetMs()).toBe(0);
    driver.ready(send);
    driver.clock(clock(-250));
    driver.down();
    expect(hub.link.clockOffsetMs()).toBe(-250);
    driver.ready(send);
    expect(hub.link.clockOffsetMs()).toBe(-250);
    driver.clock(clock(40));
    expect(hub.link.clockOffsetMs()).toBe(40);
  });

  it("clockMeasured: 처음 잴 때까지 false(0은 잰 값이 아니다), 잰 뒤에는 끊겨도 true", () => {
    const { hub, driver, send } = setup();
    expect(hub.link.clockMeasured()).toBe(false);
    driver.ready(send);
    expect(hub.link.clockMeasured()).toBe(false);
    driver.clock(clock(0));
    expect(hub.link.clockMeasured()).toBe(true);
    expect(hub.link.clockOffsetMs()).toBe(0);
    driver.down();
    expect(hub.link.clockMeasured()).toBe(true);
  });

  it("새 연결이 붙으면 앞 연결의 알림은 무시하고, 앞이 준비된 채였으면 끊김으로 알린다", () => {
    const { hub, driver, send, events } = setup();
    driver.ready(send);
    const next = hub.attach({ reconnect: vi.fn() });
    expect(events.at(-1)).toEqual({ kind: "down" });
    expect(hub.link.isReady()).toBe(false);
    driver.ready(send);
    driver.message(result, 1);
    driver.clock(clock(999));
    expect(hub.link.isReady()).toBe(false);
    expect(hub.link.clockOffsetMs()).toBe(0);
    next.ready(send);
    expect(hub.link.isReady()).toBe(true);
    // 앞 연결의 정리(detach)는 새 연결을 건드리지 않는다
    driver.detach();
    expect(hub.link.isReady()).toBe(true);
    next.detach();
    expect(hub.link.isReady()).toBe(false);
    expect(events.filter((event) => event.kind === "down")).toHaveLength(2);
  });

  it("reconnect는 지금 붙은 연결에 넘긴다", () => {
    const { hub, reconnect } = setup();
    hub.link.reconnect();
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("로그인한 사용자가 아는 값에서 바뀔 때만 다시 맺는다(처음 확인은 건너뛴다)", () => {
    const { hub, reconnect } = setup();
    hub.followIdentity("user-a");
    hub.followIdentity("user-a");
    expect(reconnect).not.toHaveBeenCalled();
    hub.followIdentity(null);
    expect(reconnect).toHaveBeenCalledTimes(1);
    hub.followIdentity("user-b");
    expect(reconnect).toHaveBeenCalledTimes(2);
    hub.followIdentity("user-b");
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it("로그인 화면에서 시작해 들어가면 다시 맺는다", () => {
    const { hub, reconnect } = setup();
    hub.followIdentity(null);
    expect(reconnect).not.toHaveBeenCalled();
    hub.followIdentity("user-a");
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("듣는 쪽 하나의 오류는 다른 쪽에 알리는 것을 막지 않는다", () => {
    const { hub, driver, send, errors, events } = setup();
    const failing = new Error("listener failed");
    hub.link.listen(() => {
      throw failing;
    });
    const late: LinkEvent[] = [];
    const stop = hub.link.listen((event) => late.push(event));
    driver.ready(send);
    expect(errors).toEqual([failing]);
    expect(events).toEqual([{ kind: "ready" }]);
    expect(late).toEqual([{ kind: "ready" }]);
    stop();
    driver.down();
    expect(late).toEqual([{ kind: "ready" }]);
  });
});
