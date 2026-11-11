// 캐릭터 미리 보기 엔진 조각(@terra/engine/characterPreview, three) 받기 — 만들기 화면의 3D 미리 보기·프리셋 썸네일과 사이보그 초상
// (portrait.ts)이 함께 쓴다. docs/adr/2026-11-11-character-3d.md 3절·"바뀜 (2026-11-12, 초상)".
// 이 파일은 작아서 위 띠 얼굴 조각(TopBarFace)에 들어가도 된다: 엔진은 동적 import()라 첫 화면 묶음에 들지 않는다.
export type PreviewEngine = typeof import("@terra/engine/characterPreview");

let enginePromise: Promise<PreviewEngine> | null = null;

/** 미리 보기 엔진 조각을 받는다(한 번만). 실패하면 다음에 다시 받는다 */
export function loadPreviewEngine(): Promise<PreviewEngine> {
  enginePromise ??= import("@terra/engine/characterPreview").catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}
