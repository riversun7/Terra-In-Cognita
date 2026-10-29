// 미리보기 관리자 — 워커 둘(빠른 줄·본 줄)을 가지고 일을 보내고, 결과를 기억하고, 화면에 요약(snapshot)을 준다.
// ADR 38 3·4절, 설계 D.3. 화면(React)과 상관없다: 화면은 subscribe·getSnapshot(useSyncExternalStore)으로 읽는다.
// - 워커는 만들기 함수(createWorker)로 받는다: 시험은 가짜를 넣고, 기본값은 브라우저 모듈 워커(planetEditorWorker.ts)다.
// - 열 때 순서: 빠른 줄 공개본 F5(확인과 첫 지구본) → 본 줄 초안 F7 → 본 줄 공개본 F7(차이 열·번갈아 보기).
// - 상한 = min(정의 면 레벨, 생성기 면 레벨 표 위쪽 값, 기기 상한). 값을 코드에 적지 않는다(previewJobs.ts previewLevels).
// - 결과 기억: 바이트 상한(처음 32MiB) LRU. 공개본 결과(빠른·본)와 지금 보이는 결과는 고정한다. F9 결과는 다음 본 결과가
//   오면 버린다. 열쇠 = 면 레벨 + 키를 정렬한 생성기 입력 JSON.
// - 화면 스레드가 하는 일은 생성기 입력 만들기·확인(planetInputFromDefinition + validatePlanetInput)뿐이다.
// - F8·F9 일은 시작 전에 꺼짐 감지 표시를 남기고(sentinel.begin) 끝나면 지운다(sentinel.end: 결과·실패·멈춤·버림).
// - 워커를 못 쓰면(만들 수 없음, 두 번 잇달아 답 없이 죽음) available = false: 미리보기를 만들지 않고 화면이 안내한다.
import { PLANET_GENERATOR_FACE_LEVELS } from "@terra/shared";
import {
  type PlanetGeneratorInput,
  planetInputFromDefinition,
  validatePlanetInput,
} from "@terra/planet/generator";
import { type PreviewCache, createPreviewCache } from "./previewCache.ts";
import {
  EMPTY_LANE,
  FINAL_POLICY,
  type LanePolicy,
  type LaneState,
  type LaneStep,
  type PreviewJob,
  type PreviewLane,
  type PreviewRole,
  QUICK_POLICY,
  cancelLane,
  clampFinalLevel,
  finishJob,
  noteStage,
  previewKey,
  previewLevels,
  retainWanted,
  submitJob,
} from "./previewJobs.ts";
import type { PreviewReply } from "./previewProtocol.ts";
import {
  type LaneView,
  type PreviewController,
  type PreviewControllerOptions,
  type PreviewDefinition,
  type PreviewEntry,
  type PreviewErrorCode,
  type PreviewSnapshot,
  type PreviewWorkerPort,
  type RoleStatus,
  type RoleView,
  createBrowserPreviewWorker,
} from "./previewTypes.ts";

/** 다음 본 결과가 오면 버리는 큰 결과의 레벨(F9 약 22MiB, 설계 D.3) */
export const EVICT_ON_NEXT_FINAL_LEVEL = 9;
/** 답 한 번 없이 잇달아 죽으면 워커를 못 쓰는 것으로 보는 횟수 */
const LOAD_FAILURES_UNAVAILABLE = 2;

/** 정의 → 생성기 입력(확인까지). 틀리면 RangeError(생성기 문장, 화면에 쓰지 않는다) */
export function previewInput(definition: PreviewDefinition, level: number): PlanetGeneratorInput {
  const input = planetInputFromDefinition(definition.entry, definition.biomes, level);
  validatePlanetInput(input);
  return input;
}

/** 정의의 면 레벨(정수가 아니면 생성기 상한: 그 정의는 입력 확인에서 rejected가 된다) */
function definitionFaceLevel(definition: PreviewDefinition): number {
  const value: unknown =
    typeof definition.entry === "object" && definition.entry !== null
      ? Reflect.get(definition.entry, "faceLevel")
      : undefined;
  return typeof value === "number" && Number.isInteger(value) ? value : PLANET_GENERATOR_FACE_LEVELS[1];
}

interface Slot {
  key: string | null;
  level: number | null;
  shown: PreviewEntry | null;
  error: PreviewErrorCode | null;
  cancelled: boolean;
}

