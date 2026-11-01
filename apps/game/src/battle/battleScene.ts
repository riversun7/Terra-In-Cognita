// 다시보기 장면 — 2차맵 엔진 하나 + 전투 효과 층 + HTML 덧층 + 시계. React와 나눈 명령형 조각이다(BattleReplayView가 든다).
// docs/adr/2026-11-01-battle-replay.md 6·7절. 프레임 차례(엔진 덧그림 층): before(시각) = 시계를 밀고 그 시각의 유닛 자리·모습·효과·
// 따라가기 카메라를 엔진에 넣는다 → 엔진이 카메라·유닛을 맞춘다 → after(보기) = 막대·숫자를 화면 좌표로 옮긴다 → 그리기.
// 재생 중에만 프레임을 잇고, 멈추면 엔진이 쉰다(카메라를 움직이면 그 프레임에 덧층도 따라간다). 화면 상태(시각·재생)는 10Hz로 알린다.
import {
  type EngineStats,
  type EngineStatus,
  type SecondMapEngine,
  type UnitLook,
  createSecondMapEngine,
} from "@terra/engine";
import {
  BATTLE_FX_COLORS,
  BattleFxLayer,
  type BattleFxItem,
  elementColor,
  teamColor,
} from "@terra/engine/battle";
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { BattleHud } from "./battleHud.ts";
import { ReplayClock, type ReplaySpeed } from "./replayClock.ts";
import type { ReplayGround } from "./replayTerrain.ts";
import type { FxTone, ReplayTimeline, TimelineFx, UnitFrame } from "./replayTimeline.ts";

/** 화면이 그리는 상태(10Hz) */
export interface SceneUi {
  readonly timeMs: number;
  readonly playing: boolean;
  readonly speed: ReplaySpeed;
  readonly selected: number;
  readonly follow: boolean;
  readonly frames: readonly UnitFrame[];
  /** 그 시각 효과·떠오르는 숫자 수(시험·측정) */
  readonly fx: number;
  /** 그 시각 효과 종류(쉼표로, 시험 사진이 투사체가 나는 때를 찾는다) */
  readonly fxKinds: string;
  readonly numbers: number;
}

/** 전투 보기 유닛 크기(m): 전투맵 칸이 약 5.85m라 실제 키 1.8m는 겹쳐 보는 거리에서 너무 작다([임시] 표시 값, ADR 7절) */
const LOOK_ALIVE = { heightM: 2.4, radiusM: 0.6 } as const;
const LOOK_CREATURE = { heightM: 1.8, radiusM: 0.85 } as const;
const LOOK_DOWN = { heightM: 0.6, radiusM: 0.8 } as const;
/** 감춘 유닛을 둘 곳(2차맵 밖) */
const FAR_AWAY = -10_000;
/** 처음 보기: 화면 짧은 변에 전투맵 칸 이만큼(약 58m: 유닛이 모델로 보이고 두 편이 한 화면에 든다) */
const START_SPAN_CELLS = 10;
const UI_MS = 100;

const toneColor = (tone: FxTone): number => {
  switch (tone.kind) {
    case "physical":
      return BATTLE_FX_COLORS.physical;
    case "element":
      return elementColor(tone.element);
    case "heal":
      return BATTLE_FX_COLORS.heal;
    case "buff":
      return BATTLE_FX_COLORS.buff;
    case "debuff":
      return BATTLE_FX_COLORS.debuff;
    default: {
      const unknown: never = tone;
      return Number(unknown);
    }
  }
};

