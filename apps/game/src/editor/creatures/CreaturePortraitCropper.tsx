// 크리처 원형 초상화 영역 선택기(CreaturePortraitCropper) — 원본 그림 위의 원(cxPm·cyPm·radiusPm, ‰)만 저장하고,
// 그 원을 목록·상세 머리·맵 토큰 배지(CreatureTokenBadge)가 그대로 그린다.
// 좌표 계산은 모두 @terra/shared/portraitCrop을 거친다(고르는 쪽과 그리는 쪽이 같은 그림 화소 원을 본다):
// - 포인터 → 그림 화소: 이벤트마다 그림 요소의 지금 getBoundingClientRect()를 재서 boxPointToImage로 바꾼다
//   (스크롤·브라우저 확대·기기 화소 비율과 상관없다). 그림 상자는 테두리·안쪽 여백이 없고 그림 비율 그대로라 여백이 없다.
// - 원 테두리: portraitRingRect가 주는 그림 상자에 대한 %(왼쪽 위 기준). 상자 끝이 곧 원이다(테두리는 안쪽 그림자).
// - 끄는 동안은 선택기 안에서만 값을 들고(미리보기는 따라온다) 손을 뗄 때 한 번 올린다 — 처음 고친 순간 위쪽 표지·담은 변경
//   막대가 생겨 그림이 손가락 밑에서 밀리지 않게, 그리고 한 번 끈 것이 되돌리기 한 번이 되게.
import {
  CREATURE_DEFAULT_PORTRAIT_CROP,
  type CreatureGrade,
  type CreaturePortraitCrop,
  resolveCreatureImageUrl,
} from "@terra/shared/creatureEditor";
import {
  PORTRAIT_CROP_LIMITS,
  type PortraitPoint,
  type PortraitSize,
  boxPointToImage,
  clampPortraitCrop,
  nudgePortraitCrop,
  portraitCircle,
  portraitCropFromCircle,
  portraitRingRect,
} from "@terra/shared/portraitCrop";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { m } from "../../paraglide/messages.js";
import { NumberField } from "../content/contentEditorFields.tsx";
import { CreatureTokenBadge } from "./CreatureTokenBadge.tsx";
import { detectCreatureHeadCrop } from "./creaturePortraitDetect.ts";

// 목록·상세가 이 파일에서 배지를 가져온다
export { CreatureTokenBadge } from "./CreatureTokenBadge.tsx";

/** 미리보기 배지 지름(CSS px): 큰 초상화·2차맵 토큰·작은 배지 */
const PREVIEW_SIZES = [96, 48, 32] as const;
/** 되돌리기로 돌아갈 수 있는 걸음 수 */
const HISTORY_LIMIT = 50;
/** 이 시간(ms) 안에 같은 곳(키·휠·막대·칸)에서 이어진 입력은 되돌리기 한 걸음으로 친다 */
const COALESCE_MS = 700;
/** 손잡이를 원 테두리의 45° 자리에 둔다: 가운데에서 반지름 × cos 45° */
const HANDLE_OFFSET_PCT = 50 * Math.SQRT1_2;
/** 그림 상자에 대한 % 네모(portraitRingRect에 넘긴다) */
const PERCENT_BOX = { left: 0, top: 0, width: 100, height: 100 } as const;

const sameCrop = (a: CreaturePortraitCrop, b: CreaturePortraitCrop): boolean =>
  a.cxPm === b.cxPm && a.cyPm === b.cyPm && a.radiusPm === b.radiusPm;
