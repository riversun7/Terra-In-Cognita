// 2차맵 하나의 서버 자료 받기(기기 쪽) — ADR 2026-10-28-s1-second-map "전송", 규칙은 packages/protocol secondMap.ts 머리 주석
// - 열면(startMapFeed) 구독, 닫으면(stop) 해제. 연결이 다시 맺어질 때마다(ready) 다시 구독한다(서버 구독은 연결마다다).
// - 스냅샷 조각은 part 0부터 모으고 다 받으면 통째로 바꾼다(snapshotParts.ts). 그 뒤 unit_paths·건물 이벤트는 rev 규칙대로:
//   rev ≤ 내 rev면 버리고, 빠졌으면(unit_paths는 fromRev > 내 rev, 건물은 rev − 1 > 내 rev) 다시 구독한다(= 새 스냅샷).
//   다시 구독한 뒤 새 스냅샷이 올 때까지 오는 변화는 버린다(순서가 이미 끊겼다).
// - 지형은 스냅샷의 주소를 HTTP로 받는다(첫 조각이 오면 바로 시작). 주소가 바뀌거나 앞서 실패했을 때만 다시 받는다.
// - 이동·멈추기 명령은 내 유닛(own)이거나 canCommand(운영자 모드, dev·admin)일 때만 보낸다(서버도 명령마다 권한·소유를 본다,
//   docs/adr/2026-11-07-unit-control.md). 멈추기(stop_unit)는 프로토콜 17이다.
// - 시야 전송(S3 ADR 3절): 남의 유닛은 자른 경로가 오고, 시야에서 사라지면 unit_paths.hidden으로 지운다. 탐사 칸(vision)은
//   onExplored로 넘긴다(화면이 안개를 칠한다). 전체 보기(observe, dev·admin)로 구독하면 안개를 끈다.
//   결과 전에 끊기면 다시 연결된 뒤 같은 요청 번호로 다시 보낸다 — 서버 중복 방지가 두 번 실행을 막는다(ADR 7).
// - 고빈도 상태(유닛 움직임)는 엔진에 바로 넣고, 화면에는 요약(status·stats)만 준다(PLAN 5.7). 타입은 feedTypes.ts.
import type { BuildingFootprint } from "@terra/engine";
import type {
  BuildingWire,
  ClientMessageOf,
  ResultCode,
  ServerMessageOf,
  UnitMotionWire,
} from "@terra/protocol";
import type { FeatureServerMessage, LinkEvent } from "../net/serverLink.ts";
import { createFeedMeter } from "./feedMeter.ts";
import type {
  CommandOutcome,
  FeedPhase,
  FeedStatus,
  MapFeed,
  MapFeedOptions,
  MoveAttempt,
  TerrainState,
} from "./feedTypes.ts";
import { targetUnits, toFootprint, toUnitPath, toUnitSpawn } from "./mapWire.ts";
import { type AssembledSnapshot, createSnapshotAssembler } from "./snapshotParts.ts";
import { type TerrainFailure, TerrainLoadError } from "./terrainLoader.ts";

/** 다시 구독 기다림: 1초에서 두 배씩, 15초까지 */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;
/** 구독을 보내고 이 안에 스냅샷을 다 받지 못하면 다시 구독한다 */
const SNAPSHOT_TIMEOUT_MS = 10_000;
/** 빠짐 때문에 다시 구독할 때 앞 구독과 띄우는 최소 간격(서버 구독 제한: 사용자별 초당 1번) */
const MIN_RESUBSCRIBE_GAP_MS = 1_000;
/** 명령 결과를 기다리는 시간 */
const COMMAND_TIMEOUT_MS = 20_000;
/** 엔진 기본 유닛 상한(@terra/engine DEFAULT_UNIT_CAPACITY) */
const DEFAULT_UNIT_CAPACITY = 2_048;
/** 잠시 뒤 다시 해 보면 되는 구독 실패 */
const RETRYABLE: ReadonlySet<ResultCode> = new Set(["rate_limited", "busy", "internal_error"]);

function randomU32(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 0;
}

