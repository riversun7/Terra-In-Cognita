// 군단 프리셋 저장(이 기기 localStorage)과 1:1·팀 바꾸기 순수 도우미.
// 파티 프리셋은 서버 DB(battleLab.savePreset)가 맡고, 여러 파티를 묶은 군단은 여기서 빠르게 저장·불러오기한다.
import { LAB_LIMITS, type LabParty, normalizeLabName } from "@terra/shared/battleLab";
import { REPORT_LIMITS } from "@terra/shared/battleReport";
import { field } from "../../../net/json.ts";
import { type Teams, looksLikeParty } from "./labModel.ts";

/** 이 기기에 남기는 군단 프리셋 하나 */
export interface SavedLegion {
  readonly id: string;
  readonly name: string;
  readonly parties: readonly LabParty[];
  readonly updatedAtMs: number;
}

const LEGIONS_STORAGE_KEY = "terra.battleLab.legions.v1";
const MAX_SAVED_LEGIONS = 40;

function isSavedLegion(value: unknown): value is SavedLegion {
  const id = field(value, "id");
  const name = field(value, "name");
  const parties = field(value, "parties");
  const updatedAtMs = field(value, "updatedAtMs");
  return (
    typeof id === "string" &&
    id.length > 0 &&
    typeof name === "string" &&
    normalizeLabName(name, LAB_LIMITS.nameMax) !== null &&
    Array.isArray(parties) &&
    parties.length >= 1 &&
    parties.length <= REPORT_LIMITS.legionPartiesEditMax &&
    parties.every((party: unknown) => looksLikeParty(party)) &&
    typeof updatedAtMs === "number" &&
    Number.isFinite(updatedAtMs)
  );
}

/** 이 기기에 저장된 군단 목록(모양이 맞는 것만) */
export function loadSavedLegions(): SavedLegion[] {
  try {
    const raw = globalThis.localStorage?.getItem(LEGIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedLegion).slice(0, MAX_SAVED_LEGIONS);
  } catch {
    return [];
  }
}

function writeSavedLegions(list: readonly SavedLegion[]): void {
  try {
    globalThis.localStorage?.setItem(LEGIONS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 저장소를 못 쓰는 환경은 조용히 넘긴다
  }
}

/** 현재 군단(1번 파티 + 추가 파티)을 이름으로 저장(같은 이름이 있으면 덮어쓴다) */
export function saveLegionPreset(
  current: readonly SavedLegion[],
  rawName: string,
  parties: readonly LabParty[],
  nowMs = Date.now(),
): { readonly list: SavedLegion[]; readonly saved: SavedLegion } | null {
  const name = normalizeLabName(rawName, LAB_LIMITS.nameMax);
  if (name === null || parties.length === 0) return null;
  const trimmed = parties.slice(0, REPORT_LIMITS.legionPartiesEditMax);
  const existing = current.find((entry) => entry.name === name);
  const saved: SavedLegion = {
    id: existing?.id ?? `leg_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    parties: trimmed,
    updatedAtMs: nowMs,
  };
  const rest = current.filter((entry) => entry.id !== saved.id);
  const list = [saved, ...rest].slice(0, MAX_SAVED_LEGIONS);
  writeSavedLegions(list);
  return { list, saved };
}

/** 저장된 군단 하나 지우기 */
export function deleteLegionPreset(current: readonly SavedLegion[], id: string): SavedLegion[] {
  const list = current.filter((entry) => entry.id !== id);
  writeSavedLegions(list);
  return list;
}

/** 파티에서 고른 유닛 한 명만 남긴다(1:1 비교용) */
export function toDuelParty(party: LabParty, keepIndex = 0): LabParty {
  const picked = party.units[keepIndex] ?? party.units[0];
  return picked ? { ...party, units: [picked] } : party;
}

/** 팀 A와 팀 B를 맞바꾼다 */
export function swapTeams(teams: Teams): Teams {
  return { a: teams.b, b: teams.a };
}

/** 팀 A·B가 모두 1파티 1유닛(1:1 비교 상태)인가 */
export function isDuelMatchup(teams: Teams, extraACount: number, extraBCount: number): boolean {
  return extraACount === 0 && extraBCount === 0 && teams.a.units.length === 1 && teams.b.units.length === 1;
}

/** 군단 전체 유닛 수 합계 */
export function legionUnitCount(first: LabParty, extra: readonly LabParty[]): number {
  let total = first.units.length;
  for (const party of extra) total += party.units.length;
  return total;
}
