// 전투 실험실 순수 코드 — 팀·유닛 고치기(바뀌지 않는 값으로), 입력 글 → 정수, 서버 오류 → 문구 키, 전투 입력, 기기 저장(시험 대상).
// docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)". 판정·계산은 서버가 한다(기기는 판정 코드를 받지 않는다).
import {
  LAB_LIMITS,
  LAB_REASONS,
  type LabCustomWeapon,
  type LabParty,
  type LabPresetView,
  type LabReason,
  type LabRow,
  type LabTeam,
  type LabUnit,
  type LabWeapon,
  newLabUnit,
} from "@terra/shared/battleLab";
import {
  type FormationPoint,
  type FormationPresetId,
  formationPointFromRow,
  isValidFormationPoint,
  type LocalizedName,
  type PrimaryStat,
  presetFormationPoint,
} from "@terra/shared/roster";
import { field } from "../../../net/json.ts";

export type Teams = Readonly<Record<LabTeam, LabParty>>;

/** 고르고 있는 유닛(팀·파티 안 차례) */
export interface Selection {
  readonly team: LabTeam;
  readonly index: number;
}

/** 유닛 더하기 기본값 = 새 사이보그 샘플(기본 무기·장비·스킬, D-490) */
export const DEFAULT_UNIT_PRESET = "sample_new_cyborg";

/** 처음 팀(목록을 받기 전): 편마다 새 사이보그 하나 */
export function initialTeams(): Teams {
  return {
    a: { units: [newLabUnit("cyborg")], retreatHpPct: 0 },
    b: { units: [newLabUnit("cyborg")], retreatHpPct: 0 },
  };
}

/** 한 유닛을 고친다(없는 자리는 그대로) */
export function updateUnit(teams: Teams, at: Selection, change: (unit: LabUnit) => LabUnit): Teams {
  const party = teams[at.team];
  const unit = party.units[at.index];
  if (!unit) return teams;
  const units = party.units.map((entry, index) => (index === at.index ? change(entry) : entry));
  return { ...teams, [at.team]: { ...party, units } };
}

/** 유닛을 더한다(파티 정원 6, 넘으면 그대로) */
export function addUnit(teams: Teams, team: LabTeam, unit: LabUnit): Teams {
  const party = teams[team];
  if (party.units.length >= LAB_LIMITS.partyMax) return teams;
  return { ...teams, [team]: { ...party, units: [...party.units, unit] } };
}

/** 유닛을 뺀다(파티에 하나는 남긴다) */
export function removeUnit(teams: Teams, at: Selection): Teams {
  const party = teams[at.team];
  if (party.units.length <= 1) return teams;
  return { ...teams, [at.team]: { ...party, units: party.units.filter((_, index) => index !== at.index) } };
}

/** 유닛 차례를 옮긴다(delta −1 위, +1 아래) */
export function moveUnit(teams: Teams, at: Selection, delta: number): Teams {
  const party = teams[at.team];
  const to = at.index + delta;
  if (to < 0 || to >= party.units.length) return teams;
  const units = [...party.units];
  const [unit] = units.splice(at.index, 1);
  if (!unit) return teams;
  units.splice(to, 0, unit);
  return { ...teams, [at.team]: { ...party, units } };
}

/** 파티 하나를 통째로(프리셋 불러오기) */
export function replaceParty(teams: Teams, team: LabTeam, party: LabParty): Teams {
  return { ...teams, [team]: party };
}

/** 고른 자리가 파티를 벗어나면 맞춘다 */
export function clampSelection(teams: Teams, at: Selection): Selection {
  const count = teams[at.team].units.length;
  return { team: at.team, index: Math.max(0, Math.min(count - 1, at.index)) };
}

