// 건물 편집기 "2차맵 모습" 구역 — docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)", 사용자 2026-11-09 "속성중에 2차맵에서 보여질
// 이미지, 폴리곤 이미지도 보여지고 수정하는등 가능하게해라".
// - 왼쪽: 3D 미리 보기(2차맵 엔진과 같은 로우폴리 모델·같은 낮 빛, 바닥 칸 금·앞면 화살표). 끌기 = 돌림, 휠 = 가까이, 키 ←→↑↓·+−·0.
//   보기 조건(저장하지 않음): 레벨(짓는 중·1~5 — 모델은 5에서 멈춘다), 상태(정상·손상·멈춤·폐허), 레벨 올리는 중, 국가 색, 낮·밤.
// - 오른쪽: 저장하는 칸(팩 칸 경로 = 견주기): 2차맵 칸 가로·세로(footprint), 모델 종류(look.model), 벽·지붕 색(look.wall·roof, 색 견본),
//   높이 배율(look.heightPm). 2차맵에는 이 3D 모델만 그린다(따로 지도 아이콘·그림 파일은 없다).
// - three·엔진은 미리 보기가 처음 그려질 때 buildingEditorPreview.ts를 지연 로딩한다(이 조각만, 첫 화면과 상관없다).
import {
  FACILITY_LEVEL_MAX,
  FACILITY_LOOK_COLORS,
  FACILITY_LOOK_LIMITS,
  FACILITY_LOOK_MODELS,
  type FacilityJson,
  type FacilityLookColor,
  type FacilityLookModel,
} from "@terra/shared/buildingEditor";
import { FACILITY_RUNTIME_LIMITS } from "@terra/shared/facilityRuntime";
import type { NationEmblemView } from "@terra/shared/nationEditor";
import { BUILDING_COLORS, LOOK_COLORS, NATION_ACCENTS } from "@terra/engine/buildingArt";
import type { BuildingPreview } from "@terra/engine/buildingPreview";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import {
  CompareBadges,
  CompareLine,
  compareData,
  useFieldCompare,
} from "../content/contentEditorCompare.tsx";
import { NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";
import { COLOR_TEXT, MODEL_TEXT, defaultModelOf } from "./buildingLookText.ts";
import { setLook } from "./buildingModel.ts";

/** 보기 조건(저장하지 않음) */
type ViewState = "ok" | "damaged" | "disabled" | "ruin";
const VIEW_STATES: readonly ViewState[] = ["ok", "damaged", "disabled", "ruin"];
const STATE_TEXT: Readonly<Record<ViewState, () => string>> = {
  ok: m.dev_buildings_look_state_ok,
  damaged: m.dev_buildings_look_state_damaged,
  disabled: m.dev_buildings_look_state_disabled,
  ruin: m.dev_buildings_look_state_ruin,
};

/** 세계 색(0~1 sRGB) → CSS 색. 견본만 쓴다(세계 색은 테마와 상관없다, D-070) */
const cssRgb = (rgb: readonly number[]): string =>
  `rgb(${rgb.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255)).join(" ")})`;

const formatM = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);

/** 편집기 미리 보기용 샘플 국가 시그니처 컬러·문양 6종(색 1~6 고를 때 깃발·배너 문양까지 함께 확인) */
const PREVIEW_EMBLEMS: readonly NationEmblemView[] = [
  {
    color: "#e6004c",
    spec: { shape: "shield", division: "chief", charge: "star", scheme: 0 },
    uploaded: null,
  },
  {
    color: "#1f7ae0",
    spec: { shape: "circle", division: "border", charge: "leaf", scheme: 1 },
    uploaded: null,
  },
  {
    color: "#22a05b",
    spec: { shape: "hexagon", division: "fess", charge: "wave", scheme: 0 },
    uploaded: null,
  },
  {
    color: "#8844d8",
    spec: { shape: "circle", division: "plain", charge: "mountain", scheme: 2 },
    uploaded: null,
  },
  {
    color: "#e69b17",
    spec: { shape: "banner", division: "chevron", charge: "crown", scheme: 0 },
    uploaded: null,
  },
  {
    color: "#eb6328",
    spec: { shape: "diamond", division: "quarterly", charge: "flame", scheme: 0 },
    uploaded: null,
  },
];

