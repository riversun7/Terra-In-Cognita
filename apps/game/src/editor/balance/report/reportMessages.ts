// 전투 보고서 화면 문구(메시지 키 표) — 키로 고르는 문구는 표에 적는다(oxlint import(namespace) 규칙, AGENTS.md 6절).
import type { LabTerrainView } from "@terra/shared/battleLab";
import type { ReportEdge, ReportMode, ReportOrderKind, ReportWaveDefense } from "@terra/shared/battleReport";
import type { ReportCityChange } from "@terra/shared/battleReportCity";
import { m } from "../../../paraglide/messages.js";
import type { CompareRow, FlowStepId, ReportErrorKey } from "./reportModel.ts";

const MODE_TEXT: Readonly<Record<ReportMode, () => string>> = {
  arena: m.dev_report_mode_arena,
  siege: m.dev_report_mode_siege,
  wave: m.dev_report_mode_wave,
};
export const modeText = (mode: ReportMode): string => MODE_TEXT[mode]();

const REASON_TEXT: Readonly<Record<ReportErrorKey, () => string>> = {
  invalid_settings: m.dev_report_reason_invalid_settings,
  budget: m.dev_report_reason_budget,
  variant_mode: m.dev_report_reason_variant_mode,
  invalid_unit: m.dev_report_reason_invalid_unit,
  unknown_terrain: m.dev_report_reason_unknown_terrain,
  unknown_tuning: m.dev_report_reason_unknown_tuning,
  tuning_out_of_range: m.dev_report_reason_tuning_out_of_range,
  unknown_formula: m.dev_report_reason_unknown_formula,
  invalid_formula: m.dev_report_reason_invalid_formula,
  unknown_city: m.dev_report_reason_unknown_city,
  unknown_job: m.dev_report_reason_unknown_job,
  unknown_report: m.dev_report_reason_unknown_report,
  busy: m.dev_report_reason_busy,
  rate_limited: m.dev_report_reason_rate_limited,
  forbidden: m.dev_report_reason_forbidden,
  unauthorized: m.dev_report_reason_unauthorized,
  unavailable: m.dev_report_reason_unavailable,
  invalid_input: m.dev_report_reason_invalid_input,
  network: m.dev_report_reason_network,
  timeout: m.dev_report_reason_timeout,
  failed: m.dev_report_reason_failed,
  unknown: m.dev_report_reason_unknown,
};
export const reasonText = (key: ReportErrorKey): string => REASON_TEXT[key]();

const PRESET_TEXT: Readonly<Record<string, () => string>> = {
  river: m.second_map_lab_preset_river,
  coast: m.second_map_lab_preset_coast,
  lake: m.second_map_lab_preset_lake,
  mountain: m.second_map_lab_preset_mountain,
  forest: m.second_map_lab_preset_forest,
  grassland: m.second_map_lab_preset_grassland,
};

export function terrainLabel(terrain: LabTerrainView): string {
  if (terrain.kind === "flat") return m.dev_lab_terrain_flat();
  if (terrain.kind === "test") return m.dev_lab_terrain_test();
  return m.dev_lab_terrain_preset({
    name: PRESET_TEXT[terrain.preset ?? ""]?.() ?? terrain.preset ?? terrain.id,
  });
}

const STAGE_TEXT: Readonly<Record<FlowStepId, () => string>> = {
  attack: m.dev_report_stage_attack,
  hitRoll: m.dev_report_stage_hit,
  evadeRoll: m.dev_report_stage_evade,
  critRoll: m.dev_report_stage_crit_roll,
  raw: m.dev_report_stage_raw,
  rate: m.dev_report_stage_rate,
  flat: m.dev_report_stage_flat,
  matchup: m.dev_report_stage_matchup,
  elementalDefense: m.dev_report_stage_elemental_defense,
  resist: m.dev_report_stage_resist,
  crit: m.dev_report_stage_crit,
  skill: m.dev_report_stage_skill,
  buff: m.dev_report_stage_buff,
  floor: m.dev_report_stage_floor,
  final: m.dev_report_stage_final,
  applied: m.dev_report_stage_applied,
};
export const stageText = (id: FlowStepId): string => STAGE_TEXT[id]();

