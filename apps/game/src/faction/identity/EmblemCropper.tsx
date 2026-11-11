// 세력 마크 자르기(플레이어 화면) — 고른 그림에서 정사각을 골라(끌기·확대·화살표 키) 256 × 256 PNG로 만든다. 지연 로딩 조각이다
// (그림을 올리려는 사람만 받는다). 시작 국가 설정 편집기의 자르기와 같은 셈·같은 캔버스 일(ui/emblemCrop.ts·emblemCanvas.ts)을 쓴다.
// - 보기 칸을 끌면 그림이 따라오고, 확대는 미닫이·휠·[+]/[−] 키. 화살표 키는 자를 자리를 그쪽으로 옮긴다(Shift = 크게).
// - 옆에 24·48·128px 미리 보기를 같이 그린다(실제로 쓰이는 크기).
// - [이 그림 쓰기]: 캔버스에서 PNG를 만들어(상한을 넘으면 색 단계를 줄인다) 부모에게 넘긴다. 여기서는 올리지 않는다 — 올리기는 정체성을
//   저장할 때 함께 한다. 원본 파일은 어디에도 보내지 않는다.
import { type KeyboardEvent, type PointerEvent, type WheelEvent, useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { drawCrop, encodeEmblem } from "../../ui/emblemCanvas.ts";
import { CROP_ZOOM, type CropState, dragCrop, initialCrop, zoomCrop } from "../../ui/emblemCrop.ts";
import { tooLargeText } from "./identityText.ts";

/** 보기 칸 한 변(캔버스 px, 화면에서는 CSS로 줄어든다) */
const VIEW = 320;
const PREVIEWS = [24, 48, 128] as const;

export default function EmblemCropper({
  image,
  onCancel,
  onDone,
}: {
  /** 다 읽은 그림 */
  image: HTMLImageElement;
  onCancel: () => void;
  /** 256 × 256 PNG(base64) */
  onDone: (pngBase64: string) => void;
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
    drawCrop(viewRef.current, image, crop, VIEW);
    PREVIEWS.forEach((size, index) => drawCrop(smallRefs.current[index] ?? null, image, crop, size));
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
    if (working) return;
    setWorking(true);
    setTooLarge(false);
    try {
      const png = await encodeEmblem(image, crop);
      if (png === null) setTooLarge(true);
      else onDone(png);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fid-cropper" role="group" aria-label={m.fid_crop_title()}>
      <h3 className="fid-cropper-title">{m.fid_crop_title()}</h3>
      <div className="fid-cropper-body">
        <canvas
          ref={viewRef}
          className="fid-cropper-view"
          width={VIEW}
          height={VIEW}
          tabIndex={0}
          role="img"
          aria-label={m.fid_crop_view()}
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
        <div className="fid-cropper-side">
          <label className="field-label" htmlFor="fid-crop-zoom">
            {m.fid_crop_zoom()}
          </label>
          <input
            id="fid-crop-zoom"
            className="fid-cropper-zoom"
            type="range"
            min={CROP_ZOOM.min}
            max={CROP_ZOOM.max}
            step={CROP_ZOOM.step}
            value={crop.zoom}
            onChange={(event) => setCrop(zoomCrop(width, height, crop, Number(event.target.value)))}
          />
          <div className="fid-cropper-previews" aria-hidden="true">
            {PREVIEWS.map((size, index) => (
              <canvas
                key={size}
                ref={(node) => {
                  smallRefs.current[index] = node;
                }}
                className={`fid-cropper-small fid-emblem-${size}`}
                width={size}
                height={size}
              />
            ))}
          </div>
          <p className="field-hint">{m.fid_crop_hint()}</p>
        </div>
      </div>
      {tooLarge ? (
        <p role="alert" className="field-error">
          {tooLargeText()}
        </p>
      ) : null}
      <div className="fid-actions">
        <button
          type="button"
          className="button-primary fid-cropper-done"
          aria-disabled={working}
          onClick={() => void submit()}
        >
          {working ? m.fid_crop_working() : m.fid_crop_done()}
        </button>
        <button type="button" className="button-small fid-cropper-cancel" onClick={onCancel}>
          {m.cancel()}
        </button>
      </div>
    </div>
  );
}
