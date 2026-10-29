// 렌더러 하나를 앱 전체에서 다시 쓴다(PLAN 5.7 "렌더러 1개 재사용"). 화면을 닫으면 캔버스를 떼고 그리기 버퍼를 1×1로 줄인다.
// 이유: iOS 사파리는 WebGL 컨텍스트를 거듭 만들고 버리면 메모리가 늘어난다(조사 docs/research/2026-10-28-independent-review.md).
// 화면이 쓴 지오메트리·재질은 그 화면이 닫을 때 모두 버린다(secondMapEngine.ts). 렌더러만 남는다.
// 색: 색 관리(ColorManagement)를 끈다 — 적은 색(0xRRGGBB)이 그대로 보인다. 장난감 톤을 맞추기 쉽고 계산이 단순하다.
import { ColorManagement, LinearSRGBColorSpace, WebGLRenderer } from "three";

ColorManagement.enabled = false;

let shared: WebGLRenderer | null = null;
let owner: object | null = null;

/** 픽셀 비율 상한 — 휴대폰도 2(PLAN 5.7 "1.5~2"의 위쪽). 화면은 ?pixel-ratio=<1~4>로 시험 삼아 바꿀 수 있다 */
export const DEFAULT_MAX_PIXEL_RATIO = 2;

/**
 * 두 지도(1차맵·2차맵) 엔진의 기본 픽셀 비율 상한. 실제 값은 min(기기 픽셀 비율, 상한)이다.
 * 2026-10-29까지 휴대폰(거친 포인터 + 짧은 변 600px 이하)은 1.5였다. 픽셀 비율 3.5 휴대폰에서 2.3배로 늘여 보여
 * 뿌옇다는 의견에 2로 올렸다(ADR 2026-10-28-s1-second-map "2차맵 선명도"). 2를 넘기는 것은 휴대폰 측정 뒤 정한다.
 */
export function defaultMaxPixelRatio(): number {
  return DEFAULT_MAX_PIXEL_RATIO;
}

/**
 * 렌더러를 빌린다. 처음이거나 전 것이 컨텍스트를 잃은 채면 새로 만든다(WebGL을 못 쓰면 예외).
 * 빌린 쪽(owner)이 releaseRenderer로 돌려준다. 다른 쪽이 빌려 가면 앞 쪽의 캔버스는 떼어진다.
 */
export function acquireRenderer(nextOwner: object): WebGLRenderer {
  if (shared?.getContext().isContextLost()) {
    shared.dispose();
    shared = null;
  }
  if (!shared) {
    shared = new WebGLRenderer({
      antialias: true,
      alpha: false,
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
      powerPreference: "default",
    });
    shared.outputColorSpace = LinearSRGBColorSpace;
    // 캔버스 위 손가락 동작은 엔진이 맡는다(브라우저 확대·스크롤 금지)
    shared.domElement.style.touchAction = "none";
    shared.domElement.style.display = "block";
  }
  owner = nextOwner;
  return shared;
}

/** 돌려준다: 캔버스를 떼고 그리기 버퍼를 줄인다. 렌더러(컨텍스트)는 다음 화면을 위해 남긴다 */
export function releaseRenderer(previousOwner: object): void {
  if (!shared || owner !== previousOwner) return;
  owner = null;
  shared.domElement.remove();
  shared.renderLists.dispose();
  shared.setSize(1, 1, false);
}

/** 렌더러까지 버린다(시험·앱 종료용) */
export function disposeSharedRenderer(): void {
  if (!shared) return;
  shared.domElement.remove();
  shared.dispose();
  shared.forceContextLoss();
  shared = null;
  owner = null;
}