/** 해석한 효과 → 엔진 그림(배치 칸 = 원점 + 전투맵 칸) */
function fxItem(fx: TimelineFx, ox: number, oy: number): BattleFxItem {
  const color = toneColor(fx.tone);
  switch (fx.kind) {
    case "projectile":
      return {
        kind: "projectile",
        fromX: ox + fx.fromX,
        fromY: oy + fx.fromY,
        toX: ox + fx.toX,
        toY: oy + fx.toY,
        progress: fx.progress,
        color,
        size: 1.5,
      };
    case "beam":
      return {
        kind: "beam",
        fromX: ox + fx.fromX,
        fromY: oy + fx.fromY,
        toX: ox + fx.toX,
        toY: oy + fx.toY,
        progress: fx.progress,
        color,
      };
    case "ring":
      return {
        kind: "ring",
        x: ox + fx.x,
        y: oy + fx.y,
        radiusCells: fx.radiusCells,
        progress: fx.progress,
        color,
      };
    case "glow":
      return { kind: "glow", x: ox + fx.x, y: oy + fx.y, progress: fx.progress, color };
    case "flash":
      return { kind: "flash", x: ox + fx.x, y: oy + fx.y, progress: fx.progress, color };
    default: {
      const unknown: never = fx;
      throw new RangeError(`unknown fx ${String(unknown)}`);
    }
  }
}

export class BattleScene {
  readonly clock: ReplayClock;
  private readonly engine: SecondMapEngine;
  private readonly fx = new BattleFxLayer();
  private readonly hud: BattleHud;
  private readonly replay: BattleReplay;
  private readonly timeline: ReplayTimeline;
  private readonly origin: { x: number; y: number };
  private readonly onUi: (ui: SceneUi) => void;
  private readonly placed: Float64Array;
  private readonly looks: string[];
  private frames: UnitFrame[] = [];
  private selected = -1;
  private follow = false;
  private vision: number | null = null;
  private lastUi = Number.NEGATIVE_INFINITY;
  private lastPlaying = false;
  private fxCount = 0;
  private fxKinds = "";
  private disposed = false;

  constructor(options: {
    host: HTMLElement;
    replay: BattleReplay;
    timeline: ReplayTimeline;
    ground: ReplayGround;
    onUi: (ui: SceneUi) => void;
    onStatus: (status: EngineStatus) => void;
  }) {
    const { replay, timeline, ground } = options;
    this.replay = replay;
    this.timeline = timeline;
    this.onUi = options.onUi;
    this.origin = { x: ground.originX, y: ground.originY };
    this.clock = new ReplayClock(timeline.durationMs);
    this.placed = new Float64Array(replay.units.length * 2).fill(Number.NaN);
    this.looks = replay.units.map(() => "");
    this.engine = createSecondMapEngine(options.host, {
      iconThresholdPx: 4,
      onStatus: options.onStatus,
      onSelect: (id) => this.select(id === null ? -1 : id - 1),
    });
    this.hud = new BattleHud(options.host, replay, (side) => timeline.team(side));
    this.engine.setUnits(
      replay.units.map((unit, index) => ({
        id: index + 1,
        look: this.lookOf(index, "alive"),
        x: this.origin.x + unit.x + 0.5,
        y: this.origin.y + unit.y + 0.5,
      })),
    );
    this.engine.addLayer(this.fx);
    this.engine.addLayer({
      before: (time) => this.before(time),
      after: (view) => {
        this.hud.update(
          replay,
          this.frames,
          timeline.numbersAt(this.clock.timeMs),
          this.origin,
          (index) => this.hidden(index),
          view.project,
          view.pixelsPerMetre,
        );
      },
    });
    // 처음 보기: 유닛들 가운데
    const cellM = ground.terrain.cellSizeM / 2;
    const count = Math.max(1, replay.units.length);
    const cx = replay.units.reduce((sum, unit) => sum + unit.x + 0.5, 0) / count;
    const cy = replay.units.reduce((sum, unit) => sum + unit.y + 0.5, 0) / count;
    void this.engine.setTerrain(ground.terrain).then(() => {
      if (this.disposed) return;
      this.engine.setView({ x: this.origin.x + cx, y: this.origin.y + cy, spanM: START_SPAN_CELLS * cellM });
    });
  }

  private lookOf(index: number, status: string): UnitLook {
    const unit = this.replay.units[index];
    const team = unit ? this.timeline.team(unit.side) : 0;
    if (status === "down") return { ...LOOK_DOWN, color: BATTLE_FX_COLORS.down };
    const size = unit?.kind === "creature" ? LOOK_CREATURE : LOOK_ALIVE;
    return { ...size, color: teamColor(team) };
  }

