// 실시간 세계 전투 명령(WebSocket, 프로토콜 49) — 기획 D-558 1546·D-571(답 1969). battle_list(내 유닛이 낀 진행 중인 전투)·battle_order(파티·군단
// 명령)를 보내고 같은 요청 번호의 답을 기다린다. 병원 명령(units/hospitalCommands.ts)과 같은 틀: 인사 전이면 기다렸다 보내고, 끊기면 "offline",
// TIMEOUT_MS 안에 답이 없으면 "timeout". 판정·확인은 서버가 한다(서버 권위). 화면 명령 모양(battleCommands.ts) → 프로토콜 명령은 liveOrderOf.
import type { BattleOrder, BattleOrderResultCode, BattleView } from "@terra/protocol";
import {
  type FeatureClientMessage,
  type FeatureServerMessage,
  type ServerLink,
  serverLink,
} from "../net/serverLink.ts";
import type { BattleOrderDraft } from "./battleCommands.ts";

export type LiveBattleFailure = BattleOrderResultCode | "offline" | "timeout";

export type LiveListOutcome =
  | { readonly ok: true; readonly battles: readonly BattleView[] }
  | { readonly ok: false; readonly code: LiveBattleFailure };

export type LiveOrderOutcome =
  | { readonly ok: true; readonly tick: number; readonly endsAtMs: number }
  | { readonly ok: false; readonly code: LiveBattleFailure };

const TIMEOUT_MS = 20_000;
const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 화면 명령 → 프로토콜 명령(칸은 y × 한 변 + x, 목표는 전투 유닛 ID, 따라갈 파티는 파티 ID) */
export function liveOrderOf(draft: BattleOrderDraft, mapSize: number): BattleOrder {
  switch (draft.kind) {
    case "advance":
    case "rally":
      return draft.cell
        ? { kind: draft.kind, cell: draft.cell.y * mapSize + draft.cell.x }
        : { kind: draft.kind };
    case "attack":
      return { kind: "attack", target: draft.target };
    case "follow":
      return { kind: "follow", party: draft.leader };
    case "formation":
      return { kind: "formation", shape: draft.shape };
    case "tactic":
      return { kind: "tactic", tactic: draft.tactic };
    default:
      return { kind: draft.kind };
  }
}

function request<T>(
  link: ServerLink,
  build: (id: number) => FeatureClientMessage,
  match: (message: FeatureServerMessage, id: number) => T | undefined,
  offline: (code: "offline" | "timeout") => T,
): Promise<T> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (value: T): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(value);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send(build(id));
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish(offline("offline"));
      else if (event.kind === "message") {
        const value = match(event.message, id);
        if (value !== undefined) finish(value);
      }
    });
    timer = setTimeout(() => finish(offline(sent ? "timeout" : "offline")), TIMEOUT_MS);
    trySend();
  });
}

/** 내 유닛이 낀 진행 중인 세계 전투 목록 */
export function requestLiveBattles(link: ServerLink = serverLink): Promise<LiveListOutcome> {
  return request<LiveListOutcome>(
    link,
    (id) => ({ t: "battle_list", id }),
    (message, id) => {
      if (message.t !== "battle_list_result" || message.id !== id) return undefined;
      return message.ok ? { ok: true, battles: message.battles } : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

/** 파티(party = 파티 ID)·군단(party = null)·군단장 분대(party + legion) 명령 하나 */
export function sendLiveOrder(
  input: {
    readonly battle: number;
    readonly party: number | null;
    readonly order: BattleOrder;
    /** 군단장 분대 명령(party = 정원 안 남의 분대, 2순위 — 기획 D-574, 프로토콜 88) */
    readonly legion?: boolean | undefined;
  },
  link: ServerLink = serverLink,
): Promise<LiveOrderOutcome> {
  return request<LiveOrderOutcome>(
    link,
    (id) => ({
      t: "battle_order",
      id,
      battle: input.battle,
      party: input.party,
      order: input.order,
      ...(input.legion === true ? { legion: true } : {}),
    }),
    (message, id) => {
      if (message.t !== "battle_order_result" || message.id !== id) return undefined;
      return message.ok
        ? { ok: true, tick: message.tick, endsAtMs: message.endsAtMs }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}
