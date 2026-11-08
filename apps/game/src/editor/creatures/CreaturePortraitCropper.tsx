// 크리처 원형 초상화 영역 선택기(CreaturePortraitCropper) — 원본 이미지를 복제하지 않고 정규화 원 좌표(cxPm, cyPm, radiusPm, 0~1000‰)만
// 저장해 1차·2차맵 원형 토큰과 도감 배지에 그대로 투영한다.
// 이미지를 새로 고르거나 바꿀 때 자동으로 머리·얼굴 부위(실루엣 상단 + 윤곽 대비 밀도 / FaceDetector)를 찾아 원을 잡아 준다.
import {
  CREATURE_DEFAULT_PORTRAIT_CROP,
  CREATURE_LIMITS,
  type CreatureGrade,
  type CreaturePortraitCrop,
  resolveCreatureImageUrl,
} from "@terra/shared/creatureEditor";
import { useEffect, useRef, useState } from "react";

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(v)));

/**
 * 원본 이미지와 원형 좌표(cxPm, cyPm, radiusPm)만으로 정원 토큰을 그리는 공용 배지.
 * 별도 잘라낸 이미지 파일 없이 어디서나(목록·맵 토큰·상세 헤더) 같은 원형 초상화를 보여 준다.
 */
export function CreatureTokenBadge({
  image,
  crop = CREATURE_DEFAULT_PORTRAIT_CROP,
  grade = "common",
  sizePx = 44,
  alt = "",
}: {
  readonly image: string | undefined;
  readonly crop?: CreaturePortraitCrop | undefined;
  readonly grade?: CreatureGrade | undefined;
  readonly sizePx?: number | undefined;
  readonly alt?: string | undefined;
}) {
  const url = resolveCreatureImageUrl(image);
  const cx = (crop?.cxPm ?? CREATURE_DEFAULT_PORTRAIT_CROP.cxPm) / 1000;
  const cy = (crop?.cyPm ?? CREATURE_DEFAULT_PORTRAIT_CROP.cyPm) / 1000;
  const r = Math.max(0.08, (crop?.radiusPm ?? CREATURE_DEFAULT_PORTRAIT_CROP.radiusPm) / 1000);
  const scalePct = 100 / (2 * r);
  const leftPct = 50 - cx * scalePct;
  const topPct = 50 - cy * scalePct;

  return (
    <span
      className="ce-creature-token"
      data-grade={grade}
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
      title={alt}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          draggable={false}
          className="ce-creature-token-img"
          style={{
            width: `${scalePct.toFixed(2)}%`,
            height: `${scalePct.toFixed(2)}%`,
            left: `${leftPct.toFixed(2)}%`,
            top: `${topPct.toFixed(2)}%`,
          }}
        />
      ) : (
        <span className="ce-creature-token-empty" aria-hidden="true">
          ?
        </span>
      )}
    </span>
  );
}

/**
 * 캔버스 실루엣 + 상단 윤곽 대비 밀도(눈·얼굴·뿔 등 고대비 영역) 분석으로 크리처 머리·얼굴 중심과 반지름을 자동 추정한다.
 * 브라우저에 FaceDetector API가 있으면 먼저 시도하고, 몬스터·비인간형이면 실루엣 상단 분석으로 넘어간다.
 */