interface LaneRuntime {
  readonly name: PreviewLane;
  readonly policy: LanePolicy;
  state: LaneState;
  worker: PreviewWorkerPort | null;
  /** 지금 워커를 알아보는 표(죽거나 끝낸 워커의 늦은 답을 버린다) */
  token: object | null;
  /** 지금 워커가 한 번이라도 답했는가 */
  replied: boolean;
  loadFailures: number;
  startedAt: number;
  sentinelActive: boolean;
}

const emptySlot = (): Slot => ({ key: null, level: null, shown: null, error: null, cancelled: false });

function laneRuntime(name: PreviewLane): LaneRuntime {
  return {
    name,
    policy: name === "quick" ? QUICK_POLICY : FINAL_POLICY,
    state: EMPTY_LANE,
    worker: null,
    token: null,
    replied: false,
    loadFailures: 0,
    startedAt: 0,
    sentinelActive: false,
  };
}

function laneView(lane: LaneRuntime): LaneView {
  const { running, pending, background } = lane.state;
  return {
    running: running
      ? {
          role: running.job.role,
          level: running.job.level,
          key: running.job.key,
          stage: running.stage,
          startedAt: lane.startedAt,
        }
      : null,
    waiting: (pending ? 1 : 0) + background.length,
  };
}

function inLane(lane: LaneRuntime, key: string): "running" | "queued" | null {
  const { running, pending, background } = lane.state;
  if (running?.job.key === key) return "running";
  if (pending?.key === key || background.some((job) => job.key === key)) return "queued";
  return null;
}

function roleView(slot: Slot, lane: LaneRuntime, cache: PreviewCache<PreviewEntry>): RoleView {
  const { key } = slot;
  const done = key === null ? undefined : cache.peek(key);
  const where = key === null ? null : inLane(lane, key);
  const entry = done ?? slot.shown;
  let status: RoleStatus = "idle";
  if (done) status = "ready";
  else if (slot.error) status = "failed";
  else if (where) status = where;
  else if (slot.cancelled) status = "cancelled";
  return {
    key,
    level: slot.level,
    status,
    entry,
    current: entry !== null && entry.key === key,
    error: slot.error,
  };
}

