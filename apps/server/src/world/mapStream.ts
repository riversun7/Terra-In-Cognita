// 2차맵 하나의 전송 — 구독자에게 스냅샷을 주고, 그 뒤 바뀐 것만 보낸다 (ADR 33 "전송")
// - 유닛 움직임은 2차맵마다 BATCH_INTERVAL_MS 동안 모아(같은 유닛은 마지막 것만) 한 번 인코딩해 모두에게 보낸다.
//   모은 것이 메시지 상한에 가까워지면 바로 보낸다. 건물 놓기·치우기는 모아 둔 유닛을 먼저 보낸 뒤 바로 보낸다(rev 순서).
// - 느린 연결: 보내기 전 bufferedAmount가 MAX_BUFFERED_BYTES를 넘으면 그 연결에는 더 보내지 않고 "다시 맞춤"
//   표시를 한다. 버퍼가 RESYNC_BELOW_BYTES 밑으로 내려가면 새 스냅샷을 보낸다(오래된 갱신을 쌓지 않는다, ADR 7).
// - 스냅샷은 rev가 같으면 인코딩한 조각을 다시 쓴다(서버를 다시 켠 뒤 여럿이 한꺼번에 들어올 때).
import {
  type BuildingWire,
  MAX_MESSAGE_BYTES,
  type ServerMessageOf,
  type UnitMotionWire,
  utf8ByteLength,
} from "@terra/protocol";
import { type SizedEntry, checkedEncode, encodeSnapshot, unitPathsHeaderBytes } from "./wire.ts";

export const BATCH_INTERVAL_MS = 100;
export const MAX_BUFFERED_BYTES = 1024 * 1024;
export const RESYNC_BELOW_BYTES = 64 * 1024;
export const RESYNC_CHECK_MS = 500;

/** 구독자 하나(WebSocket 연결 하나) */
export interface StreamSubscriber {
  send(text: string): void;
  /** 아직 보내지 못하고 쌓인 바이트 */
  bufferedAmount(): number;
}

/** 스냅샷에 넣을 2차맵의 지금 상태 */
export interface StreamState {
  rev: number;
  units: readonly SizedEntry<UnitMotionWire>[];
  buildings: readonly SizedEntry<BuildingWire>[];
}

/** 전송 통계(지표 한 줄에 들어간다) */
export interface StreamStats {
  messages: number;
  bytes: number;
  maxBufferedBytes: number;
  /** 느려서 다시 맞춤 표시를 한 수 */
  slowMarked: number;
  /** 다시 맞춤으로 보낸 스냅샷 수 */
  resyncs: number;
  snapshots: number;
}

export function emptyStreamStats(): StreamStats {
  return { messages: 0, bytes: 0, maxBufferedBytes: 0, slowMarked: 0, resyncs: 0, snapshots: 0 };
}

export interface MapStreamOptions {
  mapKey: number;
  terrain: { url: string; generatorVersion: number };
  now: () => number;
  state: () => StreamState;
  stats: StreamStats;
}

export interface MapStream {
  subscribe(subscriber: StreamSubscriber): void;
  unsubscribe(subscriber: StreamSubscriber): void;
  has(subscriber: StreamSubscriber): boolean;
  readonly subscriberCount: number;
  /** 유닛 움직임이 바뀌었다(rev = 이 변화의 번호) */
  unitChanged(rev: number, entry: SizedEntry<UnitMotionWire>): void;
  buildingPlaced(rev: number, building: BuildingWire): void;
  buildingRemoved(rev: number, buildingId: number): void;
  /** 모아 둔 유닛 움직임을 지금 보낸다 */
  flush(): void;
  close(): void;
}

interface SubscriberState {
  needsResync: boolean;
}

