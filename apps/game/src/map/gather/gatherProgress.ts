// 채집 진행바 계산 — 사용자 요청 2026-11-14 "채집시 진행바 ui표시".
// 서버가 캐는 중인 한 번의 시작(phaseAt)·끝(nextAt) 시각을 준다(GatherLoopView). 화면은 지금 몫과 남은 시간만 구해
// CSS 움직임(0 → 1 선형, 길이 = 전체 시간, 지연 = −지난 시간 → 지금 몫에서 시작)으로 막대를 채운다 — 프레임마다 다시 그리지 않는다(엔진 그리기를 깨우지 않게).
import type { GatherLoopView } from "@terra/shared/gather";

export interface DigProgress {
  /** 지금까지 찬 몫(0~1) */
  readonly fraction: number;
  /** 끝까지 남은 시간(ms, 0 이상) */
  readonly remainingMs: number;
  /** 이번 캐기 전체 시간(ms)과 지난 시간(ms) — CSS 움직임 길이와 음수 지연(지난 만큼 앞에서 시작) */
  readonly totalMs: number;
  readonly elapsedMs: number;
  /** 이번 캐기를 가리키는 표지(바뀌면 막대를 처음부터 다시 움직인다) */
  readonly key: string;
}

/** 캐는 중이면 이번 캐기의 진행, 아니면(걷는 중·넣는 중·시각 모름) null. now = 서버 시각(ms) */
export function digProgress(
  loop: Pick<GatherLoopView, "phase" | "phaseAt" | "nextAt">,
  now: number,
): DigProgress | null {
  const start = loop.phaseAt ?? null;
  const end = loop.nextAt;
  if (loop.phase !== "gathering" || start === null || end === null || end <= start) return null;
  const totalMs = end - start;
  const elapsedMs = Math.min(totalMs, Math.max(0, now - start));
  return {
    fraction: elapsedMs / totalMs,
    remainingMs: totalMs - elapsedMs,
    totalMs,
    elapsedMs,
    key: `${start}:${end}`,
  };
}

/** 화물 무게 몫(0~1, 상한이 0이면 0) */
export function cargoFraction(loop: Pick<GatherLoopView, "carriedGrams" | "capacityGrams">): number {
  if (loop.capacityGrams <= 0) return 0;
  return Math.min(1, Math.max(0, loop.carriedGrams / loop.capacityGrams));
}
