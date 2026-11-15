// 전투맵 명령 화면의 자료 — 기획 D-558 1546("전투맵 명령 화면" — 45 §4.1: 아래 초상화 줄의 파티 탭 + 군단 단추, 전장을 터치해 칸·목표),
// D-549·D-558(명령 종류: 진형 전진·자리 지키기·목표 공격·퇴각·거두기·집결·따라가기·대형 고르기·AI 전개 방식). 판정은 서버가 한다:
// 화면은 고른 명령을 그 시각과 함께 넘기기만 한다(서버 권위). 순수 함수만 둔다(시험 대상).
import type { ReportFormation, ReportTactic } from "@terra/shared/battleReport";

/** 화면이 고른 명령(받는 쪽·시각은 BattleCommandIssue). 목표는 리플레이 유닛 번호, 따라갈 파티는 판정 파티 ID */
export type BattleOrderDraft =
  | {
      readonly kind: "advance" | "rally";
      readonly cell?: { readonly x: number; readonly y: number } | undefined;
    }
  | { readonly kind: "hold" | "retreat" | "free" }
  | { readonly kind: "attack"; readonly target: number }
  | { readonly kind: "follow"; readonly leader: number }
  | { readonly kind: "formation"; readonly shape: ReportFormation }
  | { readonly kind: "tactic"; readonly tactic: ReportTactic };

export interface BattleCommandIssue {
  /** 명령 시각(전투 시각 ms) */
  readonly atMs: number;
  /** 받는 파티 ID(null = 군단 전체 — 지휘관 정원 안 파티만 받는다) */
  readonly party: number | null;
  readonly order: BattleOrderDraft;
}

/** 명령 화면이 읽는 리플레이 유닛 칸(ID·편·파티) */
export interface CommandUnits {
  readonly units: readonly { readonly id: number; readonly side: number; readonly party: number }[];
}

/** 칸·목표를 전장에서 고르는 중인 명령 */
export type BattlePick = {
  readonly kind: "advance" | "rally" | "attack";
  readonly party: number | null;
} | null;

/** 그 편의 파티 ID(작은 차례 — 화면 탭 차례) */
export function sideParties(replay: CommandUnits, side: number): number[] {
  return [...new Set(replay.units.filter((unit) => unit.side === side).map((unit) => unit.party))].toSorted(
    (a, b) => a - b,
  );
}

/** 리플레이 유닛 번호 → (그 편 파티 차례, 파티 안 자리) — 전투 보고서 명령의 목표 모양(파티는 ID 차례, 자리는 유닛 ID 차례) */
export function unitSlot(
  replay: CommandUnits,
  index: number,
): { side: number; party: number; index: number } | null {
  const unit = replay.units[index];
  if (!unit) return null;
  const party = sideParties(replay, unit.side).indexOf(unit.party);
  const mates = replay.units
    .filter((entry) => entry.side === unit.side && entry.party === unit.party)
    .map((entry) => entry.id)
    .toSorted((a, b) => a - b);
  return { side: unit.side, party, index: mates.indexOf(unit.id) };
}

/** [임시] 같은 받는 쪽에 이 시간(ms) 안에 넣은 명령이 있으면 다시 넣기 막기 링을 보인다(판정 C5 commandLockMs 출발값과 같다) */
export const COMMAND_LOCK_MS = 1000;
