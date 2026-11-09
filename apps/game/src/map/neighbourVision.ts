// 이웃 2차맵 안개 받기 — docs/adr/2026-11-08-seamless-second-map.md WP-3(사용자 지적 2026-11-08 "인접한 맵은 포그가 적용되지 않는 문제").
// 기준 유닛(카메라)이 변에 다가가 그려지는 이웃 2차맵(많아야 3장 — secondMapNeighbourLoader의 방향)을 같은 연결로 구독하고, 그 2차맵의 vision(탐사 칸)을
// 엔진 이웃 안개로 넘긴다. 서버 규칙(구독 = 볼 수 있는 2차맵만, world/vision.ts canView)을 그대로 쓴다:
// - 구독이 거절되면(not_visible·unknown_map 등) 탐사 칸이 없는 것과 같다 → 온통 어둡게(null).
// - 서버가 바쁘면(rate_limited·busy·internal_error) 잠시 뒤 다시.
// - 더 바라지 않는 이웃은 구독을 푼다. 받은 탐사 칸은 엔진에 그대로 둔다(탐사 기록은 늘기만 한다).
// - 연결이 다시 맺어지면 바라는 이웃을 다시 구독한다.
// 지금 2차맵 + 이웃 3장 = 4장 — 서버 한 연결 상한(gateway.ts MAX_MAPS_PER_SOCKET = 4) 안이다. 지도 자료(mapFeed.ts)는 다른 2차맵 메시지를 버린다.
// 이웃 스냅샷·경로의 유닛 ID는 onUnits로 알린다: 기준 유닛이 이웃에 나타나면 화면이 그 2차맵으로 넘어간다(로딩 없는 2차맵 이동).
// 이웃마다 모은 유닛 움직임(그 틀)은 onUnitSet으로 알린다: 화면이 지금 2차맵 틀로 옮겨 그린다(unitMerge.ts, 경계 너머 유닛 보기).
import type { ResultCode, UnitMotionWire } from "@terra/protocol";
import type { FeatureServerMessage, ServerLink } from "../net/serverLink.ts";
import { defaultRequestId } from "./mapFeed.ts";

/** 한 번에 구독하는 이웃 수(지금 2차맵 + 3 = 서버 상한 4) */
export const MAX_NEIGHBOUR_SUBSCRIPTIONS = 3;
/** 서버가 바쁠 때 다시 묻기까지(ms) */
const RETRY_MS = 5_000;
const RETRYABLE: ReadonlySet<ResultCode> = new Set(["rate_limited", "busy", "internal_error"]);

export interface NeighbourVisionOptions {
  readonly link: Pick<ServerLink, "send" | "isReady" | "listen">;
  /** 이웃 2차맵의 탐사 칸(시야 칸 32×32 비트). null = 볼 수 없음(온통 어둡게) */
  readonly onExplored: (mapKey: number, bits: Uint8Array | null) => void;
  /** 이웃 2차맵의 스냅샷 조각·경로에 실린 유닛 ID(그 2차맵에 있는 유닛) */
  readonly onUnits?: (mapKey: number, unitIds: readonly number[]) => void;
  /**
   * 이웃 2차맵에 지금 있는 유닛(그 틀의 움직임, 서버가 그 구독에 보낸 것 — 내 시야 안·내 유닛). changed = 경로만 바뀐 유닛(null이면 들고 남이
   * 있다·스냅샷). 구독을 풀면 빈 목록과 null
   */
  readonly onUnitSet?: (
    mapKey: number,
    units: ReadonlyMap<number, UnitMotionWire>,
    changed: readonly number[] | null,
  ) => void;
  readonly nextRequestId?: () => number;
}

export interface NeighbourVision {
  /** 구독할 이웃(앞에서 MAX_NEIGHBOUR_SUBSCRIPTIONS장까지). 빠진 것은 푼다 */
  want(mapKeys: readonly number[]): void;
  /** 모두 풀고 멈춘다 */
  stop(): void;
}