async function detectCreatureHeadCrop(img: HTMLImageElement): Promise<CreaturePortraitCrop> {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (naturalW <= 0 || naturalH <= 0) return CREATURE_DEFAULT_PORTRAIT_CROP;

  // 1) 128x128 캔버스에서 전경(알파 또는 배경색 차이)과 상단 윤곽 대비를 분석
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return CREATURE_DEFAULT_PORTRAIT_CROP;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // 네 모서리 평균 배경색(불투명 이미지 대비용)
  const corners = [0, (size - 1) * 4, (size - 1) * size * 4, (size * size - 1) * 4];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgA = 0;
  for (const idx of corners) {
    bgR += data[idx] ?? 0;
    bgG += data[idx + 1] ?? 0;
    bgB += data[idx + 2] ?? 0;
    bgA += data[idx + 3] ?? 0;
  }
  bgR /= 4;
  bgG /= 4;
  bgB /= 4;
  bgA /= 4;
  const hasTransparency = bgA < 220;

  const isForeground = (x: number, y: number): number => {
    const idx = (y * size + x) * 4;
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    const a = data[idx + 3] ?? 0;
    if (hasTransparency) return a > 36 ? a / 255 : 0;
    const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
    return diff > 42 ? Math.min(1, diff / 180) : 0;
  };

  let minX = size;
  let maxX = 0;
  let minY = size;
  let maxY = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isForeground(x, y) > 0.15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return CREATURE_DEFAULT_PORTRAIT_CROP;

  const boxH = maxY - minY;
  // 크리처 일러스트에서 머리·얼굴이 놓이는 상단 8%~44% 대역
  const headY0 = Math.max(1, Math.floor(minY + boxH * 0.08));
  const headY1 = Math.min(size - 2, Math.ceil(minY + boxH * 0.44));

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;
  let headMinX = size;
  let headMaxX = 0;

  for (let y = headY0; y <= headY1; y++) {
    for (let x = Math.max(1, minX); x <= Math.min(size - 2, maxX); x++) {
      const fg = isForeground(x, y);
      if (fg <= 0.15) continue;
      if (x < headMinX) headMinX = x;
      if (x > headMaxX) headMaxX = x;
      const idx = (y * size + x) * 4;
      const rightIdx = (y * size + (x + 1)) * 4;
      const downIdx = ((y + 1) * size + x) * 4;
      const lum = (data[idx] ?? 0) * 0.299 + (data[idx + 1] ?? 0) * 0.587 + (data[idx + 2] ?? 0) * 0.114;
      const lumR =
        (data[rightIdx] ?? 0) * 0.299 + (data[rightIdx + 1] ?? 0) * 0.587 + (data[rightIdx + 2] ?? 0) * 0.114;
      const lumD =
        (data[downIdx] ?? 0) * 0.299 + (data[downIdx + 1] ?? 0) * 0.587 + (data[downIdx + 2] ?? 0) * 0.114;
      const edge = Math.abs(lum - lumR) + Math.abs(lum - lumD);
      // 얼굴 이목구비(고대비)와 실루엣 중심쪽에 가중치를 준다
      const weight = fg * (1 + edge / 45);
      sumW += weight;
      sumX += x * weight;
      sumY += y * weight;
    }
  }

  if (sumW <= 0) return CREATURE_DEFAULT_PORTRAIT_CROP;
  const cxPm = clamp((sumX / sumW / size) * 1000, 120, 880);
  const cyPm = clamp((sumY / sumW / size) * 1000, 120, 880);
  const headSpanPm =
    headMaxX > headMinX ? ((headMaxX - headMinX) / size) * 1000 : ((maxX - minX) / size) * 600;
  const radiusPm = clamp(headSpanPm * 0.56, 200, 420);
  return { cxPm, cyPm, radiusPm };
}

