// 리플레이 해석 결과 모양 — replayTimeline.ts가 만들고 장면·덧층·화면이 읽는다. docs/adr/2026-11-01-battle-replay.md 7절.
import type { BattleReplay, Facing, ReplayUnitState } from "@terra/protocol/battleReplay";

/** 효과 그림(엔진 BattleFxItem과 같은 모양, 색은 이름으로: 화면이 세계 색으로 바꾼다) */
export type FxTone =
  | { readonly kind: "physical" }
  | { readonly kind: "element"; readonly element: number }
  | { readonly kind: "heal" }
  | { readonly kind: "buff" }
  | { readonly kind: "debuff" };

export type TimelineFx =
  | {
      readonly kind: "projectile";
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
      readonly progress: number;
      readonly tone: FxTone;
    }
  | {
      readonly kind: "ring";
      readonly x: number;
      readonly y: number;
      readonly radiusCells: number;
      readonly progress: number;
      readonly tone: FxTone;
    }
  | {
      readonly kind: "glow";
      readonly x: number;
      readonly y: number;
      readonly progress: number;
      readonly tone: FxTone;
    }
  | {
      readonly kind: "beam";
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
      readonly progress: number;
      readonly tone: FxTone;
    }
  | {
      readonly kind: "flash";
      readonly x: number;
      readonly y: number;
      readonly progress: number;
      readonly tone: FxTone;
    };

export type NumberKind = "damage" | "crit" | "elemental" | "heal" | "shield" | "dot" | "miss" | "evade";

export interface FloatingNumber {
  /** 같은 숫자를 프레임마다 같은 요소에 두는 열쇠(사건 번호·몫) */
  readonly key: number;
  readonly unit: number;
  /** 맞은 자리(전투맵 칸 좌표, 칸 가운데) */
  readonly x: number;
  readonly y: number;
  readonly kind: NumberKind;
  readonly value: number;
  readonly crit: boolean;
  /** 0(막 생김) ~ 1(사라짐) */
  readonly age: number;
}

export interface UnitFrame {
  readonly index: number;
  /** 전투맵 칸 좌표(칸 가운데 = 정수 + 0.5) */
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly status: ReplayUnitState["status"];
  /** 은신 중(형식 2 표지, docs/adr/2026-11-15-combat-moves.md) — 자리표시로 흐린 색 */
  readonly stealth: boolean;
  readonly hp: number;
  readonly armor: number;
  readonly shield: number;
  readonly mp: number;
  readonly stamina: number;
  readonly effects: readonly { readonly effect: number; readonly stacks: number }[];
  /** 시전 중이면 스킬 표 번호와 진행(0~1) */
  readonly cast: { readonly skill: number; readonly progress: number } | null;
}

export interface UnitSummary {
  readonly index: number;
  readonly dealt: number;
  readonly taken: number;
  readonly healed: number;
  readonly kills: number;
  readonly status: ReplayUnitState["status"];
}

export interface SideSummary {
  readonly side: number;
  readonly units: number;
  readonly alive: number;
  readonly down: number;
  readonly retreated: number;
  readonly dealt: number;
  readonly healed: number;
}

export interface ReplaySummary {
  readonly winner: number;
  readonly reason: BattleReplay["result"]["reason"];
  readonly durationMs: number;
  readonly sides: readonly SideSummary[];
  readonly units: readonly UnitSummary[];
}