/**
 * 요청 번호 만들기. 서버는 명령을 (사용자, 2차맵, 번호)로 10분 동안 한 번만 실행한다. 그래서 새로고침·다른 기기에서도
 * 겹치지 않게 무작위 수에서 시작해 1씩 올린다(u32에서 돈다).
 */
export function createRequestIds(start: number = randomU32()): () => number {
  let next = start >>> 0;
  return () => {
    const id = next;
    next = (next + 1) >>> 0;
    return id;
  };
}

let sharedRequestIds: (() => number) | null = null;
const defaultRequestId = (): number => {
  sharedRequestIds ??= createRequestIds();
  return sharedRequestIds();
};

interface PendingCommand {
  message: ClientMessageOf<"move_unit" | "stop_unit">;
  unitId: number;
  sentAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export function startMapFeed(options: MapFeedOptions): MapFeed {
  const { link, mapKey, sink, now } = options;
  const capacity = options.unitCapacity ?? DEFAULT_UNIT_CAPACITY;
  const nextId = options.nextRequestId ?? defaultRequestId;
  const startedAt = now();
  const meter = createFeedMeter(now);
  const assembler = createSnapshotAssembler();

  let stopped = false;
  let phase: FeedPhase = { kind: "connecting" };
  let terrain: TerrainState = { kind: "none" };
  let hasSnapshot = false;
  let rev = 0;
  const units = new Map<number, UnitMotionWire>();
  /** 엔진 상한을 넘어 버린 유닛(다시 와도 버린다) */
  const dropped = new Set<number>();
  const buildings = new Map<number, BuildingWire>();
  /** 모으는 스냅샷이 구독해서 받는 것인가(아니면 서버가 따라잡기로 보냄) */
  let assemblingRequested = false;
  /** 지금 연결에서 구독을 보냈는가(닫을 때 해제를 보낸다) */
  let subscribedOnLink = false;
  /** 결과를 기다리는 구독의 요청 번호 */
  let subscribeId: number | null = null;
  /** 지금 구독이 전체 보기인가 */
  let observing = false;
  /** 마지막 탐사 칸(vision)에서 켜진 시야 칸 수. 아직 없거나 전체 보기면 null */
  let explored: number | null = null;
  /** 결과를 기다리는 개발 시험 명령 */
  const devSpawns = new Map<number, ReturnType<typeof setTimeout>>();
  /** 구독을 보냈고 그 스냅샷을 아직 못 받았다 */
  let awaitingSnapshot = false;
  let subscribeSentAt: number | null = null;
  /** 이어서 실패한 수(다시 구독 기다림을 늘린다). 스냅샷을 받으면 0 */
  let failures = 0;
  /** sign_in_required에 연결을 한 번 다시 맺었는가(스냅샷을 받으면 다시 false) */
  let authReconnected = false;
  /** 지형 404에 한 번 다시 구독했는가(지형을 받으면 다시 false) */
  let notFoundRetried = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  let terrainUrl: string | null = null;
  let terrainToken = 0;
  const pending = new Map<number, PendingCommand>();
  const counts = { subscribes: 0, gaps: 0, serverResyncs: 0, commands: 0 };
  const last = {
    snapshotBytes: 0,
    snapshotParts: 0,
    snapshotMs: null as number | null,
    readyMs: null as number | null,
    terrainMs: null as number | null,
  };

  const status = (): FeedStatus => ({ phase, terrain, hasSnapshot });
  const emitStatus = (): void => {
    if (!stopped) options.onStatus?.(status());
  };
  const setPhase = (next: FeedPhase): void => {
    phase = next;
    emitStatus();
  };
  const markReady = (): void => {
    if (last.readyMs === null && hasSnapshot && terrain.kind === "ready") last.readyMs = now() - startedAt;
  };

  // ---------- 구독 ----------

  const clearRetry = (): void => {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const clearSnapshotTimer = (): void => {
    if (snapshotTimer !== undefined) clearTimeout(snapshotTimer);
    snapshotTimer = undefined;
  };
  const backoffMs = (): number => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));
  const scheduleSubscribe = (delayMs: number): void => {
    clearRetry();
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      subscribe();
    }, delayMs);
  };

  const onSnapshotTimeout = (): void => {
    snapshotTimer = undefined;
    if (stopped || !awaitingSnapshot) return;
    failures += 1;
    subscribeId = null;
    assembler.reset();
    scheduleSubscribe(backoffMs());
  };

  /** 지금 구독을 보낸다. 연결이 아직이면 아무것도 하지 않는다(ready 때 보낸다) */
  function subscribe(): void {
    clearRetry();
    clearSnapshotTimer();
    if (stopped || !link.isReady()) return;
    const id = nextId();
    const observe = options.observe?.() === true;
    if (!link.send(observe ? { t: "subscribe", id, mapKey, observe: true } : { t: "subscribe", id, mapKey }))
      return;
    observing = observe;
    subscribedOnLink = true;
    subscribeId = id;
    awaitingSnapshot = true;
    assembler.reset();
    subscribeSentAt = now();
    counts.subscribes += 1;
    snapshotTimer = setTimeout(onSnapshotTimeout, SNAPSHOT_TIMEOUT_MS);
    setPhase({ kind: "subscribing" });
  }

  /** 새 스냅샷을 다시 받는다. 앞 구독과 너무 가까우면 조금 뒤에 */
  const resubscribe = (reason: "gap" | "terrain" | "refresh"): void => {
    if (reason === "gap") counts.gaps += 1;
    assembler.reset();
    awaitingSnapshot = true;
    const since = subscribeSentAt === null ? Number.POSITIVE_INFINITY : now() - subscribeSentAt;
    if (since < MIN_RESUBSCRIBE_GAP_MS) {
      clearSnapshotTimer();
      subscribeId = null;
      setPhase({ kind: "subscribing" });
      scheduleSubscribe(MIN_RESUBSCRIBE_GAP_MS - since);
      return;
    }
    subscribe();
  };

  const onSubscribeFailed = (code: ResultCode): void => {
    clearSnapshotTimer();
    if (RETRYABLE.has(code)) {
      failures += 1;
      setPhase({ kind: "retrying", code });
      scheduleSubscribe(backoffMs());
      return;
    }
    if (code === "sign_in_required" && !authReconnected) {
      // 앱을 켤 때 연결은 로그인보다 먼저 열린다 → 한 번만 다시 맺고(새 연결 요청에 쿠키가 실린다) ready에서 다시 구독한다
      authReconnected = true;
      link.reconnect();
      return;
    }
    setPhase({ kind: "failed", code });
  };

  // ---------- 엔진에 넣기 ----------

  const footprints = (): BuildingFootprint[] => [...buildings.values()].map(toFootprint);

  /** 유닛 목록을 통째로 엔진에 넣는다. 고른 유닛이 남아 있으면 다시 고른다(엔진은 목록을 바꾸면 고르기를 푼다) */
  const pushUnits = (): void => {
    const keep = sink.selected();
    const list = [...units.values()];
    sink.setUnits(list.map(toUnitSpawn));
    for (const unit of list) sink.setUnitPath(unit.id, toUnitPath(unit));
    if (keep !== null && units.has(keep)) sink.select(keep);
  };

  const ensureTerrain = (url: string): void => {
    if (url === terrainUrl && terrain.kind !== "failed" && terrain.kind !== "none") return;
    terrainUrl = url;
    const token = ++terrainToken;
    const started = now();
    terrain = { kind: "loading" };
    emitStatus();
    const current = (): boolean => !stopped && token === terrainToken;
    const fail = (reason: TerrainFailure | "render"): void => {
      terrain = { kind: "failed", reason };
      emitStatus();
    };
    void options.loadTerrain(url).then(
      (input) => {
        if (!current()) return undefined;
        last.terrainMs = now() - started;
        terrain = { kind: "building" };
        emitStatus();
        return sink.setTerrain(input).then(
          () => {
            if (!current()) return;
            terrain = { kind: "ready" };
            notFoundRetried = false;
            markReady();
            emitStatus();
          },
          () => {
            if (current()) fail("render");
          },
        );
      },
      (error: unknown) => {
        if (!current()) return;
        const reason = error instanceof TerrainLoadError ? error.reason : "invalid";
        fail(reason);
        // 주소의 버전이 지금 서버와 다르다(서버를 새 생성기로 바꿨다) → 한 번은 새 스냅샷의 주소로 다시
        if (reason === "not_found" && !notFoundRetried) {
          notFoundRetried = true;
          terrainUrl = null;
          resubscribe("terrain");
        }
      },
    );
  };

  const applySnapshot = (snapshot: AssembledSnapshot, requested: boolean): void => {
    // 서버는 구독 결과(ok)를 먼저 보내고 스냅샷을 보낸다. 우리 구독의 결과를 받기 전에 온 스냅샷은 앞 구독(예: 개발 모드에서
    // 두 번 연 화면)이나 서버 따라잡기의 것이다 → 그려 두되 우리 구독의 답을 계속 기다린다(그 구독이 거절될 수도 있다)
    const answered = subscribeId === null;
    units.clear();
    dropped.clear();
    for (const unit of snapshot.units) {
      if (units.has(unit.id) || units.size < capacity) units.set(unit.id, unit);
      else dropped.add(unit.id);
    }
    buildings.clear();
    for (const building of snapshot.buildings) buildings.set(building.id, building);
    rev = snapshot.rev;
    pushUnits();
    sink.setBuildings(footprints());
    // 전체 보기는 안개가 없다(시야로 거른 구독은 스냅샷 뒤 vision이 온다)
    if (observing) {
      sink.setExplored(null);
      explored = null;
    }
    last.snapshotBytes = snapshot.bytes;
    last.snapshotParts = snapshot.parts;
    if (!requested) counts.serverResyncs += 1;
    hasSnapshot = true;
    ensureTerrain(snapshot.terrainUrl);
    markReady();
    if (!answered) {
      emitStatus();
      return;
    }
    clearSnapshotTimer();
    clearRetry();
    if (requested && subscribeSentAt !== null) last.snapshotMs = now() - subscribeSentAt;
    awaitingSnapshot = false;
    failures = 0;
    authReconnected = false;
    setPhase({ kind: "live" });
  };

  // ---------- 받은 메시지 ----------

  const onSnapshotPart = (message: ServerMessageOf<"map_snapshot">, size: number): void => {
    if (message.part === 0) {
      assemblingRequested = awaitingSnapshot;
      // 지형은 첫 조각이 오면 바로 받기 시작한다(나머지 조각과 함께 온다)
      ensureTerrain(message.terrain.url);
    }
    const result = assembler.add(message, size);
    // 조각이 빠졌다(읽지 못한 메시지 등) → 처음부터 다시
    if (result.kind === "broken") resubscribe("gap");
    else if (result.kind === "complete") applySnapshot(result.snapshot, assemblingRequested);
  };

  /** 바뀐 것을 지금 넣어도 되는가. 조각을 모으는 중에 다른 메시지가 오면 조각이 빠진 것이다 */
  const canApplyChange = (): boolean => {
    if (assembler.active) {
      resubscribe("gap");
      return false;
    }
    return hasSnapshot && !awaitingSnapshot;
  };

  const onUnitPaths = (message: ServerMessageOf<"unit_paths">): void => {
    if (!canApplyChange() || message.rev <= rev) return;
    if (message.fromRev > rev) {
      resubscribe("gap");
      return;
    }
    const at = options.serverNow();
    let added = false;
    for (const unit of message.units) {
      meter.update(at - unit.departAtMs);
      if (!units.has(unit.id)) {
        if (dropped.has(unit.id) || units.size >= capacity) {
          dropped.add(unit.id);
          continue;
        }
        // 스냅샷 뒤에 생긴 유닛 — 목록을 다시 넣는다(엔진은 유닛을 하나씩 더하지 않는다)
        added = true;
      }
      units.set(unit.id, unit);
      if (!added) sink.setUnitPath(unit.id, toUnitPath(unit));
    }
    // 시야에서 사라진 유닛(시야 전송) — 엔진은 하나씩 빼지 않아서 목록을 다시 넣는다
    let removed = false;
    for (const id of message.hidden ?? []) {
      dropped.delete(id);
      if (units.delete(id)) removed = true;
    }
    if (added || removed) pushUnits();
    rev = message.rev;
  };

  const onVision = (message: ServerMessageOf<"vision">): void => {
    if (observing) return;
    const bits = Uint8Array.from(atob(message.explored), (char) => char.charCodeAt(0));
    sink.setExplored(bits);
    explored = countBits(bits);
  };

  const onBuildingChange = (changeRev: number, apply: () => void): void => {
    if (!canApplyChange() || changeRev <= rev) return;
    if (changeRev - 1 > rev) {
      resubscribe("gap");
      return;
    }
    apply();
    sink.setBuildings(footprints());
    rev = changeRev;
  };

  const finishCommand = (id: number, outcome: CommandOutcome): void => {
    const command = pending.get(id);
    if (!command) return;
    pending.delete(id);
    clearTimeout(command.timer);
    options.onCommand?.({
      id,
      unitId: command.unitId,
      action: command.message.t === "stop_unit" ? "stop" : "move",
      outcome,
      elapsedMs: now() - command.sentAt,
    });
  };

  /** 유닛 명령 보내기(이동·멈추기): 내 유닛이거나 운영자일 때만, 연결·스냅샷이 있을 때만. 결과는 onCommand로 */
  const sendCommand = (
    unitId: number,
    build: (id: number) => ClientMessageOf<"move_unit" | "stop_unit">,
  ): MoveAttempt => {
    if (!options.canCommand() && units.get(unitId)?.own !== true) return { kind: "view_only" };
    if (stopped || !hasSnapshot || !link.isReady()) return { kind: "offline" };
    const id = nextId();
    const message = build(id);
    if (!link.send(message)) return { kind: "offline" };
    counts.commands += 1;
    pending.set(id, {
      message,
      unitId,
      sentAt: now(),
      timer: setTimeout(() => finishCommand(id, { ok: false, code: "no_reply" }), COMMAND_TIMEOUT_MS),
    });
    return { kind: "sent", id };
  };

  const onResult = (message: ServerMessageOf<"result">): void => {
    const devTimer = devSpawns.get(message.id);
    if (devTimer !== undefined) {
      clearTimeout(devTimer);
      devSpawns.delete(message.id);
      options.onDevSpawn?.(message.ok ? { ok: true } : { ok: false, code: message.code });
      // 내 유닛이 생겼다 → 새 스냅샷(시야 묶음이 바뀐다)
      if (message.ok) resubscribe("refresh");
      return;
    }
    if (message.id === subscribeId) {
      subscribeId = null;
      if (!message.ok) onSubscribeFailed(message.code);
      return;
    }
    // 명령 결과. 해제 결과나 옛 요청의 결과는 버린다
    if (pending.has(message.id)) {
      finishCommand(message.id, message.ok ? { ok: true } : { ok: false, code: message.code });
    }
  };

  const onMessage = (message: FeatureServerMessage, size: number): void => {
    if (message.t === "result") {
      onResult(message);
      return;
    }
    // 사이보그 만들기 결과(프로토콜 4)는 만들기 화면이, 보유 물건 결과(프로토콜 6)·구인 카드 고용 결과(프로토콜 7)는 그 화면이, 영토 비콘
    // 결과(프로토콜 7)는 영토 화면이, 노동 계약 결과(프로토콜 7)·건물 결과(프로토콜 10)는 경제 화면이, 융합·유전자 결과(프로토콜 9·11)는
    // 유닛 화면이, 신전 결과(프로토콜 12)·폐허 복원 결과(프로토콜 13)·거래소 결과·체결 알림(프로토콜 14)·환전 결과(프로토콜 15)는 경제 화면이,
    // 2차맵 사이 이동 결과(프로토콜 16)는 1차맵 명령 판이, 채집·들어가기 결과(프로토콜 17)는 2차맵 채집 판이, 병원 결과(프로토콜 17)는 유닛 화면이 받는다
    if (
      message.t === "cyborg_result" ||
      message.t === "item_result" ||
      message.t === "beacon_result" ||
      message.t === "recruit_result" ||
      message.t === "labor_result" ||
      message.t === "fusion_result" ||
      message.t === "facility_result" ||
      message.t === "temple_result" ||
      message.t === "restoration_result" ||
      message.t === "market_result" ||
      message.t === "market_fill" ||
      message.t === "fx_result" ||
      message.t === "travel_result" ||
      message.t === "gather_result" ||
      message.t === "hospital_result" ||
      message.t === "nationality_result"
    )
      return;
    if (message.mapKey !== mapKey) return;
    if (message.t === "map_snapshot") {
      onSnapshotPart(message, size);
      return;
    }
    meter.message(size);
    switch (message.t) {
      case "unit_paths":
        onUnitPaths(message);
        return;
      case "vision":
        onVision(message);
        return;
      case "building_placed":
        onBuildingChange(message.rev, () => buildings.set(message.building.id, message.building));
        return;
      case "building_removed":
        onBuildingChange(message.rev, () => buildings.delete(message.buildingId));
        return;
      default: {
        const unhandled: never = message;
        return unhandled;
      }
    }
  };

  const onLink = (event: LinkEvent): void => {
    if (stopped) return;
    if (event.kind === "message") {
      onMessage(event.message, event.size);
      return;
    }
    if (event.kind === "ready") {
      subscribe();
      // 결과 전에 끊긴 명령은 같은 번호로 다시 보낸다(이미 실행됐으면 서버가 처음 결과를 다시 준다)
      for (const command of pending.values()) link.send(command.message);
      return;
    }
    // 끊김: 서버 쪽 구독은 그 연결과 함께 사라졌다
    subscribedOnLink = false;
    subscribeId = null;
    assembler.reset();
    awaitingSnapshot = true;
    clearRetry();
    clearSnapshotTimer();
    setPhase({ kind: "offline" });
  };

  const unlisten = link.listen(onLink);
  subscribe();
  emitStatus();

  return {
    status,
    stats() {
      return {
        rev: hasSnapshot ? rev : null,
        units: units.size,
        buildings: buildings.size,
        ...last,
        subscribes: counts.subscribes,
        resubscribes: Math.max(0, counts.subscribes - 1),
        gaps: counts.gaps,
        serverResyncs: counts.serverResyncs,
        droppedUnits: dropped.size,
        explored,
        commands: counts.commands,
        pendingCommands: pending.size,
        ...meter.rates(),
      };
    },
    moveUnit(unitId, cell) {
      return sendCommand(unitId, (id) => ({
        t: "move_unit",
        id,
        mapKey,
        unitId,
        x: targetUnits(cell.x),
        y: targetUnits(cell.y),
      }));
    },
    stopUnit(unitId) {
      return sendCommand(unitId, (id) => ({ t: "stop_unit", id, mapKey, unitId }));
    },
    isOwn(unitId) {
      return units.get(unitId)?.own === true;
    },
    retry() {
      if (stopped) return;
      failures = 0;
      authReconnected = false;
      notFoundRetried = false;
      if (terrain.kind === "failed" && terrainUrl !== null) {
        const url = terrainUrl;
        terrainUrl = null;
        if (terrain.reason === "not_found") {
          // 새 스냅샷이 지금 주소를 알려 준다
          resubscribe("terrain");
          return;
        }
        ensureTerrain(url);
      }
      if (phase.kind === "failed" || phase.kind === "retrying") subscribe();
    },
    refresh() {
      if (stopped) return;
      failures = 0;
      resubscribe("refresh");
    },
    devSpawn(count) {
      if (stopped || !link.isReady()) return false;
      const id = nextId();
      if (!link.send({ t: "dev_spawn_units", id, mapKey, count })) return false;
      devSpawns.set(
        id,
        setTimeout(() => {
          devSpawns.delete(id);
          options.onDevSpawn?.({ ok: false, code: "no_reply" });
        }, COMMAND_TIMEOUT_MS),
      );
      return true;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      unlisten();
      clearRetry();
      clearSnapshotTimer();
      for (const command of pending.values()) clearTimeout(command.timer);
      pending.clear();
      for (const timer of devSpawns.values()) clearTimeout(timer);
      devSpawns.clear();
      if (subscribedOnLink && link.isReady()) link.send({ t: "unsubscribe", id: nextId(), mapKey });
      subscribedOnLink = false;
    },
  };
}

/** 켜진 비트 수(탐사 칸 128바이트) */
function countBits(bits: Uint8Array): number {
  let count = 0;
  for (const byte of bits) {
    let value = byte;
    while (value !== 0) {
      count += value & 1;
      value >>= 1;
    }
  }
  return count;
}