/** base64 탐사 칸 → 비트 */
export function decodeExplored(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function startNeighbourVision(options: NeighbourVisionOptions): NeighbourVision {
  const { link } = options;
  const nextId = options.nextRequestId ?? defaultRequestId;
  /** 바라는 이웃 → 기다리는 구독 요청 번호(보내지 않았거나 답을 받았으면 null) */
  const wanted = new Map<number, number | null>();
  const retries = new Map<number, ReturnType<typeof setTimeout>>();
  /** 이웃마다 유닛 움직임과 받는 중인 스냅샷 번호 */
  const unitSets = new Map<number, Map<number, UnitMotionWire>>();
  const snapshots = new Map<number, number>();
  let stopped = false;

  const clearRetry = (mapKey: number): void => {
    const timer = retries.get(mapKey);
    if (timer !== undefined) clearTimeout(timer);
    retries.delete(mapKey);
  };

  const subscribe = (mapKey: number): void => {
    clearRetry(mapKey);
    if (stopped || !wanted.has(mapKey) || !link.isReady()) return;
    const id = nextId();
    if (link.send({ t: "subscribe", id, mapKey })) wanted.set(mapKey, id);
  };

  const unsubscribe = (mapKey: number): void => {
    clearRetry(mapKey);
    wanted.delete(mapKey);
    snapshots.delete(mapKey);
    if (unitSets.delete(mapKey)) options.onUnitSet?.(mapKey, new Map(), null);
    if (link.isReady()) link.send({ t: "unsubscribe", id: nextId(), mapKey });
  };

  /** 스냅샷 조각·경로 묶음을 이웃 유닛 모음에 넣고 알린다 */
  const collectUnits = (
    message: Extract<FeatureServerMessage, { t: "map_snapshot" | "unit_paths" }>,
  ): void => {
    const key = message.mapKey;
    let set = unitSets.get(key);
    if (message.t === "map_snapshot") {
      // 새 스냅샷이면 처음부터(같은 번호의 다음 조각은 더한다)
      if (!set || snapshots.get(key) !== message.snapshotId) {
        set = new Map();
        unitSets.set(key, set);
        snapshots.set(key, message.snapshotId);
      }
      for (const unit of message.units) set.set(unit.id, unit);
      options.onUnitSet?.(key, set, null);
      return;
    }
    if (!set) {
      set = new Map();
      unitSets.set(key, set);
    }
    let joined = false;
    const changed: number[] = [];
    for (const unit of message.units) {
      if (!set.has(unit.id)) joined = true;
      set.set(unit.id, unit);
      changed.push(unit.id);
    }
    for (const id of message.hidden ?? []) if (set.delete(id)) joined = true;
    options.onUnitSet?.(key, set, joined ? null : changed);
  };

  const off = link.listen((event) => {
    if (stopped) return;
    if (event.kind === "ready") {
      for (const mapKey of wanted.keys()) subscribe(mapKey);
      return;
    }
    if (event.kind === "down") {
      for (const mapKey of wanted.keys()) wanted.set(mapKey, null);
      return;
    }
    const message = event.message;
    if (message.t === "vision") {
      if (wanted.has(message.mapKey)) options.onExplored(message.mapKey, decodeExplored(message.explored));
      return;
    }
    if ((message.t === "map_snapshot" || message.t === "unit_paths") && wanted.has(message.mapKey)) {
      if (message.units.length > 0)
        options.onUnits?.(
          message.mapKey,
          message.units.map((unit) => unit.id),
        );
      if (options.onUnitSet) collectUnits(message);
      return;
    }
    if (message.t !== "result" || message.ok) return;
    for (const [mapKey, id] of wanted) {
      if (id !== message.id) continue;
      wanted.set(mapKey, null);
      if (RETRYABLE.has(message.code)) {
        retries.set(
          mapKey,
          setTimeout(() => subscribe(mapKey), RETRY_MS),
        );
      } else {
        options.onExplored(mapKey, null);
      }
      return;
    }
  });

  return {
    want(mapKeys) {
      if (stopped) return;
      const next = new Set(mapKeys.slice(0, MAX_NEIGHBOUR_SUBSCRIPTIONS));
      for (const mapKey of wanted.keys()) if (!next.has(mapKey)) unsubscribe(mapKey);
      for (const mapKey of next) {
        if (wanted.has(mapKey)) continue;
        wanted.set(mapKey, null);
        subscribe(mapKey);
      }
    },
    stop() {
      if (stopped) return;
      for (const mapKey of wanted.keys()) unsubscribe(mapKey);
      stopped = true;
      off();
    },
  };
}
