// 개발자 시안 모음(/dev/mockups?tab=character) — 게임형 3D 캐릭터(V2) 생성 테스트 페이지.
// 기존 CharacterLook(v2) 스키마의 모든 부위·색·프리셋 다양성을 100% 유지하면서, V2 게임형 모델과 기존 V1 로우폴리 모델을 실시간 비교 테스트한다.
// 파일 앞머리 MockupsGallery*로 Vite가 개발자 전용 지연 조각으로 묶어 PWA 미리 캐시에서 자동 제외한다.
import {
  CHARACTER_COLORS,
  CHARACTER_COLOR_IDS,
  CHARACTER_COLOR_SLOTS,
  CHARACTER_PRESETS,
  type CharacterColorId,
  type CharacterColorSlot,
  type CharacterLook,
  type CharacterLookKey,
  DEFAULT_CHARACTER_LOOK,
  characterLookChoices,
  characterLookKey,
  rerollCharacterLook,
  sameCharacterLook,
} from "@terra/shared/characterLook";
import {
  CharacterStudio,
  type CharacterStudioStats,
  type HeroPoseId,
  type StudioCameraPreset,
  type StudioLighting,
  type StudioModelMode,
  renderHeroThumbnails,
} from "@terra/engine/characterStudio";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CyborgSilhouette } from "../../cyborg/CyborgSilhouette.tsx";
import { m } from "../../paraglide/messages.js";
import {
  colorSlotText,
  lookColorText,
  lookKeyText,
  lookPresetText,
  lookValueText,
} from "../../start/lookText.ts";
import "./mockupsCharacter.css";

type CreatorTab = "presets" | "body" | "head" | "outfit" | "gear" | "colors";

const CREATOR_TABS: readonly CreatorTab[] = ["presets", "body", "head", "outfit", "gear", "colors"];

const TAB_KEYS: Readonly<Record<Exclude<CreatorTab, "presets" | "colors">, readonly CharacterLookKey[]>> = {
  body: ["build", "height", "plating"],
  head: ["head", "face", "top"],
  outfit: ["torso", "arms", "legs"],
  gear: ["back", "extra"],
};

const TAB_CAMERA: Readonly<Record<CreatorTab, StudioCameraPreset>> = {
  presets: "full",
  body: "full",
  head: "head",
  outfit: "full",
  gear: "back",
  colors: "full",
};

interface ColorTheme {
  readonly id: string;
  readonly label: () => string;
  readonly skin: CharacterColorId;
  readonly primary: CharacterColorId;
  readonly secondary: CharacterColorId;
  readonly accent: CharacterColorId;
  readonly glow: CharacterColorId;
}

const COLOR_THEMES: readonly ColorTheme[] = [
  {
    id: "cyber_mint",
    label: m.dev_mockups_char_theme_mint,
    skin: "cream",
    primary: "teal",
    secondary: "charcoal",
    accent: "lemon",
    glow: "mint",
  },
  {
    id: "crimson_vanguard",
    label: m.dev_mockups_char_theme_crimson,
    skin: "clay",
    primary: "crimson",
    secondary: "charcoal",
    accent: "orange",
    glow: "coral",
  },
  {
    id: "orbital_gold",
    label: m.dev_mockups_char_theme_orbital,
    skin: "silver",
    primary: "azure",
    secondary: "slate",
    accent: "lemon",
    glow: "sky",
  },
  {
    id: "stealth_obsidian",
    label: m.dev_mockups_char_theme_stealth,
    skin: "slate",
    primary: "charcoal",
    secondary: "indigo",
    accent: "teal",
    glow: "mint",
  },
  {
    id: "arctic_white",
    label: m.dev_mockups_char_theme_arctic,
    skin: "peach",
    primary: "cream",
    secondary: "silver",
    accent: "azure",
    glow: "sky",
  },
  {
    id: "neon_valkyrie",
    label: m.dev_mockups_char_theme_valkyrie,
    skin: "lilac",
    primary: "plum",
    secondary: "charcoal",
    accent: "rose",
    glow: "rose",
  },
];

const HISTORY_LIMIT = 24;
const THUMB_PX = 84;

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}

