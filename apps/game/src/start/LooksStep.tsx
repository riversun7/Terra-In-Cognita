// 첫 접속 2단계 — 외형(D-6040 "전부다": 프리셋·무작위·부위·색이 한 화면). 3D 로우폴리 캐릭터를 조립한다.
// docs/adr/2026-11-11-character-3d.md 3절(사용자 요청 2026-11-11 "캐릭터 생성을 더 다양한 프리셋과 폴리곤 3d로").
// - 위: 3D 미리 보기(CharacterPreviewPane.tsx — 끌어 돌리기·확대·돌림판·걷기·낮밤), [무작위]·[되돌리기].
// - 아래: 탭(프리셋·몸·머리·옷·장식·색). 프리셋은 썸네일 갤러리(같은 그리기로 만든 그림, 만들기 전·못 만들면 무늬 없는 실루엣),
//   부위 칸은 앞·뒤 넘기기 + 그 칸만 다시 뽑기 + 잠그기, 색은 칠할 곳을 고르고 견본 20개에서 고른다.
// - 무작위는 꾸밈이라 기기 난수로 씨앗을 뽑는다(서버는 ID·범위만 본다). 잠근 칸은 [무작위]에서 바뀌지 않는다.
// - [되돌리기]는 바로 앞 외형으로(20번까지).
import {
  CHARACTER_COLORS,
  CHARACTER_COLOR_IDS,
  CHARACTER_COLOR_SLOTS,
  CHARACTER_PRESETS,
  type CharacterColorSlot,
  type CharacterLook,
  type CharacterLookKey,
  characterLookChoices,
  characterLookKey,
  rerollCharacterLook,
  sameCharacterLook,
  stepCharacterLook,
} from "@terra/shared/characterLook";
import { useEffect, useId, useState } from "react";
import { CyborgSilhouette } from "../cyborg/CyborgSilhouette.tsx";
import { m } from "../paraglide/messages.js";
import { TabList, panelId, tabId } from "../sections/screenParts.tsx";
import { loadPreviewEngine } from "../cyborg/previewEngine.ts";
import { CharacterPreviewPane } from "./CharacterPreviewPane.tsx";
import { colorSlotText, lookColorText, lookKeyText, lookPresetText, lookValueText } from "./lookText.ts";
import "./looks.css";

const LOOK_TABS = ["presets", "body", "head", "outfit", "gear", "colors"] as const;
type LookTab = (typeof LOOK_TABS)[number];

/** 탭마다 부위 칸 */
const TAB_KEYS: Readonly<Record<Exclude<LookTab, "presets" | "colors">, readonly CharacterLookKey[]>> = {
  body: ["build", "height", "plating"],
  head: ["head", "face", "top"],
  outfit: ["torso", "arms", "legs"],
  gear: ["back", "extra"],
};

const TAB_NAMES = {
  presets: m.start_looks_tab_presets,
  body: m.start_looks_tab_body,
  head: m.start_looks_tab_head,
  outfit: m.start_looks_tab_outfit,
  gear: m.start_looks_tab_gear,
  colors: m.start_looks_tab_colors,
} satisfies Record<LookTab, () => string>;

/** [되돌리기]로 돌아갈 수 있는 걸음 수 */
const HISTORY_LIMIT = 20;
/** 썸네일 한 변(CSS px) */
const THUMB_PX = 72;

function randomSeed(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

/** 프리셋 썸네일(외형 표지 → PNG data URL). 한 번 만들면 화면을 다시 열어도 쓴다 */
let presetThumbs: ReadonlyMap<string, string> | null = null;

/** 프리셋 썸네일을 만든다(미리 보기 엔진 조각을 받은 뒤 한 번). 만들지 못하면 failed — 무늬 없는 실루엣이 남는다 */
function usePresetThumbnails(): { thumbs: ReadonlyMap<string, string> | null; failed: boolean } {
  const [thumbs, setThumbs] = useState(presetThumbs);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (presetThumbs) return undefined;
    let closed = false;
    void loadPreviewEngine()
      .then((engine) => {
        if (closed || presetThumbs) return;
        const looks = CHARACTER_PRESETS.map((preset) => preset.look);
        const urls = engine.renderCharacterThumbnails(looks, THUMB_PX, window.devicePixelRatio || 1);
        presetThumbs = new Map(looks.map((look, index) => [characterLookKey(look), urls[index] ?? ""]));
        setThumbs(presetThumbs);
      })
      .catch(() => {
        if (!closed) setFailed(true);
      });
    return () => {
      closed = true;
    };
  }, []);
  return { thumbs, failed };
}

