// NPC 판단 예약 이어 하기 — docs/adr/2026-11-01-npc-brain-r5.md "바뀜 (2026-11-21): 판단 예약 저장"
// 시뮬(@terra/sim scheduleDecide)은 한 번 켜고 끝까지 돌아서 다음 판단을 늘 "지금 + 간격 ±25%"(설정 칸 d323_decide_every, 6시간이면
// 4.5~7.5시간 뒤)에 건다. 서버가 켤 때마다 모든 세력을 그렇게 걸면, 배포가 그보다 자주 있을 때(NAS 1~2시간마다) 판단이 한 번도 오지 않는다
// (2026-11-21 NAS 1분 지표 npcDecisions 0). 그래서 서버는:
// - 걸린 다음 판단 시각을 세력 행(factions.next_decide_ms)에 저장하고(감싼 루프가 판단 예약을 적어 둔다 → persist.ts가 세력 행과 같이 쓴다),
// - 켤 때 그 시각으로 다시 건다. 지난 시각이면 켠 뒤 짧은 창(CATCH_UP_MS) 안에 세력마다 시드로 흩어 건다(한 틱에 몰리지 않게).
// - 저장된 시각이 없으면(이 판 처음 배포·옛 행) 켠 뒤 [0, 간격) 안의 시드 고른 점에 건다(기다림 기대값 = 간격의 절반).
// 시뮬의 scheduleDecide·판단 난수는 그대로다(시뮬 바이트 같음). 켤 때 첫 예약만 서버가 따로 고른다.
import {
  EVENT_DECIDE,
  type NpcContext,
  type SimEvent,
  type SimFaction,
  type SimLoop,
  streamRng,
} from "@terra/sim";

/** 서버 전용 난수 흐름(시뮬 흐름 1~10과 겹치지 않게): 켤 때 첫 판단 시각 */
export const STREAM_DECIDE_RESUME = 101;
/** 지난 판단을 켠 뒤 흩어 거는 창(ms) */
export const CATCH_UP_MS = 180_000;

export interface DecideClock {
  /** 판단 예약을 적어 두는 감싼 루프(NpcContext.loop로 쓴다 — 다른 예약은 그대로 넘긴다) */
  wrap(loop: SimLoop<SimEvent>): SimLoop<SimEvent>;
  /** 그 세력에 지금 걸린 다음 판단 시각(없으면 null) */
  readonly nextOf: (faction: SimFaction) => number | null;
  /** 가장 이른 다음 판단까지 남은 분(소수 한 자리, 걸린 판단이 없으면 −1) — 1분 지표 npcNextDecideMin */
  minutesUntilNext(factions: Iterable<SimFaction>, nowMs: number): number;
}

export function createDecideClock(): DecideClock {
  /** 세력 → 마지막으로 건 판단(예약 번호·시각). 세력의 eventId가 그 번호일 때만 아직 걸려 있다 */
  const booked = new Map<number, { eventId: number; atMs: number }>();
  const nextOf = (faction: SimFaction): number | null => {
    const entry = booked.get(faction.id);
    return entry && faction.eventId === entry.eventId ? entry.atMs : null;
  };
  return {
    wrap(loop) {
      return {
        get nowMs() {
          return loop.nowMs;
        },
        get processed() {
          return loop.processed;
        },
        get pending() {
          return loop.pending;
        },
        schedule(timeMs, payload) {
          const eventId = loop.schedule(timeMs, payload);
          if (payload.kind === EVENT_DECIDE) booked.set(payload.subject, { eventId, atMs: timeMs });
          return eventId;
        },
        cancel: (id) => loop.cancel(id),
        runUntil: (untilMs) => loop.runUntil(untilMs),
      };
    },
    nextOf,
    minutesUntilNext(factions, nowMs) {
      let earliest: number | null = null;
      for (const faction of factions) {
        const at = faction.alive ? nextOf(faction) : null;
        if (at !== null && (earliest === null || at < earliest)) earliest = at;
      }
      return earliest === null ? -1 : Math.round(Math.max(0, earliest - nowMs) / 6000) / 10;
    },
  };
}

/**
 * 켤 때 그 세력의 첫 판단 시각. stored = 저장된 다음 판단 시각(없으면 null).
 * - 지금 이후이고 한 번 거는 최대 지연(간격 + 1/4) 안이면 그대로
 * - 지났으면 지금 + [0, CATCH_UP_MS)
 * - 없거나 너무 멀면(간격 설정이 줄었을 때) 지금 + [0, 간격)
 */
export function resumeDecideAt(o: {
  readonly seed: number;
  readonly faction: Pick<SimFaction, "id" | "aiStep">;
  readonly stored: number | null;
  readonly startMs: number;
  readonly everyMs: number;
}): number {
  const { stored, startMs, everyMs } = o;
  const rng = streamRng(o.seed, STREAM_DECIDE_RESUME, o.faction.id, o.faction.aiStep);
  const maxDelay = everyMs + Math.floor(everyMs / 4);
  if (stored !== null && stored >= startMs && stored <= startMs + maxDelay) return stored;
  if (stored !== null && stored < startMs) return startMs + rng.nextInt(CATCH_UP_MS);
  return startMs + rng.nextInt(Math.max(1, everyMs));
}

/** 켤 때 살아 있는 세력마다 첫 판단을 건다(runtime.ts). storedOf = 세력(소유 주체 ID) → 저장된 다음 판단 시각 */
export function resumeDecides(
  ctx: NpcContext,
  rows: readonly { readonly ownerId: number; readonly nextDecideMs: number | null }[],
  startMs: number,
): void {
  const stored = new Map(rows.map((row) => [row.ownerId, row.nextDecideMs]));
  for (const faction of ctx.world.factions.values()) {
    if (!faction.alive) continue;
    const at = resumeDecideAt({
      seed: ctx.world.seed,
      faction,
      stored: stored.get(faction.id) ?? null,
      startMs,
      everyMs: ctx.decideEveryMs,
    });
    faction.eventId = ctx.loop.schedule(at, { kind: EVENT_DECIDE, subject: faction.id });
  }
}