let cachedHeroThumbs: ReadonlyMap<string, string> | null = null;

function useHeroPresetThumbnails(): { thumbs: ReadonlyMap<string, string> | null; failed: boolean } {
  const [thumbs, setThumbs] = useState(cachedHeroThumbs);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cachedHeroThumbs) return undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled || cachedHeroThumbs) return;
      try {
        const looks = CHARACTER_PRESETS.map((preset) => preset.look);
        const urls = renderHeroThumbnails(looks, THUMB_PX, Math.min(2, window.devicePixelRatio || 1));
        cachedHeroThumbs = new Map(looks.map((entry, idx) => [characterLookKey(entry), urls[idx] ?? ""]));
        setThumbs(cachedHeroThumbs);
      } catch {
        if (!cancelled) setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return { thumbs, failed };
}

function tabLabel(tab: CreatorTab): string {
  switch (tab) {
    case "presets":
      return m.start_looks_tab_presets();
    case "body":
      return m.start_looks_tab_body();
    case "head":
      return m.start_looks_tab_head();
    case "outfit":
      return m.start_looks_tab_outfit();
    case "gear":
      return m.start_looks_tab_gear();
    case "colors":
      return m.start_looks_tab_colors();
    default: {
      const unknown: never = tab;
      return unknown;
    }
  }
}