interface PreviewView {
  readonly level: number;
  readonly state: ViewState;
  readonly upgrading: boolean;
  readonly accent: number | null;
  readonly night: boolean;
}

/** 3D 미리 보기(캔버스 + 보기 조건 줄 + 크기 글) */
function LookPreview({ entry }: { entry: FacilityJson }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<BuildingPreview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [view, setView] = useState<PreviewView>({
    level: 1,
    state: "ok",
    upgrading: false,
    accent: null,
    night: false,
  });
  const [stats, setStats] = useState<{
    parts: number;
    widthM: number;
    depthM: number;
    heightM: number;
  } | null>(null);
  const width = entry.footprint?.width ?? 3;
  const depth = entry.footprint?.height ?? 3;
  const maxLevel = Math.min(entry.maxLevel ?? FACILITY_LEVEL_MAX, FACILITY_LEVEL_MAX);
  const art = entry.look;
  const previewEmblem = view.accent === null ? null : (PREVIEW_EMBLEMS[view.accent] ?? null);
  const input = useMemo(
    () => ({
      widthCells: width,
      depthCells: depth,
      seed: 7,
      look: {
        facility: entry.id,
        level: view.level,
        state: view.level === 0 ? ("building" as const) : view.state,
        upgrading: view.upgrading,
        accent: view.accent,
        accentColor: previewEmblem?.color ?? null,
        emblem: previewEmblem,
        art: art ?? null,
      },
    }),
    [width, depth, entry.id, view.level, view.state, view.upgrading, view.accent, previewEmblem, art],
  );
  // 시험·견주기용 표지: 미리 보기에 넣은 바닥·겉모습
  const key = JSON.stringify([width, depth, input.look]);

  // 처음 한 번: 엔진 조각을 받아 캔버스에 붙인다(크기는 ResizeObserver)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return () => undefined;
    let alive = true;
    let observer: ResizeObserver | null = null;
    void import("./buildingEditorPreview.ts").then(
      (module) => {
        if (!alive) return;
        try {
          const preview = new module.BuildingPreview(canvas);
          previewRef.current = preview;
          observer = new ResizeObserver(() => {
            preview.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
          });
          observer.observe(canvas);
          preview.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
          setStatus("ready");
        } catch {
          // WebGL이 없는 기기: 칸은 그대로 고칠 수 있다
          setStatus("failed");
        }
      },
      () => {
        if (alive) setStatus("failed");
      },
    );
    return () => {
      alive = false;
      observer?.disconnect();
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  // 겉모습·보기 조건이 바뀌면 다시 세운다(크기 글은 다음 틈에)
  const night = view.night;
  useEffect(() => {
    const preview = previewRef.current;
    if (status !== "ready" || !preview) return;
    const next = preview.set(input);
    preview.setNight(night ? 1 : 0);
    queueMicrotask(() => setStats(next));
  }, [input, status, night]);

  const onKey = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    const preview = previewRef.current;
    if (!preview) return;
    const step = 0.2;
    const actions: Readonly<Record<string, () => void>> = {
      ArrowLeft: () => preview.rotate(step, 0),
      ArrowRight: () => preview.rotate(-step, 0),
      ArrowUp: () => preview.rotate(0, step * 0.6),
      ArrowDown: () => preview.rotate(0, -step * 0.6),
      "+": () => preview.zoom(1 / 1.15),
      "=": () => preview.zoom(1 / 1.15),
      "-": () => preview.zoom(1.15),
      "0": () => preview.reset(),
      Home: () => preview.reset(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const modelName = MODEL_TEXT[entry.look?.model ?? defaultModelOf(entry.id)]();
  return (
    <div className="be-look-preview">
      <div className="be-look-stage" data-preview={status}>
        <canvas
          ref={canvasRef}
          className="be-look-canvas"
          // 키로 돌려 보는 그림(읽기 프로그램에는 이름과 키 안내를 준다)
          tabIndex={0}
          role="img"
          aria-label={m.dev_buildings_look_canvas_label({ model: modelName, width, depth })}
          aria-describedby="be-look-keys"
          data-look={key}
          data-parts={stats?.parts}
          onKeyDown={onKey}
        />
        {status === "loading" ? <p className="be-look-overlay">{m.dev_buildings_look_loading()}</p> : null}
        {status === "failed" ? <p className="be-look-overlay">{m.dev_buildings_look_failed()}</p> : null}
      </div>
      <p id="be-look-keys" className="be-look-keys">
        {m.dev_buildings_look_keys()}
      </p>
      {stats ? (
        <p className="be-look-stats" data-parts={stats.parts}>
          {m.dev_buildings_look_stats({
            width,
            depth,
            widthM: formatM(stats.widthM),
            depthM: formatM(stats.depthM),
            heightM: formatM(stats.heightM),
            parts: stats.parts,
          })}
        </p>
      ) : null}
      <div className="be-look-view" role="group" aria-label={m.dev_buildings_look_view_label()}>
        <div className="be-look-levels" role="group" aria-label={m.dev_buildings_look_level()}>
          {Array.from({ length: maxLevel + 1 }, (_, level) => (
            <button
              key={level}
              type="button"
              className="button-small"
              aria-pressed={view.level === level}
              onClick={() => setView({ ...view, level })}
            >
              {level === 0 ? m.dev_buildings_look_building() : m.dev_buildings_look_lv({ level })}
            </button>
          ))}
        </div>
        <label className="be-look-inline">
          <span>{m.dev_buildings_look_state()}</span>
          <select
            value={view.state}
            disabled={view.level === 0}
            onChange={(event) => {
              const next = VIEW_STATES.find((state) => state === event.target.value);
              if (next) setView({ ...view, state: next });
            }}
          >
            {VIEW_STATES.map((state) => (
              <option key={state} value={state}>
                {STATE_TEXT[state]()}
              </option>
            ))}
          </select>
        </label>
        <label className="be-look-inline">
          <span>{m.dev_buildings_look_accent()}</span>
          <select
            value={view.accent === null ? "" : String(view.accent)}
            onChange={(event) =>
              setView({ ...view, accent: event.target.value === "" ? null : Number(event.target.value) })
            }
          >
            <option value="">{m.dev_buildings_look_accent_none()}</option>
            {NATION_ACCENTS.map((_, index) => (
              <option key={`accent-${String(index)}`} value={String(index)}>
                {m.dev_buildings_look_accent_n({ n: index + 1 })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button-small"
          aria-pressed={view.upgrading}
          disabled={view.level === 0}
          onClick={() => setView({ ...view, upgrading: !view.upgrading })}
        >
          {m.dev_buildings_look_upgrading()}
        </button>
        <button
          type="button"
          className="button-small"
          aria-pressed={view.night}
          onClick={() => setView({ ...view, night: !view.night })}
        >
          {m.dev_buildings_look_night()}
        </button>
        <button type="button" className="button-small" onClick={() => previewRef.current?.reset()}>
          {m.dev_buildings_look_reset()}
        </button>
      </div>
    </div>
  );
}

/** 견주기 글의 색 이름(팩 값·지금 값) */
const colorLabelOf = (raw: string): string | undefined => {
  const color = FACILITY_LOOK_COLORS.find((item) => item === raw);
  return color ? COLOR_TEXT[color]() : undefined;
};

/** 색 견본 고르기(벽·지붕): "모델 기본" + 색 열다섯. 라디오 묶음이라 ←→로 옮긴다. path = 견주기 */
function SwatchField({
  label,
  path,
  value,
  onChange,
}: {
  label: string;
  path: string;
  value: FacilityLookColor | undefined;
  onChange: (value: FacilityLookColor | undefined) => void;
}) {
  const name = useId();
  const compare = useFieldCompare(path);

  return (
    <fieldset className="be-swatches ce-field" {...compareData(compare, compare?.problem !== undefined)}>
      <legend className="ce-field-head">
        <span className="field-label">{label}</span>
        <CompareBadges compare={compare} />
      </legend>
      <div className="be-swatch-row">
        <label className="be-swatch" data-default="">
          <input
            type="radio"
            name={name}
            checked={value === undefined}
            onChange={() => onChange(undefined)}
          />
          <span className="be-swatch-name">{m.dev_buildings_look_color_default()}</span>
        </label>
        {FACILITY_LOOK_COLORS.map((color) => (
          <label key={color} className="be-swatch" data-color={color} title={COLOR_TEXT[color]()}>
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
            />
            <span
              className="be-swatch-chip"
              aria-hidden="true"
              style={{ backgroundColor: cssRgb(BUILDING_COLORS[LOOK_COLORS[color]]) }}
            />
            <span className="visually-hidden">{COLOR_TEXT[color]()}</span>
          </label>
        ))}
      </div>
      <p className="be-swatch-current">
        {value === undefined ? m.dev_buildings_look_color_default() : COLOR_TEXT[value]()}
      </p>
      <CompareLine compare={compare} name={label} labelOf={colorLabelOf} />
      {compare?.problem ? <p className="field-error ce-problem">{compare.problem}</p> : null}
    </fieldset>
  );
}

const isModel = (value: string): value is FacilityLookModel =>
  FACILITY_LOOK_MODELS.some((model) => model === value);

export function BuildingLookSection({
  entry,
  onEdit,
}: {
  entry: FacilityJson;
  onEdit: (next: FacilityJson) => void;
}) {
  const look = entry.look;
  const fallback = defaultModelOf(entry.id);
  return (
    <FormSection
      name="look"
      className="be-section be-look"
      title={m.dev_buildings_section_look()}
      desc={m.dev_buildings_look_desc()}
      source="ADR 2026-11-08-building-art"
      paths={["footprint", "look"]}
    >
      <div className="be-look-body">
        <LookPreview entry={entry} />
        <div className="be-look-fields">
          <div className="be-grid be-grid-pair">
            <NumberField
              label={m.dev_buildings_field_footprint_w()}
              path="footprint.width"
              unit={m.dev_content_unit_tiles()}
              optional
              value={entry.footprint?.width}
              min={FACILITY_RUNTIME_LIMITS.footprint.min}
              max={FACILITY_RUNTIME_LIMITS.footprint.max}
              hint={m.dev_buildings_footprint_hint()}
              onChange={(width) =>
                onEdit({
                  ...entry,
                  footprint:
                    width === undefined ? undefined : { width, height: entry.footprint?.height ?? width },
                })
              }
            />
            <NumberField
              label={m.dev_buildings_field_footprint_h()}
              path="footprint.height"
              unit={m.dev_content_unit_tiles()}
              optional
              value={entry.footprint?.height}
              min={FACILITY_RUNTIME_LIMITS.footprint.min}
              max={FACILITY_RUNTIME_LIMITS.footprint.max}
              onChange={(height) =>
                onEdit({
                  ...entry,
                  footprint:
                    height === undefined ? undefined : { width: entry.footprint?.width ?? height, height },
                })
              }
            />
          </div>
          <div className="be-grid be-grid-pair">
            <SelectField
              label={m.dev_buildings_field_look_model()}
              path="look.model"
              value={look?.model ?? ""}
              desc={m.dev_buildings_look_model_desc()}
              options={[
                { value: "", label: m.dev_buildings_look_model_auto({ model: MODEL_TEXT[fallback]() }) },
                ...FACILITY_LOOK_MODELS.map((model) => ({ value: model, label: MODEL_TEXT[model]() })),
              ]}
              onChange={(model) => onEdit(setLook(entry, "model", isModel(model) ? model : undefined))}
            />
            <NumberField
              label={m.dev_buildings_field_look_height()}
              path="look.heightPm"
              unit="‰"
              optional
              value={look?.heightPm}
              min={FACILITY_LOOK_LIMITS.heightPm.min}
              max={FACILITY_LOOK_LIMITS.heightPm.max}
              hint={m.dev_buildings_look_height_hint()}
              onChange={(heightPm) => onEdit(setLook(entry, "heightPm", heightPm))}
            />
          </div>
          <SwatchField
            label={m.dev_buildings_field_look_wall()}
            path="look.wall"
            value={look?.wall}
            onChange={(wall) => onEdit(setLook(entry, "wall", wall))}
          />
          <SwatchField
            label={m.dev_buildings_field_look_roof()}
            path="look.roof"
            value={look?.roof}
            onChange={(roof) => onEdit(setLook(entry, "roof", roof))}
          />
          <p className="be-look-icon">{m.dev_buildings_look_icon_none()}</p>
        </div>
      </div>
    </FormSection>
  );
}
