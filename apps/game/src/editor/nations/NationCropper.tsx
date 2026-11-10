// 국가 마크 자르기 — 고른 그림에서 정사각을 골라(끌기·확대·화살표 키) 256 × 256 PNG로 만든다. docs/adr/2026-11-10-nation-editor.md 4절.
// - 보기 칸을 끌면 그림이 따라오고, 확대는 미닫이·휠·[+]/[−] 키. 화살표 키는 자를 자리를 그쪽으로 조금씩(Shift = 크게) 옮긴다.
// - 옆에 24·48·128px 미리 보기를 같이 그린다(실제로 쓰이는 크기).
// - [잘라서 올리기]: 캔버스에서 PNG를 만들고, 바이트 상한을 넘으면 색 단계를 줄여 다시 만든다(그래도 넘으면 알린다). 새 의존성 없음.
// 셈은 nationModel.ts(cropRect·dragCrop·zoomCrop·posterize)에 있다.
import { type KeyboardEvent, type PointerEvent, type WheelEvent, useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  CROP_ZOOM,
  type CropState,
  EMBLEM_MAX_BYTES,
  EMBLEM_SIZE,
  POSTERIZE_STEPS,
  cropRect,
  dragCrop,
  initialCrop,
  posterize,
  zoomCrop,
} from "./nationModel.ts";

/** 보기 칸 한 변(캔버스 px, 화면에서는 CSS로 줄어든다) */
const VIEW = 320;
const PREVIEWS = [24, 48, 128] as const;

function draw(
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

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK)
    text += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(text);
}

/** 자른 정사각을 256 × 256 PNG(base64)로. 상한을 넘으면 색 단계를 줄여 본다. 끝까지 넘으면 null */
export async function encodeEmblem(image: HTMLImageElement, crop: CropState): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = EMBLEM_SIZE;
  canvas.height = EMBLEM_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  for (const levels of POSTERIZE_STEPS) {
    draw(canvas, image, crop, EMBLEM_SIZE);
    if (levels > 0) {
      const pixels = context.getImageData(0, 0, EMBLEM_SIZE, EMBLEM_SIZE);
      posterize(pixels.data, levels);
      context.putImageData(pixels, 0, 0);
    }
    const blob = await toBlob(canvas);
    if (blob && blob.size <= EMBLEM_MAX_BYTES) return toBase64(blob);
  }
  return null;
}

export function NationCropper({
  image,
  busy,
  onCancel,
  onDone,
}: {
  /** 다 읽은 그림 */
  image: HTMLImageElement;
  busy: boolean;
  onCancel: () => void;
  /** 256 × 256 PNG(base64). 올리기가 끝나면 풀린다 */
  onDone: (pngBase64: string) => Promise<void>;
}) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const [crop, setCrop] = useState<CropState>(() => initialCrop(width, height));
  const [tooLarge, setTooLarge] = useState(false);
  const [working, setWorking] = useState(false);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const smallRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // 자르기 상태가 바뀔 때마다 보기 칸과 미리 보기를 다시 그린다
  useEffect(() => {
    draw(viewRef.current, image, crop, VIEW);
    PREVIEWS.forEach((size, index) => draw(smallRefs.current[index] ?? null, image, crop, size));
  }, [image, crop]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const last = dragRef.current;
    if (!last) return;
    const shown = event.currentTarget.getBoundingClientRect().width;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setCrop((now) => dragCrop(width, height, now, event.clientX - last.x, event.clientY - last.y, shown));
  };
  const onPointerUp = (): void => {
    dragRef.current = null;
  };
  const onWheel = (event: WheelEvent<HTMLCanvasElement>): void => {
    setCrop((now) => zoomCrop(width, height, now, now.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    // 화살표 키는 자를 자리를 그쪽으로 옮긴다(보기 칸 기준 8px, Shift = 40px). 끌기와 반대 방향 셈이다
    const step = event.shiftKey ? 40 : 8;
    const moves: Record<string, readonly [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCrop((now) => dragCrop(width, height, now, move[0], move[1], VIEW));
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setCrop((now) => zoomCrop(width, height, now, now.zoom + CROP_ZOOM.step * 2));
    } else if (event.key === "-") {
      event.preventDefault();
      setCrop((now) => zoomCrop(width, height, now, now.zoom - CROP_ZOOM.step * 2));
    }
  };

  const submit = async (): Promise<void> => {
    if (working || busy) return;
    setWorking(true);
    setTooLarge(false);
    try {
      const png = await encodeEmblem(image, crop);
      if (png === null) setTooLarge(true);
      else await onDone(png);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="ne-cropper" role="group" aria-label={m.dev_nations_crop_title()}>
      <h4 className="ne-cropper-title">{m.dev_nations_crop_title()}</h4>
      <div className="ne-cropper-body">
        <canvas
          ref={viewRef}
          className="ne-cropper-view"
          width={VIEW}
          height={VIEW}
          tabIndex={0}
          role="img"
          aria-label={m.dev_nations_crop_view()}
          data-zoom={crop.zoom.toFixed(2)}
          data-cx={Math.round(crop.cx)}
          data-cy={Math.round(crop.cy)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        />
        <div className="ne-cropper-side">
          <label className="field-label" htmlFor="ne-crop-zoom">
            {m.dev_nations_crop_zoom()}
          </label>
          <input
            id="ne-crop-zoom"
            className="ne-cropper-zoom"
            type="range"
            min={CROP_ZOOM.min}
            max={CROP_ZOOM.max}
            step={CROP_ZOOM.step}
            value={crop.zoom}
            onChange={(event) => setCrop(zoomCrop(width, height, crop, Number(event.target.value)))}
          />
          <div className="ne-cropper-previews" aria-hidden="true">
            {PREVIEWS.map((size, index) => (
              <canvas
                key={size}
                ref={(node) => {
                  smallRefs.current[index] = node;
                }}
                className="ne-cropper-small"
                width={size}
                height={size}
                style={{ inlineSize: size, blockSize: size }}
              />
            ))}
          </div>
          <p className="field-hint">{m.dev_nations_crop_hint({ size: EMBLEM_SIZE })}</p>
        </div>
      </div>
      {tooLarge ? (
        <p role="alert" className="field-error">
          {m.dev_nations_error_emblem_too_large()}
        </p>
      ) : null}
      <div className="ce-inline-actions">
        <button
          type="button"
          className="ne-cropper-done"
          aria-disabled={working || busy}
          onClick={() => void submit()}
        >
          {working || busy ? m.dev_nations_crop_uploading() : m.dev_nations_crop_done()}
        </button>
        <button type="button" className="button-small ne-cropper-cancel" onClick={onCancel}>
          {m.dev_nations_crop_cancel()}
        </button>
      </div>
    </div>
  );
}
