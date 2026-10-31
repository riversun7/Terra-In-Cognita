// 설정 판 — 프리셋 6축 × 3단계, 세부 수치 슬라이더, 시드, 본 미리보기 해상도(ADR 38 2·3·4절)
// - 프리셋 단계마다 정하는 값을 함께 보인다(editorModel presetRows). 단계를 고르면 그 축의 덮어쓰기를 지운다.
// - 슬라이더 범위는 생성기 입력 확인과 같은 표(editorModel settingRows ← PLANET_SETTING_RANGES)에서 읽는다.
//   끄는 동안은 빠른 줄(F5, 미니맵), 놓으면(포인터·키를 뗌, 초점을 잃음) 본 줄(onCommit)로 만든다.
// - "배치 바뀜" 표시: 바꾸면 땅·바다 배치가 새로 바뀌는 값.
// - 해상도: F6~상한. F9는 확인 창(부모), F8 이상이 도는 동안 [멈춤]. 꺼짐 감지가 낮춘 기기 상한과 [다시 허용].
import { PLANET_GENERATOR_FACE_LEVELS } from "@terra/shared";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AXIS_LABELS, SETTING_LABELS, formatNumber, levelLabel, settingValue } from "./editorMessages.ts";
import {
  type DraftEntry,
  entrySeed,
  presetRows,
  settingRows,
  withPreset,
  withSeed,
  withSetting,
  withoutSetting,
} from "./editorModel.ts";
import { parseSeedText, randomSeed } from "./editorView.ts";
import {
  DEFAULT_FINAL_LEVEL,
  HEAVY_PREVIEW_LEVEL,
  type PreviewLane,
  type PreviewLevels,
} from "./previewJobs.ts";

export interface SettingsPanelProps {
  readonly entry: DraftEntry | null;
  /** 읽기 전용 사실(정의 면 레벨·바이옴 수) */
  readonly faceLevel: number;
  readonly biomeCount: number;
  readonly levels: PreviewLevels;
  readonly finalLevel: number;
  /** 본 줄이 무거운 레벨을 도는 중(멈춤 버튼) */
  readonly heavyRunning: boolean;
  readonly deviceCap: number | null;
  readonly tripped: number | null;
  readonly onEdit: (next: DraftEntry, lane: PreviewLane | "both") => void;
  readonly onCommit: () => void;
  readonly onFinalLevel: (level: number) => void;
  readonly onCancelRun: () => void;
  readonly onAllowAgain: () => void;
}