const END_TEXT: Readonly<Record<"wipe" | "nexus" | "timeout" | "spent", () => string>> = {
  wipe: m.dev_report_end_wipe,
  nexus: m.dev_report_end_nexus,
  timeout: m.dev_report_end_timeout,
  spent: m.dev_report_end_spent,
};
export const endText = (end: "wipe" | "nexus" | "timeout" | "spent"): string => END_TEXT[end]();

const GROUP_TEXT: Readonly<Record<string, () => string>> = {
  wave_physical: m.dev_report_group_wave_physical,
  wave_magic: m.dev_report_group_wave_magic,
  defenders: m.dev_report_group_defenders,
};

/** 줄 이름: 웨이브 무리는 메시지, 군단 유닛은 A2·3(파티·자리, 키 a1.2) + 표시 이름. 옛 기록 키(a2)는 A3 */
export function rowLabel(key: string, label: string): string {
  const group = GROUP_TEXT[key];
  if (group) return group();
  const team = key.slice(0, 1).toUpperCase();
  const [party, slot] = key.slice(1).split(".");
  const short =
    slot === undefined ? `${team}${Number(party) + 1}` : `${team}${Number(party) + 1}·${Number(slot) + 1}`;
  return label ? `${short} ${label}` : short;
}

const DEFENSE_TEXT: Readonly<Record<ReportWaveDefense, () => string>> = {
  party: m.dev_report_defense_party,
  sim: m.dev_report_defense_sim,
  world: m.dev_report_defense_world,
};
export const defenseText = (defense: ReportWaveDefense): string => DEFENSE_TEXT[defense]();

const CITY_CHANGE_TEXT: Readonly<Record<ReportCityChange, () => string>> = {
  gone: m.dev_report_city_change_gone,
  owner: m.dev_report_city_change_owner,
  layout: m.dev_report_city_change_layout,
  nexus: m.dev_report_city_change_nexus,
  walls: m.dev_report_city_change_walls,
  defense: m.dev_report_city_change_defense,
};
export const cityChangeText = (change: ReportCityChange): string => CITY_CHANGE_TEXT[change]();

/** 도시 이름(없으면 "도시 N") */
export const cityName = (name: string | null, id: number): string =>
  name ?? m.dev_report_city_unnamed({ id });

const COMPARE_TEXT: Readonly<Record<string, () => string>> = {
  scorePm: m.dev_report_cmp_score,
  avgMs: m.dev_report_cmp_avg,
  p50Ms: m.dev_report_cmp_p50,
  aDealt: m.dev_report_cmp_a_dealt,
  bDealt: m.dev_report_cmp_b_dealt,
  aHitPm: m.dev_report_cmp_a_hit,
  aEvadePm: m.dev_report_cmp_a_evade,
  aCritPm: m.dev_report_cmp_a_crit,
  bHitPm: m.dev_report_cmp_b_hit,
  bCritPm: m.dev_report_cmp_b_crit,
  aDeaths: m.dev_report_cmp_a_deaths,
  bDeaths: m.dev_report_cmp_b_deaths,
};
export const compareText = (row: CompareRow): string => COMPARE_TEXT[row.id]?.() ?? row.id;

const ORDER_TEXT: Readonly<Record<ReportOrderKind, () => string>> = {
  advance: m.dev_report_order_kind_advance,
  hold: m.dev_report_order_kind_hold,
  attack: m.dev_report_order_kind_attack,
  retreat: m.dev_report_order_kind_retreat,
  free: m.dev_report_order_kind_free,
};
export const orderKindText = (kind: ReportOrderKind): string => ORDER_TEXT[kind]();

const EDGE_TEXT: Readonly<Record<string, () => string>> = {
  random: m.dev_report_edge_random,
  "0": m.dev_report_edge_0,
  "1": m.dev_report_edge_1,
  "2": m.dev_report_edge_2,
  "3": m.dev_report_edge_3,
};
export const edgeText = (edge: ReportEdge): string => EDGE_TEXT[String(edge)]?.() ?? String(edge);