export default function MockupsGalleryCharacterTab() {
  const id = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const studioRef = useRef<CharacterStudio | null>(null);

  const [look, setLook] = useState<CharacterLook>(DEFAULT_CHARACTER_LOOK);
  const [callsign, setCallsign] = useState("Vanguard-01");
  const [tab, setTab] = useState<CreatorTab>("presets");
  const [colorSlot, setColorSlot] = useState<CharacterColorSlot>("primary");
  const [locked, setLocked] = useState<ReadonlySet<CharacterLookKey>>(() => new Set());
  const [history, setHistory] = useState<readonly CharacterLook[]>([]);

  const [modelMode, setModelMode] = useState<StudioModelMode>("hero");
  const [pose, setPose] = useState<HeroPoseId>("idle");
  const [lighting, setLighting] = useState<StudioLighting>("studio");
  const [cameraPreset, setCameraPreset] = useState<StudioCameraPreset>("full");
  const [turntable, setTurntable] = useState(false);
  const [autoFocus, setAutoFocus] = useState(true);
  const [stats, setStats] = useState<CharacterStudioStats | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const { thumbs, failed: thumbsFailed } = useHeroPresetThumbnails();

  const updateLook = useCallback(
    (next: CharacterLook) => {
      if (sameCharacterLook(next, look)) return;
      setHistory((list) => [...list.slice(-(HISTORY_LIMIT - 1)), look]);
      setLook(next);
    },
    [look],
  );

  const undo = (): void => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((list) => list.slice(0, -1));
    setLook(prev);
  };

  const toggleLock = (key: CharacterLookKey): void => {
    setLocked((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const selectTab = (next: CreatorTab): void => {
    setTab(next);
    if (autoFocus) {
      const preset = TAB_CAMERA[next];
      setCameraPreset(preset);
      studioRef.current?.focusCamera(preset);
    }
  };

  const focusCamera = (preset: StudioCameraPreset): void => {
    setCameraPreset(preset);
    studioRef.current?.focusCamera(preset);
  };

  const copyLookJson = (): void => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(JSON.stringify(look, null, 2)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  // 스튜디오 초기화 + 리사이즈 감지
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let disposed = false;
    let studio: CharacterStudio;
    try {
      studio = new CharacterStudio(canvas);
    } catch {
      queueMicrotask(() => {
        if (!disposed) setWebglFailed(true);
      });
      return () => {
        disposed = true;
      };
    }
    studioRef.current = studio;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    studio.setAnimate(!reduced);

    const syncSize = (): void => {
      const rect = canvas.getBoundingClientRect();
      studio.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(canvas);

    return () => {
      disposed = true;
      observer.disconnect();
      studio.dispose();
      studioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const studio = studioRef.current;
    if (!studio) return undefined;
    const nextStats = studio.setLook(look);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStats(nextStats);
    });
    return () => {
      cancelled = true;
    };
  }, [look]);

  useEffect(() => {
    const studio = studioRef.current;
    if (!studio) return undefined;
    const nextStats = studio.setMode(modelMode);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStats(nextStats);
    });
    return () => {
      cancelled = true;
    };
  }, [modelMode]);

  useEffect(() => {
    studioRef.current?.setPose(pose);
  }, [pose]);

  useEffect(() => {
    studioRef.current?.setLighting(lighting);
  }, [lighting]);

  useEffect(() => {
    studioRef.current?.setTurntable(turntable);
  }, [turntable]);

  return (
    <div className="char-studio-shell">
      <div className="panel char-studio-banner">
        <div className="char-studio-banner-text">
          <span className="mockups-badge">CHARACTER STUDIO · V2</span>
          <h2 className="section-title">{m.dev_mockups_char_title()}</h2>
          <p className="field-hint">{m.dev_mockups_char_desc()}</p>
        </div>
        <div className="char-studio-banner-actions">
          <label className="char-studio-toggle-check">
            <input type="checkbox" checked={autoFocus} onChange={(e) => setAutoFocus(e.target.checked)} />
            <span>{m.dev_mockups_char_autofocus()}</span>
          </label>
          <button type="button" className="button-small" onClick={copyLookJson}>
            {copied ? m.dev_mockups_char_copied() : m.dev_mockups_char_copy_json()}
          </button>
        </div>
      </div>

      <div className="char-studio-grid">
        {/* 좌측: 3D 시네마틱 스튜디오 뷰포트 */}
        <section className="panel char-stage-panel" aria-label={m.dev_mockups_char_stage_label()}>
          <div className="char-stage-topbar">
            <div className="char-seg-group" role="group" aria-label={m.dev_mockups_char_model_mode()}>
              <button
                type="button"
                className="button-small char-seg-btn"
                aria-pressed={modelMode === "hero"}
                onClick={() => setModelMode("hero")}
              >
                {m.dev_mockups_char_mode_v2()}
              </button>
              <button
                type="button"
                className="button-small char-seg-btn"
                aria-pressed={modelMode === "legacy"}
                onClick={() => setModelMode("legacy")}
              >
                {m.dev_mockups_char_mode_v1()}
              </button>
            </div>
            <div className="char-seg-group" role="group" aria-label={m.dev_mockups_char_lighting()}>
              {(["studio", "day", "night"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className="button-small char-seg-btn"
                  aria-pressed={lighting === entry}
                  onClick={() => setLighting(entry)}
                >
                  {entry === "studio"
                    ? m.dev_mockups_char_light_studio()
                    : entry === "day"
                      ? m.dev_mockups_char_light_day()
                      : m.dev_mockups_char_light_night()}
                </button>
              ))}
            </div>
          </div>

          <div className="char-canvas-wrap">
            {webglFailed ? (
              <div className="char-webgl-fallback">
                <CyborgSilhouette framing="body" pending={false} />
                <p className="field-hint">{m.dev_mockups_char_no_webgl()}</p>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className="char-studio-canvas"
                aria-label={m.dev_mockups_char_stage_label()}
              />
            )}
            <div className="char-callsign-plate" aria-hidden="true">
              <span className="char-callsign-name">{callsign.trim() || "CYBORG"}</span>
              <span className="char-callsign-meta">
                {lookValueText(look, "build")} · {lookValueText(look, "height")} ·{" "}
                {lookValueText(look, "plating")}
              </span>
            </div>
          </div>

          <div className="char-stage-controls">
            <div className="char-control-row">
              <span className="char-control-label">{m.dev_mockups_char_camera()}</span>
              <div className="char-seg-group">
                {(["full", "upper", "head", "back"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="button-small char-seg-btn"
                    aria-pressed={cameraPreset === preset}
                    onClick={() => focusCamera(preset)}
                  >
                    {preset === "full"
                      ? m.dev_mockups_char_cam_full()
                      : preset === "upper"
                        ? m.dev_mockups_char_cam_upper()
                        : preset === "head"
                          ? m.dev_mockups_char_cam_head()
                          : m.dev_mockups_char_cam_back()}
                  </button>
                ))}
              </div>
            </div>

            <div className="char-control-row">
              <span className="char-control-label">{m.dev_mockups_char_pose()}</span>
              <div className="char-seg-group">
                {(["idle", "combat", "walk", "inspect"] as const).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className="button-small char-seg-btn"
                    aria-pressed={pose === entry}
                    onClick={() => setPose(entry)}
                  >
                    {entry === "idle"
                      ? m.dev_mockups_char_pose_idle()
                      : entry === "combat"
                        ? m.dev_mockups_char_pose_combat()
                        : entry === "walk"
                          ? m.dev_mockups_char_pose_walk()
                          : m.dev_mockups_char_pose_inspect()}
                  </button>
                ))}
                <button
                  type="button"
                  className="button-small char-seg-btn"
                  aria-pressed={turntable}
                  onClick={() => setTurntable((prev) => !prev)}
                >
                  {m.dev_mockups_char_turntable()}
                </button>
              </div>
            </div>
          </div>

          <div className="char-stage-footer">
            <div className="char-stage-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => updateLook(rerollCharacterLook(look, randomSeed(), locked))}
              >
                {m.start_looks_random()}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={history.length === 0}
                onClick={undo}
              >
                {m.start_looks_undo()}
              </button>
            </div>
            {stats ? (
              <p className="char-stage-stats">
                {m.dev_mockups_char_stats({
                  parts: String(stats.parts),
                  tris: String(stats.triangles),
                  height: stats.heightM.toFixed(2),
                })}
              </p>
            ) : null}
          </div>
        </section>

        {/* 우측: 게임형 캐릭터 커스터마이징 콘솔 */}
        <section className="panel char-editor-panel" aria-label={m.dev_mockups_char_editor_label()}>
          <div className="char-identity-bar">
            <label className="char-callsign-field" htmlFor={`${id}-callsign`}>
              <span className="char-control-label">{m.dev_mockups_char_callsign()}</span>
              <input
                id={`${id}-callsign`}
                type="text"
                maxLength={24}
                value={callsign}
                onChange={(event) => setCallsign(event.target.value)}
                placeholder="Vanguard-01"
              />
            </label>
          </div>

          <div className="char-cat-tabs" role="tablist" aria-label={m.start_looks_tabs()}>
            {CREATOR_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={tab === entry}
                className="char-cat-tab"
                onClick={() => selectTab(entry)}
              >
                {tabLabel(entry)}
              </button>
            ))}
          </div>

          <div className="char-editor-body" role="tabpanel">
            {tab === "presets" ? (
              <div className="char-preset-grid">
                {CHARACTER_PRESETS.map((preset) => {
                  const thumb = thumbs?.get(characterLookKey(preset.look));
                  const active = sameCharacterLook(preset.look, look);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className="char-preset-card"
                      aria-pressed={active}
                      onClick={() => updateLook(preset.look)}
                    >
                      <span className="char-preset-thumb">
                        {thumb ? (
                          <img src={thumb} alt="" width={THUMB_PX} height={THUMB_PX} />
                        ) : (
                          <CyborgSilhouette framing="body" pending={!thumbsFailed} />
                        )}
                      </span>
                      <span className="char-preset-name">{lookPresetText(preset.id)}</span>
                    </button>
                  );
                })}
              </div>
            ) : tab === "colors" ? (
              <div className="char-colors-wrap">
                <div className="char-slot-block">
                  <div className="char-slot-head">
                    <h3 className="char-slot-title">{m.dev_mockups_char_themes_title()}</h3>
                  </div>
                  <div className="char-theme-grid">
                    {COLOR_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        className="char-theme-card"
                        onClick={() =>
                          updateLook({
                            ...look,
                            skin: locked.has("skin") ? look.skin : theme.skin,
                            primary: locked.has("primary") ? look.primary : theme.primary,
                            secondary: locked.has("secondary") ? look.secondary : theme.secondary,
                            accent: locked.has("accent") ? look.accent : theme.accent,
                            glow: locked.has("glow") ? look.glow : theme.glow,
                          })
                        }
                      >
                        <span className="char-theme-dots" aria-hidden="true">
                          <span style={{ background: CHARACTER_COLORS[theme.primary] }} />
                          <span style={{ background: CHARACTER_COLORS[theme.secondary] }} />
                          <span style={{ background: CHARACTER_COLORS[theme.accent] }} />
                          <span style={{ background: CHARACTER_COLORS[theme.glow] }} />
                        </span>
                        <span className="char-theme-name">{theme.label()}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="char-slot-block">
                  <div className="char-slot-head">
                    <h3 className="char-slot-title">{m.start_looks_color_slot()}</h3>
                    <div className="char-slot-tools">
                      <button
                        type="button"
                        className="button-small"
                        onClick={() => updateLook(rerollCharacterLook(look, randomSeed(), locked, colorSlot))}
                      >
                        {m.dev_mockups_char_reroll_one()}
                      </button>
                      <button
                        type="button"
                        className="button-small"
                        aria-pressed={locked.has(colorSlot)}
                        onClick={() => toggleLock(colorSlot)}
                      >
                        {locked.has(colorSlot) ? m.dev_mockups_char_locked() : m.dev_mockups_char_lock()}
                      </button>
                    </div>
                  </div>
                  <div className="char-color-slots" role="radiogroup" aria-label={m.start_looks_color_slot()}>
                    {CHARACTER_COLOR_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        role="radio"
                        aria-checked={colorSlot === slot}
                        className="char-color-slot-btn"
                        onClick={() => setColorSlot(slot)}
                      >
                        <span
                          className="char-color-dot"
                          aria-hidden="true"
                          style={{ background: CHARACTER_COLORS[look[slot]] }}
                        />
                        <span>{colorSlotText(slot)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="char-slot-block">
                  <div className="char-slot-head">
                    <h3 className="char-slot-title">
                      {colorSlotText(colorSlot)} · {lookColorText(look[colorSlot])}
                    </h3>
                  </div>
                  <div className="char-swatch-grid" role="radiogroup" aria-label={colorSlotText(colorSlot)}>
                    {CHARACTER_COLOR_IDS.map((colorId) => (
                      <button
                        key={colorId}
                        type="button"
                        role="radio"
                        aria-checked={look[colorSlot] === colorId}
                        className="char-swatch-btn"
                        title={lookColorText(colorId)}
                        onClick={() => updateLook({ ...look, [colorSlot]: colorId })}
                      >
                        <span
                          className="char-swatch-fill"
                          aria-hidden="true"
                          style={{ background: CHARACTER_COLORS[colorId] }}
                        />
                        <span className="char-swatch-label">{lookColorText(colorId)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="char-parts-wrap">
                {TAB_KEYS[tab].map((key) => {
                  const choices = characterLookChoices(key);
                  const isLocked = locked.has(key);
                  return (
                    <div key={key} className="char-slot-block" data-slot={key}>
                      <div className="char-slot-head">
                        <div>
                          <h3 className="char-slot-title">{lookKeyText(key)}</h3>
                          <span className="char-slot-current">{lookValueText(look, key)}</span>
                        </div>
                        <div className="char-slot-tools">
                          <button
                            type="button"
                            className="button-small"
                            onClick={() => updateLook(rerollCharacterLook(look, randomSeed(), locked, key))}
                          >
                            {m.dev_mockups_char_reroll_one()}
                          </button>
                          <button
                            type="button"
                            className="button-small"
                            aria-pressed={isLocked}
                            onClick={() => toggleLock(key)}
                          >
                            {isLocked ? m.dev_mockups_char_locked() : m.dev_mockups_char_lock()}
                          </button>
                        </div>
                      </div>
                      <div className="char-chip-grid">
                        {choices.map((choice) => {
                          const previewLook = { ...look, [key]: choice } as CharacterLook;
                          const selected = look[key] === choice;
                          return (
                            <button
                              key={String(choice)}
                              type="button"
                              className="char-choice-chip"
                              aria-pressed={selected}
                              onClick={() => updateLook(previewLook)}
                            >
                              {lookValueText(previewLook, key)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <p className="field-hint">{m.start_looks_lock_hint()}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