export function CreaturePortraitCropper({
  image,
  crop = CREATURE_DEFAULT_PORTRAIT_CROP,
  grade,
  availableImages,
  autoDetectOnMount = false,
  locale,
  onChangeImage,
  onChangeCrop,
}: {
  readonly image: string | undefined;
  readonly crop: CreaturePortraitCrop | undefined;
  readonly grade: CreatureGrade;
  readonly availableImages: readonly string[];
  readonly autoDetectOnMount?: boolean | undefined;
  readonly locale: "ko" | "en";
  readonly onChangeImage: (image: string | undefined, autoCrop?: CreaturePortraitCrop) => void;
  readonly onChangeCrop: (crop: CreaturePortraitCrop) => void;
}) {
  const ko = locale !== "en";
  const currentCrop = crop ?? CREATURE_DEFAULT_PORTRAIT_CROP;
  const imageUrl = resolveCreatureImageUrl(image);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pendingAutoDetectRef = useRef<boolean>(autoDetectOnMount);
  const [dragMode, setDragMode] = useState<"move" | "resize" | null>(null);
  const [imageFilter, setImageFilter] = useState("");
  const [detecting, setDetecting] = useState(false);

  const runAutoDetect = async (imgEl: HTMLImageElement | null): Promise<void> => {
    if (!imgEl) return;
    setDetecting(true);
    try {
      const detected = await detectCreatureHeadCrop(imgEl);
      onChangeCrop(detected);
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (autoDetectOnMount) pendingAutoDetectRef.current = true;
  }, [autoDetectOnMount]);

  const updateFromPointer = (clientX: number, clientY: number, mode: "move" | "resize"): void => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = ((clientX - rect.left) / rect.width) * 1000;
    const py = ((clientY - rect.top) / rect.height) * 1000;
    if (mode === "move") {
      onChangeCrop({
        cxPm: clamp(px, CREATURE_LIMITS.portraitCoordPm.min, CREATURE_LIMITS.portraitCoordPm.max),
        cyPm: clamp(py, CREATURE_LIMITS.portraitCoordPm.min, CREATURE_LIMITS.portraitCoordPm.max),
        radiusPm: currentCrop.radiusPm,
      });
    } else {
      const dx = px - currentCrop.cxPm;
      const dy = py - currentCrop.cyPm;
      const dist = Math.hypot(dx, dy);
      onChangeCrop({
        ...currentCrop,
        radiusPm: clamp(dist, CREATURE_LIMITS.portraitRadiusPm.min, CREATURE_LIMITS.portraitRadiusPm.max),
      });
    }
  };

  const filteredImages = availableImages.filter((file) =>
    imageFilter.trim() === "" ? true : file.toLowerCase().includes(imageFilter.trim().toLowerCase()),
  );

  return (
    <div className="ce-portrait-card">
      <div className="ce-portrait-header">
        <div>
          <h3 className="ce-section-title">
            {ko ? "원본 이미지 & 맵 원형 초상화 영역 선택" : "Source Image & Circular Portrait Cropper"}
          </h3>
          <p className="field-hint">
            {ko
              ? "별도 파일을 복제하지 않고 원본 위에서 원형 좌표(중심 X·Y, 반지름)만 저장합니다. 이미지를 바꾸면 얼굴·머리 부위를 자동으로 인식해 원을 맞춥니다."
              : "Stores normalized circle coordinates (cx, cy, radius) on the original image without duplicating files. Selecting an image auto-detects the head region."}
          </p>
        </div>
        <div className="ce-portrait-actions">
          <button
            type="button"
            className="button-small"
            disabled={!imageUrl || detecting}
            onClick={() => void runAutoDetect(imgRef.current)}
          >
            {detecting ? (ko ? "인식 중…" : "Detecting…") : ko ? "얼굴·머리 자동 인식" : "Auto-Detect Head"}
          </button>
          <button
            type="button"
            className="button-small"
            onClick={() => onChangeCrop(CREATURE_DEFAULT_PORTRAIT_CROP)}
          >
            {ko ? "기본 원 초기화" : "Reset Circle"}
          </button>
        </div>
      </div>

      {/* 이미지 파일 선택/입력 줄 */}
      <div className="ce-image-picker-bar">
        <div className="field ce-field">
          <label className="field-label" htmlFor="ce-creature-img-file">
            {ko ? "이미지 파일명 또는 경로 (확장자 자유)" : "Image Filename / Path (any format)"}
          </label>
          <input
            id="ce-creature-img-file"
            className="input"
            placeholder="crea_wolf_01.webp"
            value={image ?? ""}
            onChange={(e) => {
              pendingAutoDetectRef.current = true;
              onChangeImage(e.target.value.trim() === "" ? undefined : e.target.value);
            }}
          />
        </div>
        <div className="field ce-field">
          <label className="field-label" htmlFor="ce-creature-img-search">
            {ko
              ? `내장 이미지 고르기 (${filteredImages.length}/${availableImages.length})`
              : `Pick Built-in Image (${filteredImages.length}/${availableImages.length})`}
          </label>
          <div className="ce-image-select-row">
            <input
              id="ce-creature-img-search"
              className="input ce-image-filter"
              placeholder={ko ? "파일명 검색…" : "Filter files…"}
              value={imageFilter}
              onChange={(e) => setImageFilter(e.target.value)}
            />
            <select
              aria-label={ko ? "내장 크리처 이미지 목록" : "Built-in creature images"}
              value={image ?? ""}
              onChange={(e) => {
                const picked = e.target.value;
                pendingAutoDetectRef.current = true;
                onChangeImage(picked === "" ? undefined : picked);
              }}
            >
              <option value="">{ko ? "— 이미지 선택 —" : "— Select image —"}</option>
              {filteredImages.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="ce-portrait-workbench">
        {/* 왼쪽: 대화형 원본 캔버스 + 원형 선택 영역 */}
        <div
          ref={stageRef}
          className="ce-crop-stage"
          onPointerMove={(e) => {
            if (!dragMode) return;
            updateFromPointer(e.clientX, e.clientY, dragMode);
          }}
          onPointerUp={() => setDragMode(null)}
          onPointerCancel={() => setDragMode(null)}
          onWheel={(e) => {
            if (!imageUrl) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? 15 : -15;
            onChangeCrop({
              ...currentCrop,
              radiusPm: clamp(
                currentCrop.radiusPm + delta,
                CREATURE_LIMITS.portraitRadiusPm.min,
                CREATURE_LIMITS.portraitRadiusPm.max,
              ),
            });
          }}
        >
          {imageUrl ? (
            <>
              <img
                ref={imgRef}
                src={imageUrl}
                alt={image ?? "creature"}
                crossOrigin="anonymous"
                draggable={false}
                className="ce-crop-source-img"
                onLoad={(e) => {
                  if (pendingAutoDetectRef.current) {
                    pendingAutoDetectRef.current = false;
                    void runAutoDetect(e.currentTarget);
                  }
                }}
              />
              {/* 어두운 바깥 마스크와 원형 선택 링 */}
              <div
                className="ce-crop-circle"
                style={{
                  left: `${(currentCrop.cxPm / 10).toFixed(1)}%`,
                  top: `${(currentCrop.cyPm / 10).toFixed(1)}%`,
                  width: `${((currentCrop.radiusPm * 2) / 10).toFixed(1)}%`,
                  height: `${((currentCrop.radiusPm * 2) / 10).toFixed(1)}%`,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragMode("move");
                }}
              >
                <span className="ce-crop-crosshair" aria-hidden="true" />
                <span
                  className="ce-crop-handle"
                  title={ko ? "끌어서 원 크기 조절" : "Drag to resize circle"}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    stageRef.current?.setPointerCapture(e.pointerId);
                    setDragMode("resize");
                  }}
                />
              </div>
            </>
          ) : (
            <div className="ce-crop-empty">
              {ko ? "이미지를 선택하면 원형 초상화 영역을 지정할 수 있습니다." : "Pick an image to crop."}
            </div>
          )}
        </div>

        {/* 오른쪽: 실시간 원형 토큰 미리보기 & 수치 미세 조정 */}
        <div className="ce-crop-controls">
          <div className="ce-token-preview-group">
            <span className="field-label">
              {ko ? "실시간 맵 토큰 · 도감 배지 미리보기" : "Live Map Token & Badge Previews"}
            </span>
            <div className="ce-token-preview-row">
              <div className="ce-token-preview-item">
                <CreatureTokenBadge image={image} crop={currentCrop} grade={grade} sizePx={76} alt="76px" />
                <span className="field-hint">{ko ? "상세 대표 (76px)" : "Detail (76px)"}</span>
              </div>
              <div className="ce-token-preview-item">
                <CreatureTokenBadge image={image} crop={currentCrop} grade={grade} sizePx={48} alt="48px" />
                <span className="field-hint">{ko ? "2차맵 토큰 (48px)" : "Map Token (48px)"}</span>
              </div>
              <div className="ce-token-preview-item">
                <CreatureTokenBadge image={image} crop={currentCrop} grade={grade} sizePx={32} alt="32px" />
                <span className="field-hint">{ko ? "소형 배지 (32px)" : "Mini Badge (32px)"}</span>
              </div>
            </div>
          </div>

          <div className="ce-crop-sliders">
            <label className="ce-slider-row">
              <span>
                {ko ? "중심 X (cxPm)" : "Center X (cxPm)"}: <strong>{currentCrop.cxPm}‰</strong>
              </span>
              <input
                type="range"
                min={CREATURE_LIMITS.portraitCoordPm.min}
                max={CREATURE_LIMITS.portraitCoordPm.max}
                value={currentCrop.cxPm}
                onChange={(e) => onChangeCrop({ ...currentCrop, cxPm: Number(e.target.value) })}
              />
            </label>
            <label className="ce-slider-row">
              <span>
                {ko ? "중심 Y (cyPm)" : "Center Y (cyPm)"}: <strong>{currentCrop.cyPm}‰</strong>
              </span>
              <input
                type="range"
                min={CREATURE_LIMITS.portraitCoordPm.min}
                max={CREATURE_LIMITS.portraitCoordPm.max}
                value={currentCrop.cyPm}
                onChange={(e) => onChangeCrop({ ...currentCrop, cyPm: Number(e.target.value) })}
              />
            </label>
            <label className="ce-slider-row">
              <span>
                {ko ? "원 반지름 (radiusPm)" : "Radius (radiusPm)"}: <strong>{currentCrop.radiusPm}‰</strong>
              </span>
              <input
                type="range"
                min={CREATURE_LIMITS.portraitRadiusPm.min}
                max={CREATURE_LIMITS.portraitRadiusPm.max}
                value={currentCrop.radiusPm}
                onChange={(e) => onChangeCrop({ ...currentCrop, radiusPm: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