function DiceIcon() {
  return (
    <svg className="start-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      <circle cx="15" cy="15" r="1.5" fill="currentColor" />
      <circle cx="15" cy="9" r="1.5" fill="currentColor" />
      <circle cx="9" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg className="start-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="5"
        y="11"
        width="14"
        height="9"
        rx="2"
        fill={locked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d={locked ? "M8 11V8a4 4 0 0 1 8 0v3" : "M8 11V8a4 4 0 0 1 7.5-2"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface RowTools {
  readonly look: CharacterLook;
  readonly locked: ReadonlySet<CharacterLookKey>;
  readonly onChange: (next: CharacterLook) => void;
  readonly onLock: (key: CharacterLookKey) => void;
}

/** 다시 뽑기·잠그기 단추 한 쌍 */
function RowButtons({ lookKey, look, locked, onChange, onLock }: RowTools & { lookKey: CharacterLookKey }) {
  const name = lookKeyText(lookKey);
  const isLocked = locked.has(lookKey);
  return (
    <>
      <button
        type="button"
        className="button-small start-part-step start-part-reroll"
        aria-label={m.start_looks_reroll({ slot: name })}
        onClick={() => onChange(rerollCharacterLook(look, randomSeed(), locked, lookKey))}
      >
        <DiceIcon />
      </button>
      <button
        type="button"
        className="button-small start-part-step start-part-lock"
        aria-label={m.start_looks_lock({ slot: name })}
        aria-pressed={isLocked}
        onClick={() => onLock(lookKey)}
      >
        <LockIcon locked={isLocked} />
      </button>
    </>
  );
}

/** 부위 칸 한 줄: 이름·지금 값(n/N) + 앞·뒤 + 다시 뽑기 + 잠그기 */
function PartRow({ lookKey, ...tools }: RowTools & { lookKey: CharacterLookKey }) {
  const { look, onChange } = tools;
  const name = lookKeyText(lookKey);
  const choices = characterLookChoices(lookKey);
  const at = Math.max(0, choices.indexOf(look[lookKey])) + 1;
  return (
    <div className="start-part" data-slot={lookKey}>
      <div className="start-part-text">
        <span className="start-part-name">{name}</span>
        <span className="start-part-value" aria-live="polite">
          {m.start_looks_part_of({
            name: lookValueText(look, lookKey),
            index: String(at),
            count: String(choices.length),
          })}
        </span>
      </div>
      <button
        type="button"
        className="button-small start-part-step"
        aria-label={m.start_looks_prev({ slot: name })}
        onClick={() => onChange(stepCharacterLook(look, lookKey, -1))}
      >
        ‹
      </button>
      <button
        type="button"
        className="button-small start-part-step"
        aria-label={m.start_looks_next({ slot: name })}
        onClick={() => onChange(stepCharacterLook(look, lookKey, 1))}
      >
        ›
      </button>
      <RowButtons lookKey={lookKey} {...tools} />
    </div>
  );
}

export function LooksStep({ look, onLook }: { look: CharacterLook; onLook: (next: CharacterLook) => void }) {
  const id = useId();
  const [tab, setTab] = useState<LookTab>("presets");
  const [locked, setLocked] = useState<ReadonlySet<CharacterLookKey>>(() => new Set());
  const [history, setHistory] = useState<readonly CharacterLook[]>([]);
  const [colorSlot, setColorSlot] = useState<CharacterColorSlot>("primary");
  const { thumbs, failed: thumbsFailed } = usePresetThumbnails();

  const change = (next: CharacterLook): void => {
    if (sameCharacterLook(next, look)) return;
    setHistory((list) => [...list.slice(-(HISTORY_LIMIT - 1)), look]);
    onLook(next);
  };
  const undo = (): void => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((list) => list.slice(0, -1));
    onLook(previous);
  };
  const toggleLock = (key: CharacterLookKey): void =>
    setLocked((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const tools: RowTools = { look, locked, onChange: change, onLock: toggleLock };

  return (
    <div className="start-looks">
      <div className="start-looks-preview">
        <CharacterPreviewPane look={look} />
        <div className="start-looks-actions">
          <button
            type="button"
            className="button-secondary start-random"
            onClick={() => change(rerollCharacterLook(look, randomSeed(), locked))}
          >
            {m.start_looks_random()}
          </button>
          <button
            type="button"
            className="button-secondary start-undo"
            disabled={history.length === 0}
            onClick={undo}
          >
            {m.start_looks_undo()}
          </button>
        </div>
      </div>
      <TabList
        label={m.start_looks_tabs()}
        prefix={id}
        tabs={LOOK_TABS.map((entry) => ({ id: entry, name: TAB_NAMES[entry]() }))}
        selected={tab}
        onSelect={setTab}
        formatCount={String}
      />
      <div
        className="start-looks-panel"
        role="tabpanel"
        id={panelId(id, tab)}
        aria-labelledby={tabId(id, tab)}
        data-tab={tab}
      >
        {tab === "presets" ? (
          <div className="start-presets">
            {CHARACTER_PRESETS.map((preset) => {
              const thumb = thumbs?.get(characterLookKey(preset.look));
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="start-preset"
                  data-preset={preset.id}
                  aria-pressed={sameCharacterLook(preset.look, look)}
                  onClick={() => change(preset.look)}
                >
                  {thumb ? (
                    <img
                      className="start-preset-face"
                      src={thumb}
                      alt=""
                      width={THUMB_PX}
                      height={THUMB_PX}
                    />
                  ) : (
                    <CyborgSilhouette framing="face" pending={!thumbsFailed} className="start-preset-face" />
                  )}
                  <span>{lookPresetText(preset.id)}</span>
                </button>
              );
            })}
          </div>
        ) : tab === "colors" ? (
          <div className="start-colors">
            <div className="start-color-slots" role="radiogroup" aria-label={m.start_looks_color_slot()}>
              {CHARACTER_COLOR_SLOTS.map((slot) => (
                <label key={slot} className="start-color-slot" data-slot={slot}>
                  <input
                    type="radio"
                    name={`${id}-color-slot`}
                    checked={colorSlot === slot}
                    onChange={() => setColorSlot(slot)}
                  />
                  <span
                    className="start-color-dot"
                    aria-hidden="true"
                    style={{ background: CHARACTER_COLORS[look[slot]] }}
                  />
                  <span>{colorSlotText(slot)}</span>
                </label>
              ))}
            </div>
            <div className="start-color-tools">
              <span className="start-part-value" aria-live="polite">
                {m.start_looks_part_of({
                  name: lookColorText(look[colorSlot]),
                  index: String(CHARACTER_COLOR_IDS.indexOf(look[colorSlot]) + 1),
                  count: String(CHARACTER_COLOR_IDS.length),
                })}
              </span>
              <RowButtons lookKey={colorSlot} {...tools} />
            </div>
            {/* 칠 색은 세계의 색(테마와 상관없다)이라 CSS 값이 아니라 목록 값을 바로 쓴다 */}
            <div className="start-swatches" role="radiogroup" aria-label={colorSlotText(colorSlot)}>
              {CHARACTER_COLOR_IDS.map((color) => (
                <label key={color} className="start-swatch" data-color={color}>
                  <input
                    type="radio"
                    name={`${id}-swatch`}
                    checked={look[colorSlot] === color}
                    onChange={() => change({ ...look, [colorSlot]: color })}
                  />
                  <span
                    className="start-swatch-chip"
                    aria-hidden="true"
                    style={{ background: CHARACTER_COLORS[color] }}
                  />
                  <span className="visually-hidden">{lookColorText(color)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="start-parts">
            {TAB_KEYS[tab].map((key) => (
              <PartRow key={key} lookKey={key} {...tools} />
            ))}
            <p className="start-hint">{m.start_looks_lock_hint()}</p>
          </div>
        )}
      </div>
      <p className="start-hint">{m.start_looks_note()}</p>
    </div>
  );
}
