// [시험용] 2차맵 프레임 기록 — 주소에 ?map-probe=1을 붙이면 엔진이 그리는 프레임마다 한 줄씩 적어 window.terraMapProbe에 둔다.
// 옆 2차맵으로 넘는 순간에 무엇이 끊겨 보이는지 재려고 만들었다(사용자 지적 2026-11-11 "미세한 화면전환의 흔적",
// docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)"). 화면 시험(e2e/seamless.spec.ts)이 읽는다.
// 붙이지 않으면 아무것도 하지 않는다(층도 달지 않는다). 엔진은 화면에 하나라 2차맵을 넘어도 계속 적는다.
import type { SecondMapEngine } from "@terra/engine";

export const MAP_PROBE_PARAM = "map-probe";
/** 적는 줄 수 상한(넘으면 앞에서 버린다) — 60fps로 약 5분 */
const MAX_SAMPLES = 18_000;

/** 프레임 한 줄 */
export interface MapProbeSample {
  /** 그린 시각(performance.now, ms) */
  readonly t: number;
  /** 지금 2차맵 */
  readonly mapKey: number;
  /** 엔진 유닛 수, 고른 유닛 */
  readonly units: number;
  readonly selected: number | null;
  /** 확대 단계(1~5)와 카메라 거리(m) */
  readonly stage: number;
  readonly distance: number;
  /** 기준 유닛(없거나 엔진이 모르면 null)의 화면 자리(CSS px)와 2차맵 안 자리(배치 칸) */
  readonly anchor: number | null;
  readonly sx: number | null;
  readonly sy: number | null;
  readonly ax: number | null;
  readonly ay: number | null;
  /** 세운 소품 모델 수, 그린 이웃 2차맵 수 */
  readonly props: number;
  readonly neighbours: number;
  /** 지도 위 안내(.map-notice) 수 */
  readonly notices: number;
  /** HUD 글(안내 줄 첫 줄 | 내 유닛 단추 | 확대 사다리) — 넘는 순간 바뀌는지 본다 */
  readonly hud: string;
}

export interface MapProbe {
  readonly samples: MapProbeSample[];
  /** 화면 프레임(requestAnimationFrame) 시각 — 엔진이 그리지 않은 프레임도 든다(긴 프레임 찾기) */
  readonly frames: number[];
  clear(): void;
}

declare global {
  interface Window {
    terraMapProbe?: MapProbe;
  }
}

/** 주소 검색 문자열에 ?map-probe=1이 있나 */
export function wantsMapProbe(search: string): boolean {
  return new URLSearchParams(search).get(MAP_PROBE_PARAM) === "1";
}

const textOf = (selector: string): string => document.querySelector(selector)?.textContent?.trim() ?? "";

/** 엔진에 기록 층을 단다. 떼는 함수를 돌려준다 */
export function attachMapProbe(
  engine: SecondMapEngine,
  sources: { readonly mapKey: () => number; readonly anchor: () => number | null },
): () => void {
  const samples: MapProbeSample[] = [];
  const frames: number[] = [];
  const probe: MapProbe = {
    samples,
    frames,
    clear: () => {
      samples.length = 0;
      frames.length = 0;
    },
  };
  window.terraMapProbe = probe;
  let stopped = false;
  const tick = (time: number): void => {
    if (stopped) return;
    frames.push(time);
    if (frames.length > MAX_SAMPLES) frames.splice(0, frames.length - MAX_SAMPLES);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const detach = engine.addLayer({
    after: (view) => {
      const stats = engine.stats();
      const anchor = sources.anchor();
      const unit = anchor === null ? null : engine.unitState(anchor);
      const at = unit ? view.project(unit.x, unit.y, 0) : null;
      samples.push({
        t: performance.now(),
        mapKey: sources.mapKey(),
        units: stats.units,
        selected: engine.selected(),
        stage: stats.zoomStage,
        distance: engine.camera().distance,
        anchor,
        sx: at?.x ?? null,
        sy: at?.y ?? null,
        ax: unit?.x ?? null,
        ay: unit?.y ?? null,
        props: stats.props,
        neighbours: stats.neighbours,
        notices: document.querySelectorAll(".map-notice").length,
        hud: `${textOf(".map-hint p")}|${textOf(".map-units-toggle")}|${textOf(".zoom-ladder")}`,
      });
      if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    },
  });
  return () => {
    stopped = true;
    detach();
    if (window.terraMapProbe === probe) delete window.terraMapProbe;
  };
}
