// 정찰 끝 알림(접속 중이면 화면 알림) — 기획 답 612 나("정찰이 목표를 보고 돌아설 때 알림 — [들어가기]"), docs/adr/2026-11-07-play-flow.md "WP13 이동 3".
// 순수 도우미(시험 대상, scoutNotice.test.ts): 내 길 목록(tRPC world.travels)에서 돌아선 정찰을 고르고, 이미 알린 길은 빼고, 더 물을지 정한다.
// 처리할 일(scout_returned)은 서버가 같은 길 목록으로 만든다(travel/scoutInbox.ts). 이 알림은 그 위의 접속 중 알림이다.
import type { WorldTravel } from "@terra/shared/worldMap";

/** 알린 정찰 길 열쇠(기기 기억 — 같은 길을 두 번 알리지 않게) */
const STORAGE_KEY = "terra.scoutNotices";
/** 기억하는 열쇠 수 상한(오래된 것부터 버린다) */
const KEEP = 20;

export interface ScoutTurn {
  /** 길 열쇠(유닛·보낸 시각) */
  readonly key: string;
  readonly unitId: number;
  /** 본 2차맵 */
  readonly mapKey: number;
}

/** 돌아선 정찰(돌아오는 중·돌아옴·돌아오다 멈춤) */
export function scoutTurns(travels: readonly WorldTravel[]): ScoutTurn[] {
  return travels.flatMap((travel) =>
    travel.kind === "scout" && travel.scoutedMapKey !== null
      ? [{ key: `${travel.unitId}:${travel.startedAt}`, unitId: travel.unitId, mapKey: travel.scoutedMapKey }]
      : [],
  );
}

/** 아직 목표에 닿지 않은 정찰이 있나(있으면 계속 묻는다) */
export function scoutPending(travels: readonly WorldTravel[]): boolean {
  return travels.some((travel) => travel.kind === "scout" && travel.state === "going" && !travel.returning);
}

/** 알린 열쇠(읽지 못하면 빈 목록) */
export function readSeenScouts(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/** 알린 열쇠를 더해 기억한다(쓰지 못하면 조용히 넘긴다 — 다음 접속에 한 번 더 알릴 수 있다) */
export function rememberScout(seen: readonly string[], key: string): string[] {
  const next = [...seen.filter((entry) => entry !== key), key].slice(-KEEP);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장소가 막혀 있다
  }
  return next;
}
