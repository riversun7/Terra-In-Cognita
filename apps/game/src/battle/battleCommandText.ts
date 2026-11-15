// 전투맵 명령 화면 문구(명령·대형·전개 방식 이름) — 메시지 키 표. BattleCommandBar와 개발 화면 명령 칸이 같이 쓴다
import type { ReportFormation, ReportTactic } from "@terra/shared/battleReport";
import { m } from "../paraglide/messages.js";
import type { BattleOrderDraft } from "./battleCommands.ts";

const ORDER: Readonly<Record<BattleOrderDraft["kind"], () => string>> = {
  advance: m.battle_cmd_advance,
  hold: m.battle_cmd_hold,
  attack: m.battle_cmd_attack,
  retreat: m.battle_cmd_retreat,
  free: m.battle_cmd_free,
  rally: m.battle_cmd_rally,
  follow: m.battle_cmd_follow,
  formation: m.battle_cmd_formation,
  tactic: m.battle_cmd_tactic_order,
};
export const orderText = (kind: BattleOrderDraft["kind"]): string => ORDER[kind]();

const FORMATION: Readonly<Record<ReportFormation, () => string>> = {
  line: m.battle_cmd_shape_line,
  column: m.battle_cmd_shape_column,
  wedge: m.battle_cmd_shape_wedge,
  block: m.battle_cmd_shape_block,
};
export const formationText = (shape: ReportFormation): string => FORMATION[shape]();

const TACTIC: Readonly<Record<ReportTactic, () => string>> = {
  assault: m.battle_cmd_tactic_assault,
  defend: m.battle_cmd_tactic_defend,
  center: m.battle_cmd_tactic_center,
  flank: m.battle_cmd_tactic_flank,
  infiltrate: m.battle_cmd_tactic_infiltrate,
  focus: m.battle_cmd_tactic_focus,
  harass: m.battle_cmd_tactic_harass,
  delay: m.battle_cmd_tactic_delay,
};
export const tacticText = (tactic: ReportTactic): string => TACTIC[tactic]();