/** 입력 글 → 범위 안 정수(빈 글·소수·범위 밖이면 null) */
export function parseIntIn(text: string, min: number, max: number): number | null {
  const trimmed = text.trim().replaceAll(",", "");
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

export const withPrimary = (unit: LabUnit, stat: PrimaryStat, value: number): LabUnit => ({
  ...unit,
  initial: { ...unit.initial, [stat]: value },
});
export const withK = (unit: LabUnit, stat: PrimaryStat, value: number): LabUnit => ({
  ...unit,
  kPm: { ...unit.kPm, [stat]: value },
});
export const withElement = (unit: LabUnit, index: number, value: number): LabUnit => ({
  ...unit,
  elements: unit.elements.map((entry, at) => (at === index ? value : entry)),
});
const labRowFromY = (y: number): LabRow => (y <= 2 ? "front" : "back");

export const withRow = (unit: LabUnit, row: LabRow): LabUnit => {
  if (!unit.pos || !isValidFormationPoint(unit.pos)) return { ...unit, row };
  const y = row === "front" ? Math.min(2, unit.pos.y) : Math.max(3, unit.pos.y);
  return { ...unit, row, pos: { x: unit.pos.x, y } };
};

/** 파티 유닛마다 9×6 배치 구역(x ∈ [-4, +4], y ∈ [0, 5]) 좌표를 구한다 */
export function partyFormationPositions(party: LabParty): readonly FormationPoint[] {
  let frontCount = 0;
  let backCount = 0;
  return party.units.map((unit) => {
    if (unit.pos && isValidFormationPoint(unit.pos)) return unit.pos;
    if (unit.row === "front") {
      const point = formationPointFromRow("front", frontCount);
      frontCount += 1;
      return point;
    }
    const point = formationPointFromRow("back", backCount);
    backCount += 1;
    return point;
  });
}

/** 기본 진형 프리셋(2열·3열·V자·역V·방진·산개)을 한 팀에 입힌다 */
export function applyFormationPreset(teams: Teams, team: LabTeam, presetId: FormationPresetId): Teams {
  const party = teams[team];
  const units = party.units.map((unit, index) => {
    const pos = presetFormationPoint(index, presetId);
    return { ...unit, pos, row: labRowFromY(pos.y) };
  });
  return { ...teams, [team]: { ...party, units } };
}

/** 고른 유닛을 9×6 배치 구역 안의 (x, y) 칸으로 옮긴다(다른 유닛이 있던 칸이면 두 유닛 자리를 바꾼다) */
export function moveUnitFormationPos(teams: Teams, at: Selection, pos: FormationPoint): Teams {
  if (!isValidFormationPoint(pos)) return teams;
  const party = teams[at.team];
  if (at.index < 0 || at.index >= party.units.length) return teams;
  const positions = partyFormationPositions(party);
  const currentPos = positions[at.index] ?? pos;
  const otherIndex = positions.findIndex(
    (entry, idx) => idx !== at.index && entry.x === pos.x && entry.y === pos.y,
  );
  const units = party.units.map((unit, index) => {
    if (index === at.index) {
      return { ...unit, pos, row: labRowFromY(pos.y) };
    }
    if (index === otherIndex) {
      return { ...unit, pos: currentPos, row: labRowFromY(currentPos.y) };
    }
    const fallback = positions[index] ?? pos;
    return unit.pos ? unit : { ...unit, pos: fallback, row: labRowFromY(fallback.y) };
  });
  return { ...teams, [at.team]: { ...party, units } };
}

/** 장비 칸 하나: item null이면 비운다 */
export function withEquip(unit: LabUnit, slot: number, item: string | null, pm = 500): LabUnit {
  const rest = unit.equipment.filter((entry) => entry.slot !== slot);
  const equipment = item === null ? rest : [...rest, { slot, item, pm }];
  return { ...unit, equipment: equipment.toSorted((a, b) => a.slot - b.slot) };
}

/** 장비 직접 값 2차 행 하나(0이면 뺀다) */
export function withGearRow(unit: LabUnit, id: string, value: number): LabUnit {
  const rest = unit.gear.rows.filter((row) => row.id !== id);
  return { ...unit, gear: { ...unit.gear, rows: value === 0 ? rest : [...rest, { id, value }] } };
}

export function gearRowValue(unit: LabUnit, id: string): number {
  return unit.gear.rows.find((row) => row.id === id)?.value ?? 0;
}

/** 스킬 더하기(이미 있으면 그대로) */
export function addSkill(unit: LabUnit, id: string): LabUnit {
  if (unit.skills.some((skill) => skill.id === id)) return unit;
  return { ...unit, skills: [...unit.skills, { id, grade: 1 }] };
}
export const removeSkill = (unit: LabUnit, id: string): LabUnit => ({
  ...unit,
  skills: unit.skills.filter((skill) => skill.id !== id),
});
export function moveSkill(unit: LabUnit, id: string, delta: number): LabUnit {
  const from = unit.skills.findIndex((skill) => skill.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= unit.skills.length) return unit;
  const skills = [...unit.skills];
  const [skill] = skills.splice(from, 1);
  if (!skill) return unit;
  skills.splice(to, 0, skill);
  return { ...unit, skills };
}
export const withSkillGrade = (unit: LabUnit, id: string, grade: number): LabUnit => ({
  ...unit,
  skills: unit.skills.map((skill) => (skill.id === id ? { ...skill, grade } : skill)),
});

/** 무기 고르기 값(select): natural · item:<ID> · custom */
export function weaponChoice(weapon: LabWeapon): string {
  if (weapon.kind === "item") return `item:${weapon.id}`;
  return weapon.kind;
}

/** 고르기 값 → 무기. 직접 값으로 바꿀 때는 지금 무기(없으면 타고난 무기)를 출발값으로 */
export function weaponOfChoice(choice: string, current: LabWeapon, natural: LabCustomWeapon): LabWeapon {
  if (choice.startsWith("item:")) return { kind: "item", id: choice.slice(5), pm: 500 };
  if (choice === "custom") return current.kind === "custom" ? current : { kind: "custom", spec: natural };
  return { kind: "natural" };
}

/** 프리셋 이름(지금 언어) */
export const nameIn = (name: LocalizedName, locale: string): string => (locale === "en" ? name.en : name.ko);

/** 앞에서 코드 포인트 count개(서버 이름 규칙이 코드 포인트로 센다) */
function headCodePoints(text: string, count: number): string {
  let out = "";
  let taken = 0;
  for (const char of text) {
    if (taken >= count) break;
    out += char;
    taken += 1;
  }
  return out;
}

/** 이름 끝에 붙임(전체가 40자 안이 되게 앞을 자른다) */
function withSuffix(text: string, suffix: string, suffixLength: number): string {
  return `${headCodePoints(text, LAB_LIMITS.nameMax - suffixLength)}${suffix}`;
}

/** 복제 이름: 끝에 " 복사"/" copy"(40자 안으로 자름) */
export function copyName(name: LocalizedName): LocalizedName {
  return { ko: withSuffix(name.ko, " 복사", 3), en: withSuffix(name.en, " copy", 5) };
}

export function unitPresets(presets: readonly LabPresetView[]) {
  return presets.flatMap((preset) => (preset.kind === "unit" ? [preset] : []));
}
export function partyPresets(presets: readonly LabPresetView[]) {
  return presets.flatMap((preset) => (preset.kind === "party" ? [preset] : []));
}

/** 서버 오류 → 문구 키 */
export type LabErrorKey =
  | LabReason
  | "forbidden"
  | "unauthorized"
  | "unavailable"
  | "invalid_input"
  | "network"
  | "unknown";

export interface LabErrorInfo {
  readonly key: LabErrorKey;
  readonly sessionEnded: boolean;
}

const isLabReason = (value: unknown): value is LabReason =>
  typeof value === "string" && (LAB_REASONS as readonly string[]).includes(value);

export function labErrorOf(error: unknown): LabErrorInfo {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  if (isLabReason(reason)) return { key: reason, sessionEnded: false };
  switch (code) {
    case "UNAUTHORIZED":
      return { key: "unauthorized", sessionEnded: true };
    case "FORBIDDEN":
      return { key: "forbidden", sessionEnded: false };
    case "NOT_FOUND":
      return { key: "unavailable", sessionEnded: false };
    case "BAD_REQUEST":
      return { key: "invalid_input", sessionEnded: false };
    case "TOO_MANY_REQUESTS":
      return { key: "rate_limited", sessionEnded: false };
    case undefined:
      return { key: "network", sessionEnded: false };
    default:
      return { key: "unknown", sessionEnded: false };
  }
}

/** 몬테카를로 판 수·제한 시간 고르기(상한 안) */
export const LAB_RUN_OPTIONS = [10, 20, 50, 100, 200] as const;
export const LAB_LIMIT_OPTIONS = [60, 120, 180, 300, 600] as const;

/** 기기에 남겨 두는 팀(새로 고쳐도 이어서, 이 기기만). 읽기·쓰기가 막히면 조용히 넘어간다 */
const STORAGE_KEY = "terra.battleLab.teams.v1";

export function loadTeams(isTeams: (value: unknown) => value is Teams): Teams | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isTeams(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveTeams(teams: Teams): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch {
    // 개인 창·저장소가 막힌 기기: 남기지 않는다
  }
}

/** 파티 모양인지(대충) */
function looksLikeParty(entry: unknown): boolean {
  const units = field(entry, "units");
  return (
    Array.isArray(units) &&
    units.length >= 1 &&
    units.length <= LAB_LIMITS.partyMax &&
    units.every((unit: unknown) => isLabUnitShape(unit)) &&
    typeof field(entry, "retreatHpPct") === "number"
  );
}

/** 기기 저장 값이 팀 모양인지(대충 — 서버가 다시 검사한다) */
export function looksLikeTeams(value: unknown): value is Teams {
  return looksLikeParty(field(value, "a")) && looksLikeParty(field(value, "b"));
}

/** 이 화면이 만든 유닛 JSON 모양인지(대충 — 서버가 다시 검사한다) */
export function isLabUnitShape(value: unknown): value is LabUnit {
  return (
    typeof field(value, "kind") === "string" &&
    typeof field(value, "level") === "number" &&
    Array.isArray(field(value, "elements")) &&
    Array.isArray(field(value, "skills"))
  );
}

/** ms → "1:05"(분:초) */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** ‰ → % 글(소수 한 자리) */
export function percentText(pm: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10);
}

export function numberText(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** 적정(밀리점, D-502: 맨손 Lv 1 = 11.5) → 글(소수 셋째 자리까지). 0 이하 = 적정 없음("—") */
export function appropriateText(milli: number, locale: string): string {
  if (milli <= 0) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(milli / 1000);
}