/** 프리셋 축 하나 */
function PresetGroup({
  entry,
  axis,
  onEdit,
}: {
  entry: DraftEntry;
  axis: ReturnType<typeof presetRows>[number];
  onEdit: SettingsPanelProps["onEdit"];
}) {
  const name = useId();
  return (
    <fieldset className="pe-preset">
      <legend className="pe-preset-legend">
        {AXIS_LABELS[axis.axis]()}
        {axis.relayout ? <span className="pe-tag">{m.planet_editor_relayout()}</span> : null}
      </legend>
      <div className="pe-choices">
        {axis.choices.map((choice) => {
          const id = `${name}-${choice.level}`;
          return (
            <label key={choice.level} className="pe-choice" htmlFor={id}>
              <input
                id={id}
                type="radio"
                className="pe-choice-input"
                name={name}
                value={choice.level}
                checked={axis.level === choice.level}
                onChange={() => onEdit(withPreset(entry, axis.axis, choice.level), "both")}
              />
              <span className="pe-choice-face">
                <span className="pe-choice-name">{levelLabel(choice.level)}</span>
                {Object.entries(choice.values).map(([key, value]) =>
                  isSettingKey(key) && typeof value === "number" ? (
                    <span key={key} className="pe-choice-value">
                      {SETTING_LABELS[key].name()} {settingValue(key, value)}
                    </span>
                  ) : null,
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function isSettingKey(key: string): key is keyof typeof SETTING_LABELS {
  return Object.hasOwn(SETTING_LABELS, key);
}

/** 시드 입력: 글로 받고 [적용]·Enter로 바꾼다(u32라 숫자 입력칸의 범위 문제를 피한다) */
function SeedField({ entry, onEdit }: { entry: DraftEntry; onEdit: SettingsPanelProps["onEdit"] }) {
  const current = (() => {
    try {
      return entrySeed(entry);
    } catch {
      return null;
    }
  })();
  const [text, setText] = useState(current === null ? "" : String(current));
  const [shownSeed, setShownSeed] = useState(current);
  const id = useId();
  // 밖에서 시드가 바뀌면(되돌리기·가져오기) 글을 맞춘다(그리는 중 상태 맞추기, 효과 대신)
  if (current !== shownSeed) {
    setShownSeed(current);
    setText(current === null ? "" : String(current));
  }
  const parsed = parseSeedText(text);
  const invalid = text.trim() !== "" && parsed === null;
  const apply = (value: number | null): void => {
    if (value === null || value === current) return;
    onEdit(withSeed(entry, value), "both");
  };
  return (
    <div className="field pe-seed">
      <label className="field-label" htmlFor={id}>
        {m.planet_editor_seed()}
      </label>
      <div className="pe-seed-row">
        <input
          id={id}
          className="input pe-seed-input"
          name="seed"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") apply(parsed);
          }}
        />
        <button type="button" className="button-small" onClick={() => apply(parsed)} aria-disabled={invalid}>
          {m.planet_editor_seed_apply()}
        </button>
        <button type="button" className="button-small" onClick={() => apply(randomSeed())}>
          {m.planet_editor_seed_random()}
        </button>
      </div>
      <p id={`${id}-hint`} className={invalid ? "field-error" : "field-hint"}>
        {invalid ? m.planet_editor_seed_invalid() : m.planet_editor_seed_hint()}
      </p>
    </div>
  );
}

function levelOptionText(level: number, levels: PreviewLevels): string {
  const label = { level: String(level) };
  if (level === PLANET_GENERATOR_FACE_LEVELS[1]) return m.planet_editor_level_bake(label);
  if (level >= HEAVY_PREVIEW_LEVEL) return m.planet_editor_level_heavy(label);
  if (level === Math.min(DEFAULT_FINAL_LEVEL, levels.cap)) return m.planet_editor_level_default(label);
  return m.planet_editor_level_option(label);
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { entry, levels, finalLevel, onEdit, onCommit } = props;
  const levelId = useId();
  const rows = entry ? safeRows(entry) : null;
  return (
    <div className="pe-stack">
      <p className="field-hint">
        {m.planet_editor_facts({
          level: String(props.faceLevel),
          count: formatNumber(props.biomeCount),
        })}
      </p>
      <div className="field">
        <label className="field-label" htmlFor={levelId}>
          {m.planet_editor_level()}
        </label>
        <div className="pe-seed-row">
          <select
            id={levelId}
            className="pe-level-select"
            value={finalLevel}
            onChange={(event) => props.onFinalLevel(Number(event.target.value))}
            aria-describedby={`${levelId}-hint`}
          >
            {levels.finalChoices.map((level) => (
              <option key={level} value={level}>
                {levelOptionText(level, levels)}
              </option>
            ))}
          </select>
          {props.heavyRunning ? (
            <button type="button" className="button-small" onClick={props.onCancelRun}>
              {m.planet_editor_cancel_run()}
            </button>
          ) : null}
        </div>
        <p id={`${levelId}-hint`} className="field-hint">
          {m.planet_editor_level_hint()}
        </p>
        {props.deviceCap !== null ? (
          <div className="message message-info pe-cap" role="status">
            <div className="message-body">
              <p>
                {props.tripped !== null
                  ? m.planet_editor_device_cap_tripped({
                      tripped: String(props.tripped),
                      cap: String(props.deviceCap),
                    })
                  : m.planet_editor_device_cap({ cap: String(props.deviceCap) })}
              </p>
              <button type="button" className="button-small" onClick={props.onAllowAgain}>
                {m.planet_editor_allow_again()}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {entry && rows ? (
        <>
          <SeedField entry={entry} onEdit={onEdit} />
          <section className="pe-section" aria-labelledby={`${levelId}-presets`}>
            <h2 id={`${levelId}-presets`} className="section-title">
              {m.planet_editor_presets()}
            </h2>
            {rows.presets.map((axis) => (
              <PresetGroup key={axis.axis} entry={entry} axis={axis} onEdit={onEdit} />
            ))}
          </section>
          <section className="pe-section" aria-labelledby={`${levelId}-details`}>
            <h2 id={`${levelId}-details`} className="section-title">
              {m.planet_editor_details()}
            </h2>
            <p className="field-hint">
              {m.planet_editor_details_hint({ level: String(finalLevel), quick: String(levels.quick) })}
            </p>
            {rows.settings.map((row) => {
              const id = `${levelId}-${row.key}`;
              const name = SETTING_LABELS[row.key].name();
              return (
                <div key={row.key} className="pe-slider" data-overridden={row.overridden}>
                  <div className="pe-slider-head">
                    <label htmlFor={id} className="pe-slider-name">
                      {name}
                      {row.relayout ? <span className="pe-tag">{m.planet_editor_relayout()}</span> : null}
                    </label>
                    <output htmlFor={id} className="pe-slider-value">
                      {settingValue(row.key, row.value)}
                    </output>
                  </div>
                  <input
                    id={id}
                    type="range"
                    className="pe-range"
                    min={row.min}
                    max={row.max}
                    step={1}
                    value={row.value}
                    data-key={row.key}
                    aria-valuetext={settingValue(row.key, row.value)}
                    onChange={(event) =>
                      onEdit(withSetting(entry, row.key, Number(event.target.value)), "quick")
                    }
                    onPointerUp={onCommit}
                    onKeyUp={onCommit}
                    onBlur={onCommit}
                  />
                  <div className="pe-slider-foot">
                    <span className="field-hint">
                      {m.planet_editor_preset_value({ value: settingValue(row.key, row.presetValue) })}
                    </span>
                    {row.overridden ? (
                      <button
                        type="button"
                        className="button-text"
                        aria-label={m.planet_editor_reset_label({ name })}
                        onClick={() => onEdit(withoutSetting(entry, row.key), "both")}
                      >
                        {m.planet_editor_reset()}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}

/** 항목이 틀리면(서버에 남은 옛 초안 등) 판을 그리지 않는다(초안 판이 받지 않음 상태를 알린다) */
function safeRows(entry: DraftEntry) {
  try {
    return { presets: presetRows(entry), settings: settingRows(entry) };
  } catch {
    return null;
  }
}