  private hidden(index: number): boolean {
    return this.vision !== null && !this.timeline.visibleTo(this.vision, index, this.clock.timeMs);
  }

  private before(time: number): boolean {
    const busy = this.clock.tick(time);
    const t = this.clock.timeMs;
    this.frames = this.timeline.unitsAt(t);
    const { x: ox, y: oy } = this.origin;
    this.frames.forEach((frame, index) => {
      const gone = frame.status === "absent" || frame.status === "retreated" || this.hidden(index);
      const x = gone ? FAR_AWAY : ox + frame.x;
      const y = gone ? FAR_AWAY : oy + frame.y;
      if (this.placed[index * 2] !== x || this.placed[index * 2 + 1] !== y) {
        this.placed[index * 2] = x;
        this.placed[index * 2 + 1] = y;
        this.engine.setUnitPath(index + 1, { points: [x, y], departAtMs: 0, speedCellsPerSec: 0 });
      }
      const look = frame.status === "down" ? "down" : "alive";
      if (this.looks[index] !== look) {
        this.looks[index] = look;
        this.engine.setUnitLook(index + 1, this.lookOf(index, look));
      }
    });
    this.fx.setUnits(
      this.frames.map((frame, index) => {
        const unit = this.replay.units[index];
        return {
          x: ox + frame.x,
          y: oy + frame.y,
          team: unit ? this.timeline.team(unit.side) : 0,
          facing: frame.facing,
          alive: frame.status === "alive",
          hidden: frame.status === "absent" || frame.status === "retreated" || this.hidden(index),
          selected: index === this.selected,
        };
      }),
    );
    const items = this.timeline.fxAt(t);
    this.fxCount = items.length;
    this.fxKinds = [...new Set(items.map((item) => item.kind))].join(",");
    this.fx.setItems(items.map((item) => fxItem(item, ox, oy)));
    const target = this.frames[this.selected];
    if (this.follow && target && target.status !== "absent")
      this.engine.setView({ x: ox + target.x, y: oy + target.y });
    if (time - this.lastUi >= UI_MS || this.clock.playing !== this.lastPlaying) this.emit(time);
    return busy;
  }

  private emit(time = performance.now()): void {
    this.lastUi = time;
    this.lastPlaying = this.clock.playing;
    this.onUi({
      timeMs: this.clock.timeMs,
      playing: this.clock.playing,
      speed: this.clock.speed,
      selected: this.selected,
      follow: this.follow,
      frames: this.frames,
      fx: this.fxCount,
      fxKinds: this.fxKinds,
      numbers: this.timeline.numbersAt(this.clock.timeMs).length,
    });
  }

  /** 시계를 바꾼 뒤: 한 번 그리고 화면 상태를 바로 알린다 */
  private changed(): void {
    this.engine.requestFrame();
    this.frames = this.timeline.unitsAt(this.clock.timeMs);
    this.emit();
  }

  play(): void {
    this.clock.play();
    this.changed();
  }

  pause(): void {
    this.clock.pause();
    this.changed();
  }

  toggle(): void {
    if (this.clock.playing) this.pause();
    else this.play();
  }

  restart(): void {
    this.clock.restart();
    this.changed();
  }

  seek(ms: number): void {
    this.clock.seek(ms);
    this.changed();
  }

  setSpeed(speed: ReplaySpeed): void {
    this.clock.setSpeed(speed);
    this.changed();
  }

  select(index: number): void {
    this.selected = index >= 0 && index < this.replay.units.length ? index : -1;
    this.engine.select(this.selected >= 0 ? this.selected + 1 : null);
    this.hud.select(this.selected);
    if (this.selected < 0) this.follow = false;
    this.changed();
  }

  setFollow(follow: boolean): void {
    this.follow = follow && this.selected >= 0;
    this.changed();
  }

  /** 시야 거르기: null = 모두, 편 ID = 그 편이 본 적만(D-6037) */
  setVision(side: number | null): void {
    this.vision = side;
    this.changed();
  }

  stats(): EngineStats {
    return this.engine.stats();
  }

  dispose(): void {
    this.disposed = true;
    this.hud.dispose();
    this.fx.dispose();
    this.engine.dispose();
  }
}