export function createPreviewController(options: PreviewControllerOptions = {}): PreviewController {
  const createWorker = options.createWorker ?? createBrowserPreviewWorker;
  const now = options.now ?? (() => performance.now());
  const { sentinel } = options;
  const cache = createPreviewCache<PreviewEntry>(options.cacheBytes);
  const listeners = new Set<() => void>();
  let deviceMaxLevel = options.deviceMaxLevel ?? null;
  let base: PreviewDefinition | null = null;
  let draft: PreviewDefinition | null = null;
  let levels = previewLevels(PLANET_GENERATOR_FACE_LEVELS[1], deviceMaxLevel);
  let finalLevel = levels.finalDefault;
  let available = true;
  let disposed = false;
  let nextId = 1;
  let sequence = 0;
  const slots: Record<PreviewRole, Record<PreviewLane, Slot>> = {
    base: { quick: emptySlot(), final: emptySlot() },
    draft: { quick: emptySlot(), final: emptySlot() },
  };
  const lanes: Record<PreviewLane, LaneRuntime> = {
    quick: laneRuntime("quick"),
    final: laneRuntime("final"),
  };
  const allSlots = (): Slot[] => [slots.base.quick, slots.base.final, slots.draft.quick, slots.draft.final];
  let snapshot = buildSnapshot();

  function buildSnapshot(): PreviewSnapshot {
    return {
      available,
      levels,
      finalLevel,
      base: {
        quick: roleView(slots.base.quick, lanes.quick, cache),
        final: roleView(slots.base.final, lanes.final, cache),
      },
      draft: {
        quick: roleView(slots.draft.quick, lanes.quick, cache),
        final: roleView(slots.draft.final, lanes.final, cache),
      },
      lanes: { quick: laneView(lanes.quick), final: laneView(lanes.final) },
      cacheBytes: cache.bytes(),
      cacheCapacity: cache.capacity,
    };
  }

  function notify(): void {
    if (disposed) return;
    snapshot = buildSnapshot();
    for (const listener of listeners) listener();
  }

  /** 청한 열쇠들 */
  function wantedKeys(): Set<string> {
    const keys = new Set<string>();
    for (const slot of allSlots()) if (slot.key !== null) keys.add(slot.key);
    return keys;
  }

  /** 돌릴 가치가 있는 일: 아직 청하고 있고 기억하지 않은 것 */
  function needed(job: PreviewJob): boolean {
    return wantedKeys().has(job.key) && !cache.has(job.key);
  }

  /** 고정: 공개본 결과(빠른·본) + 지금 보이는 결과 */
  function repin(): void {
    const keys: string[] = [];
    for (const slot of [slots.base.quick, slots.base.final]) if (slot.key !== null) keys.push(slot.key);
    for (const slot of allSlots()) if (slot.shown) keys.push(slot.shown.key);
    cache.pin(keys);
  }

  function endSentinel(lane: LaneRuntime): void {
    if (!lane.sentinelActive) return;
    lane.sentinelActive = false;
    sentinel?.end();
  }

  function dropWorker(lane: LaneRuntime): void {
    lane.worker?.terminate();
    lane.worker = null;
    lane.token = null;
    lane.replied = false;
    endSentinel(lane);
  }

  function ensureWorker(lane: LaneRuntime): PreviewWorkerPort | null {
    if (!available || disposed) return null;
    if (lane.worker) return lane.worker;
    const token = {};
    try {
      lane.worker = createWorker({
        onReply: (reply) => {
          if (lane.token === token) handleReply(lane, reply);
        },
        onCrash: () => {
          if (lane.token === token) handleCrash(lane);
        },
      });
    } catch {
      markUnavailable();
      return null;
    }
    lane.token = token;
    lane.replied = false;
    return lane.worker;
  }

  function post(lane: LaneRuntime, job: PreviewJob): void {
    const worker = ensureWorker(lane);
    if (!worker) return;
    lane.startedAt = now();
    if (lane.name === "final") {
      sentinel?.begin(job.level);
      lane.sentinelActive = true;
    }
    worker.post({ kind: "generate", id: job.id, key: job.key, input: job.input });
  }

  function apply(lane: LaneRuntime, step: LaneStep): void {
    lane.state = step.state;
    for (const command of step.commands) {
      if (command.kind === "restart") dropWorker(lane);
      const job = command.job;
      if (job) post(lane, job);
      if (!available) return;
    }
  }

  function markUnavailable(): void {
    available = false;
    for (const lane of [lanes.quick, lanes.final]) {
      dropWorker(lane);
      lane.state = EMPTY_LANE;
    }
    for (const slot of allSlots()) if (slot.key !== null && !cache.has(slot.key)) slot.error = "unavailable";
  }

  /** 열쇠를 청한 자리마다 실패를 적는다 */
  function failKey(key: string, code: PreviewErrorCode): void {
    for (const slot of allSlots()) if (slot.key === key) slot.error = code;
  }

  function handleReply(lane: LaneRuntime, reply: PreviewReply): void {
    lane.replied = true;
    lane.loadFailures = 0;
    if (reply.kind === "stage") {
      lane.state = noteStage(lane.state, reply.id, reply.stage, lane.policy);
      notify();
      return;
    }
    const running = lane.state.running;
    if (running?.job.id !== reply.id) return;
    endSentinel(lane);
    if (reply.kind === "result") {
      const level = reply.result.fields.meta.faceLevel;
      const entry: PreviewEntry = {
        key: reply.key,
        level,
        input: running.job.input,
        result: reply.result,
        elapsedMs: now() - lane.startedAt,
        sequence: ++sequence,
      };
      for (const slot of allSlots()) {
        if (slot.key !== reply.key) continue;
        slot.shown = entry;
        slot.error = null;
      }
      repin();
      cache.set(reply.key, entry, reply.result.outputBytes, level);
      if (lane.name === "final") cache.dropLevelsExcept(EVICT_ON_NEXT_FINAL_LEVEL, reply.key);
    } else {
      failKey(reply.key, reply.code);
    }
    apply(lane, finishJob(lane.state, reply.id, needed));
    notify();
  }

  function handleCrash(lane: LaneRuntime): void {
    const running = lane.state.running;
    if (!lane.replied) lane.loadFailures += 1;
    const failures = lane.loadFailures;
    dropWorker(lane);
    if (running) failKey(running.job.key, "crashed");
    if (failures >= LOAD_FAILURES_UNAVAILABLE) {
      markUnavailable();
    } else if (running) {
      apply(lane, finishJob(lane.state, running.job.id, needed));
    }
    notify();
  }

  /** 자리 하나에 정의·레벨을 청한다(기억한 결과가 있으면 바로 보이고, 없으면 줄에 넣는다) */
  function request(
    role: PreviewRole,
    laneName: PreviewLane,
    definition: PreviewDefinition,
    level: number,
  ): void {
    const slot = slots[role][laneName];
    const lane = lanes[laneName];
    let input: PlanetGeneratorInput;
    try {
      input = previewInput(definition, level);
    } catch {
      slot.key = null;
      slot.level = level;
      slot.error = "rejected";
      slot.cancelled = false;
      return;
    }
    const key = previewKey(input);
    slot.key = key;
    slot.level = level;
    slot.cancelled = false;
    slot.error = available ? null : "unavailable";
    const cached = cache.get(key);
    if (cached) slot.shown = cached;
    repin();
    if (!available) return;
    if (cached) {
      // 기억한 본 결과를 보이는 것도 "다음 본 결과"다: 보이지 않게 된 F9 결과를 버린다
      if (laneName === "final") cache.dropLevelsExcept(EVICT_ON_NEXT_FINAL_LEVEL, key);
      // 결과가 이미 있다: 원하지 않게 된 일은 뺀다(본 줄의 기후 전 초안 일은 워커를 끝낸다)
      apply(lane, retainWanted(lane.state, needed, lane.policy));
      return;
    }
    apply(lane, submitJob(lane.state, { id: nextId++, key, level, role, input }, lane.policy));
  }

  /** 본 줄 자리 둘을 지금 레벨로 다시 청한다(초안 먼저: 줄이 비어 있으면 초안 일이 먼저 돈다) */
  function requestFinal(): void {
    if (draft) request("draft", "final", draft, finalLevel);
    if (base) request("base", "final", base, finalLevel);
    if (available) apply(lanes.final, retainWanted(lanes.final.state, needed, lanes.final.policy));
  }

  return {
    open(nextBase, nextDraft) {
      if (disposed) return;
      base = nextBase;
      draft = nextDraft;
      levels = previewLevels(definitionFaceLevel(nextBase), deviceMaxLevel);
      finalLevel = levels.finalDefault;
      for (const slot of allSlots()) Object.assign(slot, emptySlot());
      request("base", "quick", nextBase, levels.quick);
      requestFinal();
      apply(lanes.quick, retainWanted(lanes.quick.state, needed, lanes.quick.policy));
      notify();
    },
    setDraft(nextDraft, lane) {
      if (disposed) return;
      draft = nextDraft;
      request("draft", lane, nextDraft, lane === "quick" ? levels.quick : finalLevel);
      notify();
    },
    setFinalLevel(level) {
      if (disposed) return;
      const next = clampFinalLevel(levels, level);
      // 같은 레벨이면 그대로 둔다(멈춘 뒤 같은 레벨을 다시 고르면 다시 청한다)
      const same = next === finalLevel && slots.draft.final.key !== null && !slots.draft.final.cancelled;
      if (same) return;
      finalLevel = next;
      requestFinal();
      notify();
    },
    setDeviceMaxLevel(level) {
      if (disposed) return;
      deviceMaxLevel = level;
      levels = previewLevels(base ? definitionFaceLevel(base) : PLANET_GENERATOR_FACE_LEVELS[1], level);
      const next = clampFinalLevel(levels, finalLevel);
      if (next !== finalLevel) {
        finalLevel = next;
        requestFinal();
      }
      notify();
    },
    cancelFinal() {
      if (disposed) return;
      const lane = lanes.final;
      apply(lane, cancelLane(lane.state));
      for (const slot of [slots.base.final, slots.draft.final]) {
        if (slot.key !== null && !cache.has(slot.key) && !slot.error) slot.cancelled = true;
      }
      notify();
    },
    lookup(definition, level) {
      try {
        return cache.peek(previewKey(previewInput(definition, level)));
      } catch {
        return undefined;
      }
    },
    checks(definition) {
      const [lowest, highest] = PLANET_GENERATOR_FACE_LEVELS;
      const result: { faceLevel: number; hash: string }[] = [];
      for (let level = lowest; level <= highest; level++) {
        let key: string;
        try {
          key = previewKey(previewInput(definition, level));
        } catch {
          return [];
        }
        const entry = cache.peek(key);
        if (entry) result.push({ faceLevel: level, hash: entry.result.fields.meta.hash });
      }
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    dispose() {
      if (disposed) return;
      for (const lane of [lanes.quick, lanes.final]) {
        dropWorker(lane);
        lane.state = EMPTY_LANE;
      }
      disposed = true;
      listeners.clear();
      cache.clear();
    },
  };
}
