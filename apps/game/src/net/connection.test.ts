// 서버 연결 시험(가짜 WebSocket) — 인사·시계 맞추기·끊기면 다시 연결은 그대로이고, 기능 통로(serverLink)에 알리고,
// 다시 맺을 때(reconnect) 옛 소켓의 사건을 무시하는지
import { type ClientMessage, PROTOCOL_VERSION, decodeClientMessage } from "@terra/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectionStatus, connect } from "./connection.ts";
import { type LinkEvent, serverLink } from "./serverLink.ts";

type Listener = (event: { data?: unknown }) => void;

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeSocket[] = [];
  readonly url: string;
  readyState = FakeSocket.CONNECTING;
  readonly sent: string[] = [];
  closedWith: { code: number | undefined; reason: string | undefined } | null = null;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(code?: number, reason?: string): void {
    this.readyState = FakeSocket.CLOSING;
    this.closedWith = { code, reason };
  }

  // ---- 시험 도우미 ----
  emit(type: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  opened(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit("open");
  }
  receive(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }
  closed(): void {
    this.readyState = FakeSocket.CLOSED;
    this.emit("close");
  }
  /** 보낸 메시지(기기와 같은 정의로 읽는다) */
  messages(): ClientMessage[] {
    return this.sent.map((text) => decodeClientMessage(text));
  }
}

const welcome = {
  t: "welcome",
  protocolVersion: PROTOCOL_VERSION,
  simVersion: 1,
  contentVersion: "x@1",
  serverTime: 5,
};
const result = { t: "result", id: 3, ok: true };

function latest(): FakeSocket {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error("no socket");
  return socket;
}

describe("서버 연결", () => {
  let statuses: ConnectionStatus[];
  let events: LinkEvent[];
  let stopListening: () => void;
  let stopConnection: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("window", { location: { protocol: "https:", host: "game.test" } });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("__APP_BUILD__", "test-build");
    statuses = [];
    events = [];
    stopListening = serverLink.listen((event) => events.push(event));
    stopConnection = connect((status) => statuses.push(status));
  });

  afterEach(() => {
    stopConnection?.();
    stopListening();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("열리면 인사를 보내고, welcome 뒤 통로가 준비되어 기능 메시지를 주고받는다", () => {
    const socket = latest();
    expect(socket.url).toBe("wss://game.test/ws");
    socket.opened();
    expect(socket.messages()).toEqual([
      { t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: "test-build" },
    ]);
    expect(serverLink.isReady()).toBe(false);
    socket.receive(welcome);
    expect(statuses.at(-1)).toEqual({ kind: "connected", clock: null });
    expect(events).toEqual([{ kind: "ready" }]);
    expect(serverLink.send({ t: "subscribe", id: 9, mapKey: 1 })).toBe(true);
    expect(socket.messages().at(-1)).toEqual({ t: "subscribe", id: 9, mapKey: 1 });
    const text = JSON.stringify(result);
    socket.emit("message", { data: text });
    expect(events.at(-1)).toEqual({ kind: "message", message: result, size: text.length });
  });

  it("시계를 다섯 번 재면 통로가 그 차이를 쓴다", () => {
    const socket = latest();
    socket.opened();
    socket.receive(welcome);
    // ping이 나가는 대로 바로 답한다(왕복 0ms → 차이 = 서버 시각 − 보낸 시각)
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(i === 0 ? 0 : 200);
      const ping = socket.messages().at(-1);
      if (ping?.t !== "ping") throw new Error(`expected a ping, got ${ping?.t}`);
      socket.receive({
        t: "pong",
        id: ping.id,
        clientSendTime: ping.clientSendTime,
        serverTime: ping.clientSendTime + 2_000,
      });
    }
    const last = statuses.at(-1);
    expect(last?.kind === "connected" && last.clock !== null).toBe(true);
    expect(serverLink.clockOffsetMs()).toBe(2_000);
  });

  it("끊기면 통로에 알리고 0.5초 뒤 다시 연결한다", () => {
    const socket = latest();
    socket.opened();
    socket.receive(welcome);
    socket.closed();
    expect(events.at(-1)).toEqual({ kind: "down" });
    expect(statuses.at(-1)).toEqual({ kind: "disconnected" });
    expect(serverLink.send({ t: "subscribe", id: 1, mapKey: 1 })).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("reconnect는 지금 소켓을 정상 종료하고 바로 새로 맺는다. 옛 소켓의 사건은 무시한다", () => {
    const old = latest();
    old.opened();
    old.receive(welcome);
    serverLink.reconnect();
    expect(old.closedWith).toEqual({ code: 1000, reason: "reconnect" });
    expect(events.at(-1)).toEqual({ kind: "down" });
    expect(FakeSocket.instances).toHaveLength(2);
    const fresh = latest();
    // 옛 소켓이 늦게 닫히거나 메시지를 보내도 무시한다(다시 연결 타이머를 걸지 않는다)
    old.receive(result);
    old.closed();
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(events.filter((event) => event.kind === "message")).toEqual([]);
    fresh.opened();
    fresh.receive(welcome);
    expect(events.at(-1)).toEqual({ kind: "ready" });
  });

  it("거절되면 통로를 내리고 다시 연결하지 않는다", () => {
    const socket = latest();
    socket.opened();
    socket.receive(welcome);
    socket.receive({ t: "reject", code: "protocol_unsupported", minProtocolVersion: 1 });
    expect(statuses.at(-1)).toEqual({ kind: "rejected", code: "protocol_unsupported" });
    expect(events.at(-1)).toEqual({ kind: "down" });
    socket.closed();
    serverLink.reconnect();
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("읽지 못하는 메시지는 버린다", () => {
    const socket = latest();
    socket.opened();
    socket.receive(welcome);
    socket.emit("message", { data: "not json" });
    socket.receive({ t: "mystery" });
    expect(events).toEqual([{ kind: "ready" }]);
  });

  it("앱이 연결을 끝내면 통로를 내리고 다시 연결하지 않는다", () => {
    const socket = latest();
    socket.opened();
    socket.receive(welcome);
    stopConnection?.();
    stopConnection = undefined;
    expect(events.at(-1)).toEqual({ kind: "down" });
    socket.closed();
    vi.advanceTimersByTime(20_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
