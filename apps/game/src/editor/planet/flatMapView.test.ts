// 평면 미니맵 크기·보임 상태 시험 — 숨기면 칠하기를 멈추고, 크기를 끄는 동안은 멈춘 뒤 한 번만 새 크기로
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLAT_MAP_RESIZE_SETTLE_MS,
  type FlatMapView,
  createFlatMapViewTracker,
  nextFlatMapView,
} from "./flatMapView.ts";

/** 휴대폰 흉내(CSS 폭 358px, 픽셀 비율 상한 1.5)의 그림 버퍼 폭 538 */
const shown: FlatMapView = { backingWidth: 538, visible: true };
const hidden: FlatMapView = { backingWidth: 538, visible: false };

describe("평면 미니맵 상태 정하기(nextFlatMapView)", () => {
  it("처음 잰 값: 폭이 있으면 바로, 폭 0(처음부터 숨긴 판)·숫자가 아님은 그대로", () => {
    expect(nextFlatMapView(null, 358, 1.5)).toEqual({ when: "now", view: shown });
    expect(nextFlatMapView(null, 0, 1.5)).toEqual({ when: "keep" });
    expect(nextFlatMapView(null, Number.NaN, 1.5)).toEqual({ when: "keep" });
  });

  it("보이던 판을 숨기면 바로 visible = false(그림 버퍼 폭은 그대로), 숨긴 채 다시 재면 그대로", () => {
    expect(nextFlatMapView(shown, 0, 1.5)).toEqual({ when: "now", view: hidden });
    expect(nextFlatMapView(hidden, 0, 1.5)).toEqual({ when: "keep" });
  });

  it("숨겼다가 보이면 바로: 같은 폭이든 새 폭이든", () => {
    expect(nextFlatMapView(hidden, 358, 1.5)).toEqual({ when: "now", view: shown });
    expect(nextFlatMapView(hidden, 480, 1.5)).toEqual({
      when: "now",
      view: { backingWidth: 720, visible: true },
    });
  });

  it("보이는 중에 그림 버퍼 폭이 바뀌면 멈춘 뒤, 버퍼 폭이 같으면(CSS 1px 차이 등) 그대로", () => {
    expect(nextFlatMapView(shown, 480, 1.5)).toEqual({
      when: "settle",
      view: { backingWidth: 720, visible: true },
    });
    // 359 × 1.5 = 538.5 → 짝수 538
    expect(nextFlatMapView(shown, 359, 1.5)).toEqual({ when: "keep" });
    // 확대(픽셀 비율이 바뀜)도 크기 바뀜이다
    expect(nextFlatMapView(shown, 358, 2)).toEqual({
      when: "settle",
      view: { backingWidth: 716, visible: true },
    });
  });
});

/** 가짜 시계로 추적기를 만든다(알린 상태를 차례로 모은다) */
function track() {
  vi.useFakeTimers();
  const commits: FlatMapView[] = [];
  const tracker = createFlatMapViewTracker((view) => commits.push(view));
  return { commits, tracker };
}

describe("평면 미니맵 상태 추적(createFlatMapViewTracker)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("크기를 끄는 동안(프레임마다 2px씩 240 → 358px)은 알리지 않고, 멈춘 뒤 마지막 크기로 한 번 알린다", () => {
    const { commits, tracker } = track();
    tracker.measure(240, 1.5);
    expect(commits).toEqual([{ backingWidth: 360, visible: true }]);
    for (let width = 242; width <= 358; width += 2) {
      tracker.measure(width, 1.5);
      vi.advanceTimersByTime(16);
    }
    expect(commits).toHaveLength(1);
    vi.advanceTimersByTime(FLAT_MAP_RESIZE_SETTLE_MS);
    expect(commits).toEqual([{ backingWidth: 360, visible: true }, shown]);
    vi.advanceTimersByTime(10 * FLAT_MAP_RESIZE_SETTLE_MS);
    expect(commits).toHaveLength(2);
    tracker.dispose();
  });

  it("멈추기 전에 원래 크기로 돌아오면 기다리던 바꿈을 버린다", () => {
    const { commits, tracker } = track();
    tracker.measure(358, 1.5);
    tracker.measure(480, 1.5);
    vi.advanceTimersByTime(FLAT_MAP_RESIZE_SETTLE_MS - 1);
    tracker.measure(358, 1.5);
    vi.advanceTimersByTime(10 * FLAT_MAP_RESIZE_SETTLE_MS);
    expect(commits).toEqual([shown]);
  });

  it("기다리는 중에 숨기면 바로 숨김(기다리던 바꿈은 버린다), 다시 보이면 바로 새 크기", () => {
    const { commits, tracker } = track();
    tracker.measure(358, 1.5);
    tracker.measure(480, 1.5);
    tracker.measure(0, 1.5);
    expect(commits).toEqual([shown, hidden]);
    vi.advanceTimersByTime(10 * FLAT_MAP_RESIZE_SETTLE_MS);
    expect(commits).toEqual([shown, hidden]);
    tracker.measure(480, 1.5);
    expect(commits).toEqual([shown, hidden, { backingWidth: 720, visible: true }]);
  });

  it("처음부터 숨긴 판은 보일 때까지 알리지 않는다", () => {
    const { commits, tracker } = track();
    tracker.measure(0, 1.5);
    tracker.measure(0, 1.5);
    expect(commits).toEqual([]);
    tracker.measure(358, 1.5);
    expect(commits).toEqual([shown]);
  });

  it("닫은(dispose) 뒤에는 기다리던 바꿈을 알리지 않는다", () => {
    const { commits, tracker } = track();
    tracker.measure(358, 1.5);
    tracker.measure(480, 1.5);
    tracker.dispose();
    vi.advanceTimersByTime(10 * FLAT_MAP_RESIZE_SETTLE_MS);
    expect(commits).toEqual([shown]);
  });
});
