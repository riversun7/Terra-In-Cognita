// 편집기 평면 미니맵 — 미리보기 결과 하나를 행성 전체가 한눈에 보이게 펼친 그림(ADR 38 "평면 미니맵", 사용자 D1).
// 어느 결과를 넘길지(빠른 F5·본 F7, 공개본 ↔ 초안)와 고른 점을 어디에 둘지는 편집기 화면이 정한다.
// 이 부품은 받은 결과를 칠하고, 누른 점의 위도·경도만 알린다(칸 정보창이 그 점으로 칸을 찾는다. 누른 점은 픽셀 중심이라
// 그 칸이 그 픽셀에 칠한 칸이다 — flatMapRender.ts).
// - 크기는 CSS가 정한다(flatMap.css: 담는 판의 폭, 가로세로 2 : 1, 토큰만). 그림 버퍼 = CSS 폭 × 픽셀 비율, 폭 상한 1,024.
//   픽셀 비율 상한은 엔진 1차맵과 같은 규칙이다(휴대폰 1.5, 그 밖 2 — PLAN 5.7).
// - 결과·색표·크기가 바뀌면 다시 칠한다. 픽셀 → 칸 표는 이 부품이 기억한다(크기마다 기준 표 하나, 면 레벨 표는 거기서 끌어낸다.
//   닫으면 버린다).
// - 크기가 바뀌는 동안(창 끌기, 판 폭이 움직이는 동안)은 옛 그림 버퍼를 CSS가 늘려 보이고, 멈춘 뒤(150ms) 새 크기로 한 번 칠한다.
// - 숨겨져 폭이 0이면(접힌 판) 칠하지 않는다. 그동안 온 결과는 다시 보일 때 마지막 것만 칠한다(처음부터 숨긴 판도 같다).
//   두 규칙은 flatMapView.ts가 정한다.
// - 누르면(마우스·터치·펜) 그 픽셀 중심의 위도·경도를 onPick으로 알린다. 고른 점(selected)은 부모가 들고 여기서는 표시만 한다.
// - 키보드: 초점을 받으면 화살표로 적도 칸 하나쯤, Shift와 함께 8칸쯤 옮긴다. Enter·Space는 지금 점(없으면 가운데)을 고른다.
//   고른 칸을 읽어 주는 것은 칸 정보창(부모의 status 영역)이 한다. onPick이 없으면 보기만 하는 그림(role="img", 초점 없음)이다.
// - 시험·측정용 data-*(캔버스): data-face-level, data-backing(폭x높이), data-paint-ms, 그리고 그 칠하기에서 표를 새로 얻었을 때만
//   data-lookup-ms·data-lookup("derived" = 기준 표에서 끌어냄, "base" = 그 크기의 기준 표부터 만듦). 판을 비우면 모두 지운다
//   (data-backing만 남는다).
import { type KeyboardEvent, type MouseEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  type FlatMapDirection,
  type FlatMapFields,
  FlatMapLookupCache,
  type LatLon,
  createFlatMapPalette,
  flatMapFraction,
  flatMapPixelRatioLimit,
  flatMapPointAt,
  moveFlatMapPoint,
  paintFlatMap,
} from "./flatMapRender.ts";
import { type FlatMapView, createFlatMapViewTracker } from "./flatMapView.ts";
import "./flatMap.css";

export interface FlatMapProps {
  /** 칠할 결과. null이면 빈 판(그린 것을 지운다) */
  readonly fields: FlatMapFields | null;
  /**
   * 바이옴 번호별 색(0xRRGGBB) — 엔진 행성 설명(PlanetDescription.biomeColors)과 같은 표.
   * 같은 배열이면 색표를 다시 만들지 않는다(부모는 정의가 바뀔 때만 새 배열을 넘긴다)
   */
  readonly biomeColors: readonly number[];
  /** 고른 점(표시만 한다) */
  readonly selected?: LatLon | null;
  /** 누르거나 키보드로 고른 점(픽셀 중심) */
  readonly onPick?: (point: LatLon) => void;
  /** 접근성 이름. 없으면 기본 문구(공개본·초안을 번갈아 보일 때 부모가 바꾼다) */
  readonly label?: string;
}

/** 이 기기의 픽셀 비율(상한을 건 값): 휴대폰(굵은 포인터·짧은 변 600px 이하) 1.5, 그 밖 2 */
function pixelRatio(): number {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const shortSide =
    typeof screen === "undefined" ? Number.POSITIVE_INFINITY : Math.min(screen.width, screen.height);
  return Math.min(window.devicePixelRatio || 1, flatMapPixelRatioLimit(coarse, shortSide));
}

