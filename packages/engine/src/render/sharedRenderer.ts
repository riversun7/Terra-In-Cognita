// 렌더러 하나를 앱 전체에서 다시 쓴다(PLAN 5.7 "렌더러 1개 재사용"). 화면을 닫으면 캔버스를 떼고 그리기 버퍼를 1×1로 줄인다.
// 이유: iOS 사파리는 WebGL 컨텍스트를 거듭 만들고 버리면 메모리가 늘어난다(조사 docs/research/2026-10-28-independent-review.md).
// 화면이 쓴 지오메트리·재질은 그 화면이 닫을 때 모두 버린다(secondMapEngine.ts). 렌더러만 남는다.
// 색: 색 관리(ColorManagement)를 끈다 — 적은 색(0xRRGGBB)이 그대로 보인다. 장난감 톤을 맞추기 쉽고 계산이 단순하다.
import { ColorManagement, LinearSRGBColorSpace, WebGLRenderer } from "three";

ColorManagement.enabled = false;

let shared: WebGLRenderer | null = null;
let owner: object | null = null;

/** 휴대폰이면 1.5, 그 밖에는 2 — 픽셀 비율 상한(PLAN 5.7 "1.5~2") */
export function defaultMaxPixelRatio(): number {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const shortSide = typeof screen === "undefined" ? 1024 : Math.min(screen.width, screen.height);
  return coarse && shortSide <= 600 ? 1.5 : 2;
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