const distance = (a: PortraitPoint, b: PortraitPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
const pct = (value: number): string => `${value.toFixed(4)}%`;

/** 지금 하는 손짓. grab* = 누른 순간 포인터와 원 사이 어긋남(그림 화소) — 잡은 자리 그대로 따라오게 */
type Gesture =
  | { readonly kind: "move"; readonly grabX: number; readonly grabY: number }
  | { readonly kind: "resize"; readonly grabR: number }
  | { readonly kind: "pinch"; readonly startDistance: number; readonly startR: number }
  // 두 손가락 가운데 하나를 뗀 뒤: 남은 손가락은 아무것도 하지 않는다(원이 튀지 않게)
  | { readonly kind: "idle" };

/** 화살표·크기 키 → 그림 화소 변화. 다른 키는 null */
function keyDelta(key: string, step: number): { dx?: number; dy?: number; dr?: number } | null {
  switch (key) {
    case "ArrowLeft":
      return { dx: -step };
    case "ArrowRight":
      return { dx: step };
    case "ArrowUp":
      return { dy: -step };
    case "ArrowDown":
      return { dy: step };
    case "+":
    case "=":
      return { dr: step };
    case "-":
    case "_":
      return { dr: -step };
    default:
      return null;
  }
}

export function CreaturePortraitCropper({
  image,
  crop = CREATURE_DEFAULT_PORTRAIT_CROP,
  appliedCrop,
  grade,
  availableImages,
  autoDetectOnMount = false,
  onChangeImage,
  onChangeCrop,
}: {
  readonly image: string | undefined;
  readonly crop: CreaturePortraitCrop | undefined;
  /** 이 세계에 적용된 값([적용된 값으로]가 돌아갈 곳). 새 항목이면 없다 */
  readonly appliedCrop?: CreaturePortraitCrop | undefined;
  readonly grade: CreatureGrade;
  readonly availableImages: readonly string[];
  readonly autoDetectOnMount?: boolean | undefined;
  /** 문구는 메시지 키로 읽는다. 부르는 쪽 호환을 위해 받기만 한다 */
  readonly locale?: "ko" | "en" | undefined;
  readonly onChangeImage: (image: string | undefined, autoCrop?: CreaturePortraitCrop) => void;
  readonly onChangeCrop: (crop: CreaturePortraitCrop) => void;
}) {
  const value = clampPortraitCrop(crop ?? CREATURE_DEFAULT_PORTRAIT_CROP);
  const imageUrl = resolveCreatureImageUrl(image);
  const helpId = useId();
  const sliderId = useId();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pendingDetectRef = useRef<boolean>(autoDetectOnMount);
  const pointersRef = useRef(new Map<number, PortraitPoint>());
  const gestureRef = useRef<Gesture | null>(null);
  const liveRef = useRef<CreaturePortraitCrop | null>(null);
  const lastPushRef = useRef<{ readonly at: number; readonly source: string }>({ at: 0, source: "" });
  const [live, setLive] = useState<CreaturePortraitCrop | null>(null);
  const [history, setHistory] = useState<readonly CreaturePortraitCrop[]>([]);
  const [loaded, setLoaded] = useState<{ readonly url: string; readonly size: PortraitSize } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [imageFilter, setImageFilter] = useState("");

  // 새로 만든 크리처로 열리면 다음에 읽은 그림에서 머리 자리를 어림한다
  useEffect(() => {
    if (autoDetectOnMount) pendingDetectRef.current = true;
  }, [autoDetectOnMount]);

  /** 읽기를 마친 그림의 원본 크기. 아직이면 null(그동안은 고칠 수 없다) */
  const natural = loaded !== null && loaded.url === imageUrl ? loaded.size : null;
  const failed = imageUrl !== null && failedUrl === imageUrl;
  const shown = live ?? value;
  const circle = natural ? portraitCircle(shown, natural) : null;

  /**
   * 값을 부모에 올린다. source(키·휠·막대·칸 이름)를 주면 같은 곳에서 잇달아 온 입력은 되돌리기 한 걸음으로 묶는다
   * (화살표를 열 번 눌러도 [되돌리기] 한 번). 없으면 늘 새 걸음이다(끌기·단추)
   */
  const commit = (next: CreaturePortraitCrop, source?: string): void => {
    const clean = clampPortraitCrop(next);
    if (sameCrop(clean, value)) return;
    const now = Date.now();
    const last = lastPushRef.current;
    if (!(source !== undefined && source === last.source && now - last.at < COALESCE_MS)) {
      setHistory((steps) => [...steps.slice(1 - HISTORY_LIMIT), value]);
    }
    lastPushRef.current = { at: now, source: source ?? "" };
    onChangeCrop(clean);
  };

  const undo = (): void => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((steps) => steps.slice(0, -1));
    lastPushRef.current = { at: 0, source: "" };
    onChangeCrop(previous);
  };

  const setLiveCrop = (next: CreaturePortraitCrop | null): void => {
    liveRef.current = next;
    setLive(next);
  };

  /** 화면 점(clientX·Y) → 그림 화소. 그림 상자는 이벤트마다 새로 잰다 */
  const imagePoint = (client: PortraitPoint): PortraitPoint | null => {
    const el = imgRef.current;
    if (!el || !natural) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return boxPointToImage(client, rect, natural);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!natural) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const stage = event.currentTarget;
    stage.focus({ preventScroll: true });
    stage.setPointerCapture(event.pointerId);
    const client = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, client);
    const current = portraitCircle(liveRef.current ?? value, natural);
    if (pointersRef.current.size >= 2) {
      // 두 손가락: 사이 거리의 비율만큼 반지름을 바꾼다(화면 화소끼리의 비율이라 단위가 없다)
      // 첫 손가락이 원을 옮겼으면 버린다(두 손가락을 차례로 대는 동안 가운데가 튀지 않게)
      setLiveCrop(null);
      const [a, b] = [...pointersRef.current.values()];
      gestureRef.current =
        a && b && pointersRef.current.size === 2
          ? {
              kind: "pinch",
              startDistance: Math.max(1, distance(a, b)),
              startR: portraitCircle(value, natural).r,
            }
          : { kind: "idle" };
      return;
    }
    const point = imagePoint(client);
    if (!point) return;
    const fromCentre = distance(point, { x: current.cx, y: current.cy });
    const onHandle = event.target instanceof Element && event.target.closest("[data-crop-handle]") !== null;
    if (onHandle) {
      gestureRef.current = { kind: "resize", grabR: current.r - fromCentre };
    } else if (fromCentre <= current.r) {
      // 원 안: 잡은 자리 그대로 옮긴다(누르기만 하면 그대로 — 키로 고치려고 누를 때 원이 튀지 않게)
      gestureRef.current = { kind: "move", grabX: current.cx - point.x, grabY: current.cy - point.y };
    } else {
      // 원 밖: 누른 자리가 가운데가 된다
      gestureRef.current = { kind: "move", grabX: 0, grabY: 0 };
      setLiveCrop(portraitCropFromCircle({ ...current, cx: point.x, cy: point.y }, natural));
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current;
    if (!natural || !gesture || !pointersRef.current.has(event.pointerId)) return;
    const client = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, client);
    const current = portraitCircle(liveRef.current ?? value, natural);
    if (gesture.kind === "pinch") {
      const [a, b] = [...pointersRef.current.values()];
      if (!a || !b) return;
      const r = (gesture.startR * distance(a, b)) / gesture.startDistance;
      setLiveCrop(portraitCropFromCircle({ ...current, r }, natural));
      return;
    }
    const point = imagePoint(client);
    if (!point) return;
    if (gesture.kind === "move") {
      setLiveCrop(
        portraitCropFromCircle(
          { ...current, cx: point.x + gesture.grabX, cy: point.y + gesture.grabY },
          natural,
        ),
      );
    } else if (gesture.kind === "resize") {
      const r = distance(point, { x: current.cx, y: current.cy }) + gesture.grabR;
      setLiveCrop(portraitCropFromCircle({ ...current, r }, natural));
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!pointersRef.current.delete(event.pointerId)) return;
    if (pointersRef.current.size > 0) {
      gestureRef.current = { kind: "idle" };
      return;
    }
    gestureRef.current = null;
    const next = liveRef.current;
    setLiveCrop(null);
    // 브라우저가 손짓을 가져가면(pointercancel) 끌던 것을 버린다
    if (next && event.type !== "pointercancel") commit(next);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!natural || gestureRef.current) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const delta = keyDelta(event.key, event.shiftKey ? 10 : 1);
    if (!delta) return;
    event.preventDefault();
    commit(nudgePortraitCrop(value, natural, delta), "key");
  };

  // 휠: React의 onWheel은 passive라 쪽 스크롤을 막지 못한다 → 직접 단다. 그림을 누른 뒤(초점이 있을 때)만 크기를 바꾸고,
  // 아니면 쪽이 그대로 스크롤된다(지나가다 원이 바뀌지 않게). 한 칸 = 너비의 1%, Shift = 1화소. 아래로 = 크게(초상화는 멀어진다)
  const wheelRef = useRef<(event: WheelEvent) => void>(() => {});
  useEffect(() => {
    wheelRef.current = (event) => {
      if (!natural || gestureRef.current || document.activeElement !== stageRef.current) return;
      const turned = event.deltaY || event.deltaX;
      if (turned === 0) return;
      event.preventDefault();
      const step = event.shiftKey ? 1 : Math.max(1, Math.round(natural.width / 100));
      commit(nudgePortraitCrop(value, natural, { dr: Math.sign(turned) * step }), "wheel");
    };
  });
  useEffect(() => {
    const stage = stageRef.current;
    const onWheel = (event: WheelEvent): void => wheelRef.current(event);
    stage?.addEventListener("wheel", onWheel, { passive: false });
    return () => stage?.removeEventListener("wheel", onWheel);
  }, []);

  const runDetect = (el: HTMLImageElement | null): void => {
    if (el) commit(detectCreatureHeadCrop(el));
  };

  const filterText = imageFilter.trim().toLowerCase();
  const filteredImages = availableImages.filter(
    (file) => filterText === "" || file.toLowerCase().includes(filterText),
  );
  const ring = natural ? portraitRingRect(shown, natural, PERCENT_BOX) : null;
  // 손잡이는 원 테두리의 대각선 자리. 그림 밖으로 나가면 반대쪽 대각선으로 옮긴다(잘려서 못 잡지 않게)
  const handleReach = circle ? circle.r * Math.SQRT1_2 : 0;
  const handleX = circle && natural && circle.cx + handleReach > natural.width ? -1 : 1;
  const handleY = circle && natural && circle.cy + handleReach > natural.height ? -1 : 1;
  const aspect = natural ? natural.width / natural.height : 1;

  return (
    <div className="ce-portrait-card">
      <div className="ce-portrait-header">
        <div>
          <h3 className="ce-section-title">{m.dev_creature_crop_title()}</h3>
          <p className="field-hint">{m.dev_creature_crop_lead()}</p>
        </div>
        <div className="ce-portrait-actions">
          <button
            type="button"
            className="button-small"
            disabled={!natural}
            onClick={() => runDetect(imgRef.current)}
          >
            {m.dev_creature_crop_detect()}
          </button>
          <button
            type="button"
            className="button-small"
            onClick={() => commit(CREATURE_DEFAULT_PORTRAIT_CROP)}
          >
            {m.dev_creature_crop_default()}
          </button>
          <button
            type="button"
            className="button-small ce-crop-undo"
            disabled={history.length === 0}
            onClick={undo}
          >
            {m.dev_creature_crop_undo()}
          </button>
          {appliedCrop ? (
            <button
              type="button"
              className="button-small ce-crop-to-applied"
              disabled={sameCrop(clampPortraitCrop(appliedCrop), value)}
              onClick={() => commit(appliedCrop)}
            >
              {m.dev_creature_crop_to_saved()}
            </button>
          ) : null}
        </div>
      </div>

      {/* 이미지 파일 고르기 */}
      <div className="ce-image-picker-row">
        <div className="field ce-field">
          <label className="field-label" htmlFor="ce-creature-img-file">
            {m.dev_creature_crop_image_file()}
          </label>
          <input
            id="ce-creature-img-file"
            className="input"
            placeholder="crea_wolf_01.webp"
            autoComplete="off"
            spellCheck={false}
            value={image ?? ""}
            onChange={(e) => {
              pendingDetectRef.current = true;
              onChangeImage(e.target.value.trim() === "" ? undefined : e.target.value);
            }}
          />
        </div>
        <div className="field ce-field">
          <label className="field-label" htmlFor="ce-creature-img-search">
            {m.dev_creature_crop_image_pick({ shown: filteredImages.length, total: availableImages.length })}
          </label>
          <div className="ce-image-select-row">
            <input
              id="ce-creature-img-search"
              className="input"
              placeholder={m.dev_creature_crop_image_filter()}
              autoComplete="off"
              spellCheck={false}
              value={imageFilter}
              onChange={(e) => setImageFilter(e.target.value)}
            />
            <select
              aria-label={m.dev_creature_crop_image_list()}
              value={image ?? ""}
              onChange={(e) => {
                const picked = e.target.value;
                pendingDetectRef.current = true;
                onChangeImage(picked === "" ? undefined : picked);
              }}
            >
              <option value="">{m.dev_creature_crop_image_none()}</option>
              {filteredImages.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="ce-portrait-body">
        {/* 왼쪽: 원본 그림 + 원 */}
        <div className="ce-crop-column">
          <div className="ce-crop-frame">
            {/* 그림 상자: 테두리·안쪽 여백 없음, 그림 비율 그대로(세로로 긴 그림은 폭을 줄인다) */}
            <div
              ref={stageRef}
              className="ce-crop-stage"
              // 화살표·+−·Ctrl+Z를 직접 받는 조작 칸(읽기 프로그램이 키를 그대로 넘긴다)
              role="application"
              tabIndex={0}
              aria-label={m.dev_creature_crop_stage()}
              aria-describedby={helpId}
              data-ready={natural ? "true" : undefined}
              data-dragging={live ? "true" : undefined}
              data-crop={`${shown.cxPm},${shown.cyPm},${shown.radiusPm}`}
              data-natural={natural ? `${natural.width}x${natural.height}` : undefined}
              style={{
                aspectRatio: `${aspect}`,
                width: `min(100%, calc(var(--ce-crop-max) * ${Math.min(1, aspect).toFixed(4)}))`,
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onKeyDown={onKeyDown}
            >
              {imageUrl ? (
                <img
                  key={imageUrl}
                  ref={imgRef}
                  src={imageUrl}
                  alt=""
                  crossOrigin="anonymous"
                  draggable={false}
                  className="ce-crop-source-img"
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    setLoaded({ url: imageUrl, size: { width: el.naturalWidth, height: el.naturalHeight } });
                    setFailedUrl(null);
                    if (pendingDetectRef.current) {
                      pendingDetectRef.current = false;
                      runDetect(el);
                    }
                  }}
                  onError={() => setFailedUrl(imageUrl)}
                />
              ) : null}
              {ring ? (
                <div
                  className="ce-crop-circle"
                  style={{
                    left: pct(ring.left),
                    top: pct(ring.top),
                    width: pct(ring.width),
                    height: pct(ring.height),
                  }}
                >
                  <span className="ce-crop-crosshair" aria-hidden="true" />
                  <span
                    className="ce-crop-handle"
                    data-crop-handle=""
                    title={m.dev_creature_crop_handle()}
                    style={{
                      left: pct(50 + handleX * HANDLE_OFFSET_PCT),
                      top: pct(50 + handleY * HANDLE_OFFSET_PCT),
                    }}
                  />
                </div>
              ) : null}
              {natural ? null : (
                <div className="ce-crop-empty">
                  {failed ? m.dev_creature_crop_failed() : imageUrl ? null : m.dev_creature_crop_empty()}
                </div>
              )}
            </div>
          </div>
          <p id={helpId} className="field-hint ce-crop-help">
            {m.dev_creature_crop_help()}
          </p>
        </div>

        {/* 오른쪽: 실제 크기 미리보기 + 수치 */}
        <div className="ce-portrait-controls">
          <div className="ce-token-preview-group">
            <span className="field-label">{m.dev_creature_crop_preview()}</span>
            <div className="ce-token-preview-row">
              {PREVIEW_SIZES.map((size) => (
                <div key={size} className="ce-token-preview-item" data-size={size}>
                  <CreatureTokenBadge image={image} crop={shown} grade={grade} sizePx={size} />
                  <span>{`${size}px`}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ce-slider-label">
            <label className="field-label" htmlFor={sliderId}>
              {m.dev_creature_crop_radius_slider()}
            </label>
            <input
              id={sliderId}
              className="ce-crop-slider"
              type="range"
              min={PORTRAIT_CROP_LIMITS.radiusPm.min}
              max={PORTRAIT_CROP_LIMITS.radiusPm.max}
              step={1}
              value={shown.radiusPm}
              disabled={!natural}
              onChange={(e) => commit({ ...value, radiusPm: Number(e.target.value) }, "slider")}
            />
          </div>

          <div className="ce-crop-numbers">
            <NumberField
              label={m.dev_creature_crop_cx()}
              className="ce-crop-cx"
              value={shown.cxPm}
              min={PORTRAIT_CROP_LIMITS.coordPm.min}
              max={PORTRAIT_CROP_LIMITS.coordPm.max}
              unit="‰"
              desc={m.dev_creature_crop_cx_desc()}
              hint={circle ? m.dev_creature_crop_px({ px: Math.round(circle.cx) }) : undefined}
              onChange={(next) => {
                if (next !== undefined) commit({ ...value, cxPm: next }, "cx");
              }}
            />
            <NumberField
              label={m.dev_creature_crop_cy()}
              className="ce-crop-cy"
              value={shown.cyPm}
              min={PORTRAIT_CROP_LIMITS.coordPm.min}
              max={PORTRAIT_CROP_LIMITS.coordPm.max}
              unit="‰"
              desc={m.dev_creature_crop_cy_desc()}
              hint={circle ? m.dev_creature_crop_px({ px: Math.round(circle.cy) }) : undefined}
              onChange={(next) => {
                if (next !== undefined) commit({ ...value, cyPm: next }, "cy");
              }}
            />
            <NumberField
              label={m.dev_creature_crop_radius()}
              className="ce-crop-radius"
              value={shown.radiusPm}
              min={PORTRAIT_CROP_LIMITS.radiusPm.min}
              max={PORTRAIT_CROP_LIMITS.radiusPm.max}
              unit="‰"
              desc={m.dev_creature_crop_radius_desc()}
              hint={circle ? m.dev_creature_crop_px({ px: Math.round(circle.r) }) : undefined}
              onChange={(next) => {
                if (next !== undefined) commit({ ...value, radiusPm: next }, "radius");
              }}
            />
          </div>

          {natural && circle ? (
            <p className="field-hint ce-crop-info">
              {m.dev_creature_crop_info({
                width: natural.width,
                height: natural.height,
                x: Math.round(circle.cx),
                y: Math.round(circle.cy),
                r: Math.round(circle.r),
              })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
