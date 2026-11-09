// 2차맵 자료 받기(mapFeed.ts)의 바깥 모양 — 화면은 이 타입과 요약(status·stats)만 본다(PLAN 5.7).
import type { SecondMapEngine, TerrainInput } from "@terra/engine";
import type { ResultCode } from "@terra/protocol";
import type { ServerLink } from "../net/serverLink.ts";
import type { FeedRates } from "./feedMeter.ts";
import type { TerrainFailure } from "./terrainLoader.ts";

/** 엔진 쪽 — SecondMapEngine이 그대로 맞는다(시험은 가짜를 넣는다) */
export type FeedSink = Pick<
  SecondMapEngine,
  "setTerrain" | "setUnits" | "setUnitPath" | "setBuildings" | "setExplored" | "select" | "selected"
>;

export type FeedPhase =
  /** 연결을 기다린다(처음) */
  | { kind: "connecting" }
  /** 구독을 보냈다(스냅샷을 기다린다) */
  | { kind: "subscribing" }
  | { kind: "live" }
  /** 끊겼다. 받은 유닛은 마지막 경로대로 계속 그린다. 다시 연결되면 다시 구독한다 */
  | { kind: "offline" }
  /** 서버가 바쁘거나 요청이 많다 — 잠시 뒤 저절로 다시 구독한다 */
  | { kind: "retrying"; code: ResultCode }
  /** 구독을 거절당했다 — [다시 시도]를 기다린다 */
  | { kind: "failed"; code: ResultCode };

export type TerrainState =
  | { kind: "none" }
  /** 받는 중(HTTP + 읽기) */
  | { kind: "loading" }
  /** 엔진이 메시를 만드는 중(워커) */
  | { kind: "building" }
  | { kind: "ready" }
  /** render: 받은 지형으로 메시를 만들지 못함(엔진) */
  | { kind: "failed"; reason: TerrainFailure | "render" };

export interface FeedStatus {
  phase: FeedPhase;
  terrain: TerrainState;
  /** 스냅샷을 한 번이라도 넣었는가(그 뒤에는 다시 받는 동안에도 유닛이 보인다) */
  hasSnapshot: boolean;
}

export const INITIAL_FEED_STATUS: FeedStatus = {
  phase: { kind: "connecting" },
  terrain: { kind: "none" },
  hasSnapshot: false,
};

/** no_reply: 정해진 시간 안에 결과가 오지 않음(기기가 붙인 코드) */
export type CommandOutcome = { ok: true } | { ok: false; code: ResultCode | "no_reply" };

export type MoveAttempt =
  | { kind: "sent"; id: number }
  /** 내 유닛이 아니고 운영자 모드도 아님 — 보내지 않았다 */
  | { kind: "view_only" }
  /** 연결이나 스냅샷이 없어 보내지 않았다 */
  | { kind: "offline" };

export interface CommandReport {
  id: number;
  unitId: number;
  /** 이동(move_unit)·멈추기(stop_unit) */
  action: "move" | "stop";
  outcome: CommandOutcome;
  /** 보낸 때부터 결과까지(ms) */
  elapsedMs: number;
}

export interface FeedStats extends FeedRates {
  /** 지금 rev(스냅샷 전이면 null) */
  rev: number | null;
  units: number;
  buildings: number;
  /** 마지막 스냅샷: 글자 수(= 바이트, ASCII JSON), 조각 수, 구독을 보낸 때부터 다 받기까지(ms) */
  snapshotBytes: number;
  snapshotParts: number;
  snapshotMs: number | null;
  /** 연 때부터 스냅샷과 지형이 모두 준비되기까지(ms). 아직이면 null */
  readyMs: number | null;
  /** 지형 받기·읽기(ms, 메시 만들기 제외) */
  terrainMs: number | null;
  /** 보낸 구독 수(처음 포함)와 그중 다시 구독(= 구독 − 1) */
  subscribes: number;
  resubscribes: number;
  /** rev가 빠져 다시 구독한 수 */
  gaps: number;
  /** 요청하지 않았는데 온 스냅샷(느린 연결 따라잡기) */
  serverResyncs: number;
  /** 엔진 상한을 넘어 그리지 않는 유닛 수 */
  droppedUnits: number;
  /** 탐사한 시야 칸 수(마지막 vision, 32×32 중). 아직 안 왔거나 전체 보기면 null — 0이면 2차맵이 온통 어둡다 */
  explored: number | null;
  commands: number;
  pendingCommands: number;
}

export interface MapFeedOptions {
  link: Pick<ServerLink, "send" | "isReady" | "listen" | "reconnect">;
  mapKey: number;
  sink: FeedSink;
  loadTerrain: (url: string) => Promise<TerrainInput>;
  /** 모든 유닛에 명령을 보내도 되는가(운영자 모드, dev·admin). 내 유닛(own)은 늘 된다. 서버가 따로 확인한다 */
  canCommand: () => boolean;
  /** 관리자 전체 보기로 구독할까(dev·admin, S3 시야 전송). 없으면 시야로 거른 구독 */
  observe?: () => boolean;
  /** 측정용 시각(ms, performance.now) */
  now: () => number;
  /** 서버 시계(ms) — 움직임의 늦음을 잰다 */
  serverNow: () => number;
  /** 요청 번호(기본: 무작위 수에서 시작해 1씩) */
  nextRequestId?: () => number;
  /** 엔진 유닛 상한(엔진 unitCapacity와 같게) */
  unitCapacity?: number;
  onStatus?: (status: FeedStatus) => void;
  onCommand?: (report: CommandReport) => void;
}

export interface MapFeed {
  status(): FeedStatus;
  stats(): FeedStats;
  /** 유닛을 누른 칸(배치 칸, 실수)의 가운데로 보낸다(내 유닛이거나 운영자) */
  moveUnit(unitId: number, cell: { x: number; y: number }): MoveAttempt;
  /** 유닛을 지금 자리에 세운다(프로토콜 17 stop_unit, 내 유닛이거나 운영자) */
  stopUnit(unitId: number): MoveAttempt;
  /** 시야 전송이 내 유닛(own)이라고 한 유닛인가(전체 보기 구독에는 표시가 없다) */
  isOwn(unitId: number): boolean;
  /** 지금 받은 유닛 ID(시야 안 유닛 — 근처 목록 유닛 탭, docs/adr/2026-11-08-seamless-second-map.md WP-2) */
  unitIds(): Iterable<number>;
  /**
   * 표시 종류가 붙은 지금 유닛(유닛 ID → 종류, 프로토콜 18 kind — NPC 국가 지도자 npc_leader 등). 보통 유닛은 없다. 같은 Map을 계속 바꾼다
   * (덧그림이 프레임마다 읽는다 — leaderTags.ts)
   */
  unitKinds(): ReadonlyMap<number, string>;
  /** [다시 시도] — 실패한 구독·지형을 다시 */
  retry(): void;
  /** 지금 다시 구독한다(전체 보기를 켜고 끌 때) */
  refresh(): void;
  /** 해제를 보내고 모두 멈춘다 */
  stop(): void;
}