export function createMapStream(options: MapStreamOptions): MapStream {
  const { mapKey, stats } = options;
  const subscribers = new Map<StreamSubscriber, SubscriberState>();
  const pathsHeader = unitPathsHeaderBytes(mapKey);
  const pending = new Map<number, SizedEntry<UnitMotionWire>>();
  let pendingFromRev = 0;
  let pendingRev = 0;
  let pendingBytes = 0;
  let batchTimer: ReturnType<typeof setTimeout> | undefined;
  let resyncTimer: ReturnType<typeof setInterval> | undefined;
  let snapshotId = 0;
  let cached: { rev: number; parts: string[] } | undefined;

  const sendTo = (subscriber: StreamSubscriber, text: string, bytes: number): void => {
    subscriber.send(text);
    stats.messages += 1;
    stats.bytes += bytes;
  };

  const sendSnapshot = (subscriber: StreamSubscriber): void => {
    const state = options.state();
    if (!cached || cached.rev !== state.rev) {
      snapshotId = (snapshotId % 0xffff_ffff) + 1;
      cached = {
        rev: state.rev,
        parts: encodeSnapshot({
          mapKey,
          snapshotId,
          rev: state.rev,
          serverTime: options.now(),
          terrain: options.terrain,
          units: state.units,
          buildings: state.buildings,
        }),
      };
    }
    for (const part of cached.parts) sendTo(subscriber, part, utf8ByteLength(part));
    stats.snapshots += 1;
  };

  /** 모두에게 보낸다. 느린 연결은 건너뛰고 다시 맞춤 표시 */
  const broadcast = (text: string): void => {
    const bytes = utf8ByteLength(text);
    for (const [subscriber, state] of subscribers) {
      if (state.needsResync) continue;
      const buffered = subscriber.bufferedAmount();
      if (buffered > stats.maxBufferedBytes) stats.maxBufferedBytes = buffered;
      if (buffered > MAX_BUFFERED_BYTES) {
        state.needsResync = true;
        stats.slowMarked += 1;
        ensureResyncTimer();
        continue;
      }
      sendTo(subscriber, text, bytes);
    }
  };

  const ensureResyncTimer = (): void => {
    if (resyncTimer) return;
    resyncTimer = setInterval(() => {
      let waiting = 0;
      for (const [subscriber, state] of subscribers) {
        if (!state.needsResync) continue;
        if (subscriber.bufferedAmount() < RESYNC_BELOW_BYTES) {
          state.needsResync = false;
          stats.resyncs += 1;
          sendSnapshot(subscriber);
        } else {
          waiting += 1;
        }
      }
      if (waiting === 0 && resyncTimer) {
        clearInterval(resyncTimer);
        resyncTimer = undefined;
      }
    }, RESYNC_CHECK_MS);
    resyncTimer.unref();
  };

  const flush = (): void => {
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = undefined;
    if (pending.size === 0) return;
    const message: ServerMessageOf<"unit_paths"> = {
      t: "unit_paths",
      mapKey,
      fromRev: pendingFromRev,
      rev: pendingRev,
      units: [...pending.values()].map((entry) => entry.value),
    };
    pending.clear();
    pendingBytes = 0;
    if (subscribers.size > 0) broadcast(checkedEncode(message));
  };

  return {
    subscribe(subscriber) {
      // 이미 구독 중이면 다시 맞춤 표시만 풀고 새 스냅샷을 준다(기기가 빠진 것을 알아챘을 때)
      subscribers.set(subscriber, { needsResync: false });
      sendSnapshot(subscriber);
    },
    unsubscribe(subscriber) {
      subscribers.delete(subscriber);
    },
    has: (subscriber) => subscribers.has(subscriber),
    get subscriberCount() {
      return subscribers.size;
    },
    unitChanged(rev, entry) {
      if (pending.size === 0) pendingFromRev = rev - 1;
      const previous = pending.get(entry.value.id);
      if (previous) pendingBytes -= previous.bytes + 1;
      pending.set(entry.value.id, entry);
      pendingBytes += entry.bytes + 1;
      pendingRev = rev;
      // 다음 항목이 상한을 넘길 수 있으면 지금 보낸다(가장 큰 항목도 들어갈 여유를 남긴다)
      if (pathsHeader + pendingBytes > MAX_MESSAGE_BYTES - 16 * 1024) {
        flush();
        return;
      }
      if (!batchTimer) {
        batchTimer = setTimeout(flush, BATCH_INTERVAL_MS);
        batchTimer.unref();
      }
    },
    buildingPlaced(rev, building) {
      flush();
      if (subscribers.size > 0) broadcast(checkedEncode({ t: "building_placed", mapKey, rev, building }));
    },
    buildingRemoved(rev, buildingId) {
      flush();
      if (subscribers.size > 0) broadcast(checkedEncode({ t: "building_removed", mapKey, rev, buildingId }));
    },
    flush,
    close() {
      if (batchTimer) clearTimeout(batchTimer);
      if (resyncTimer) clearInterval(resyncTimer);
      batchTimer = undefined;
      resyncTimer = undefined;
      subscribers.clear();
      pending.clear();
    },
  };
}
