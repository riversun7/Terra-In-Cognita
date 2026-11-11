// 마크 그림 캔버스 일 — 고른 파일 읽기, 자른 정사각 그리기, 256 × 256 PNG 만들기(바이트 상한을 넘으면 색 단계를 줄인다).
// 시작 국가 설정 편집기와 플레이어 세력 정체성 화면이 같이 쓴다. 새 의존성 없음(canvas).
// 원본 파일은 기기를 떠나지 않는다: 캔버스에 다시 그린 PNG만 올린다(EXIF·위치 정보 같은 원본의 덧붙임 자료가 따라가지 않는다).
// 캔버스가 붙인 덧붙임 청크(브라우저마다 다르다)도 허용 목록 밖이면 덜어 낸다(서버는 목록 밖 청크가 있으면 거절한다 —
// docs/adr/2026-11-11-faction-identity.md 3절).
import { FACTION_EMBLEM_CHUNKS } from "@terra/shared/factionIdentity";
import { stripPngChunks } from "@terra/shared/pngChunks";
import {
  type CropState,
  EMBLEM_MAX_BYTES,
  EMBLEM_SIZE,
  POSTERIZE_STEPS,
  cropRect,
  posterize,
} from "./emblemCrop.ts";

/** 고른 파일을 그림으로 읽는다(못 읽으면 null). 주소는 부르는 쪽이 푼다 */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image.naturalWidth > 0 ? image : null));
    image.addEventListener("error", () => resolve(null));
    image.src = url;
  });
}

/** 자른 정사각을 캔버스(한 변 size px)에 그린다 */
export function drawCrop(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement,
  crop: CropState,
  size: number,
): void {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const rect = cropRect(image.naturalWidth, image.naturalHeight, crop);
  context.clearRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, size, size);
}

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK)
    text += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(text);
}

/** 자른 정사각을 256 × 256 PNG 바이트로. 상한을 넘으면 색 단계를 줄여 본다. 끝까지 넘으면 null */
export async function encodeEmblemBytes(
  image: HTMLImageElement,
  crop: CropState,
): Promise<Uint8Array | null> {
  const canvas = document.createElement("canvas");
  canvas.width = EMBLEM_SIZE;
  canvas.height = EMBLEM_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  for (const levels of POSTERIZE_STEPS) {
    drawCrop(canvas, image, crop, EMBLEM_SIZE);
    if (levels > 0) {
      const pixels = context.getImageData(0, 0, EMBLEM_SIZE, EMBLEM_SIZE);
      posterize(pixels.data, levels);
      context.putImageData(pixels, 0, 0);
    }
    const blob = await toBlob(canvas);
    if (!blob) return null;
    const raw = new Uint8Array(await blob.arrayBuffer());
    const bytes = stripPngChunks(raw, FACTION_EMBLEM_CHUNKS);
    if (bytes && bytes.length <= EMBLEM_MAX_BYTES) return bytes;
  }
  return null;
}

/** 위와 같되 base64 글로(tRPC JSON에 싣는다) */
export async function encodeEmblem(image: HTMLImageElement, crop: CropState): Promise<string | null> {
  const bytes = await encodeEmblemBytes(image, crop);
  return bytes ? bytesToBase64(bytes) : null;
}