/** 화살표 키 → 방향 */
function keyDirection(key: string): FlatMapDirection | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

export function FlatMap({ fields, biomeColors, selected = null, onPick, label }: FlatMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<FlatMapLookupCache | null>(null);
  const imageRef = useRef<ImageData | null>(null);
  const hintId = useId();
  /** 그림 버퍼 폭과 보이는지 — 크기 관찰·창 크기(돌리기·확대)로 다시 잰다(flatMapView.ts) */
  const [view, setView] = useState<FlatMapView | null>(null);
  const palette = useMemo(() => createFlatMapPalette(biomeColors), [biomeColors]);
  const backingWidth = view?.backingWidth ?? 0;
  const visible = view?.visible ?? false;
  // 지금 캔버스에 칠한 그림 버퍼 크기: 크기가 멈추기를 기다리는 동안에도 누른 곳은 보이는 그림 기준이다
  const backing = view ? { width: view.backingWidth, height: view.backingWidth / 2 } : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const tracker = createFlatMapViewTracker(setView);
    const measure = (): void => tracker.measure(canvas.clientWidth, pixelRatio());
    // 처음 값은 다음 프레임에(그리는 중에 상태를 바꾸지 않는다). 그 뒤는 크기 관찰·창 크기(확대하면 픽셀 비율이 바뀐다)
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      tracker.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    // 숨겨진 동안은 칠하지 않는다: 다시 보이면 visible이 바뀌어 그때 결과로 칠한다(표는 기억에서)
    if (!canvas || backingWidth === 0 || !visible) return;
    const size = { width: backingWidth, height: backingWidth / 2 };
    // 버퍼 크기를 바꾸면 그린 것이 지워진다: 바뀔 때만
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    const clear = (): void => {
      context.clearRect(0, 0, size.width, size.height);
      delete canvas.dataset.faceLevel;
      delete canvas.dataset.paintMs;
      delete canvas.dataset.lookupMs;
      delete canvas.dataset.lookup;
    };
    canvas.dataset.backing = `${size.width}x${size.height}`;
    if (!fields) {
      clear();
      return;
    }
    try {
      const started = performance.now();
      cacheRef.current ??= new FlatMapLookupCache();
      const { lookup, source } = cacheRef.current.get(fields.meta.faceLevel, size);
      const painting = performance.now();
      let image = imageRef.current;
      if (!image || image.width !== size.width || image.height !== size.height) {
        image = context.createImageData(size.width, size.height);
        imageRef.current = image;
      }
      paintFlatMap(lookup, fields, palette, image);
      context.putImageData(image, 0, 0);
      canvas.dataset.faceLevel = String(fields.meta.faceLevel);
      canvas.dataset.paintMs = (performance.now() - painting).toFixed(1);
      if (source === "cached") {
        delete canvas.dataset.lookupMs;
        delete canvas.dataset.lookup;
      } else {
        canvas.dataset.lookupMs = (painting - started).toFixed(1);
        canvas.dataset.lookup = source;
      }
    } catch (error) {
      // 결과와 표가 맞지 않음(면 레벨·배열 길이) 등 코드 오류: 화면을 멈추지 않고 비운 뒤 기기 오류 보고로 보낸다
      clear();
      reportError(error);
    }
  }, [fields, palette, backingWidth, visible]);

  const pickAt = (event: MouseEvent<HTMLCanvasElement>): void => {
    if (!onPick || !backing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    onPick(
      flatMapPointAt(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
        backing,
      ),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    if (!onPick || !backing || !fields) return;
    const direction = keyDirection(event.key);
    if (direction === null && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPick(moveFlatMapPoint(selected, direction, event.shiftKey, fields.meta.faceLevel, backing));
  };

  const marker = selected ? flatMapFraction(selected) : null;
  const interactive = onPick !== undefined;
  return (
    <div className="flat-map">
      <canvas
        ref={canvasRef}
        className="flat-map-canvas"
        data-interactive={interactive ? "true" : "false"}
        role={interactive ? "application" : "img"}
        tabIndex={interactive ? 0 : undefined}
        aria-label={label ?? m.planet_editor_flat_map_label()}
        aria-describedby={interactive ? hintId : undefined}
        onClick={interactive ? pickAt : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
      />
      {marker ? (
        <span
          className="flat-map-marker"
          aria-hidden="true"
          style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
        />
      ) : null}
      {interactive ? (
        <p id={hintId} className="visually-hidden">
          {m.planet_editor_flat_map_hint()}
        </p>
      ) : null}
    </div>
  );
}
