// 편집기 화면이 미리보기 상태에서 고르는 것(순수) — ADR 38 3·5·6·8절. 화면(PlanetEditorScreen 등)은 이 함수로만 고른다.
// - 지구본 결과: 본 결과(낡아도) → 없으면 빠른 결과. 슬라이더를 끄는 동안 오는 F5마다 엔진을 다시 만들지 않는다(5절).
// - 미니맵 결과: 가장 늦게 온 결과(받은 차례). 끄는 동안 F5가 결과마다 다시 그린다(3절).
// - 면적 차이: 같은 면 레벨의 공개본 요약과만 견준다(다른 레벨이면 차이 없음).
// - 기기 확인: 생성기 판이 다르면 바로 "판 다름", 공개본 빠른 결과(서버 확인 레벨)가 오면 해시를 견준다(6절).
//   해시 값은 코드에 적지 않는다(서버가 준 값과 이 기기가 만든 값만 견준다).
import type { PlanetSummary } from "@terra/planet/generator";
import type { PreviewEntry, PreviewErrorCode, RoleView } from "./previewTypes.ts";

/** 이 레벨 이상의 본 미리보기는 확인 창 뒤에 만든다(ADR 38 4절 "F9는 확인 창을 띄운다") */
export const CONFIRM_PREVIEW_LEVEL = 9;

/** 자리 둘(빠른·본)을 가진 역할 하나(공개본 또는 초안) */
export interface RoleViews {
  readonly quick: RoleView;
  readonly final: RoleView;
}

/** 지구본에 보일 결과: 본 결과(낡은 것 포함) → 없으면 빠른 결과 */
export function globeEntry(role: RoleViews): PreviewEntry | null {
  return role.final.entry ?? role.quick.entry;
}

/** 미니맵에 보일 결과: 두 자리 중 늦게 받은 것 */
export function latestEntry(role: RoleViews): PreviewEntry | null {
  const quick = role.quick.entry;
  const final = role.final.entry;
  if (!quick) return final;
  if (!final) return quick;
  return final.sequence >= quick.sequence ? final : quick;
}

/** 그 결과가 지금 청한 것인가(아니면 낡은 결과: 새 결과를 기다리는 중) */
export function isCurrentEntry(role: RoleViews, entry: PreviewEntry | null): boolean {
  if (!entry) return false;
  return (
    (role.final.current && role.final.entry === entry) || (role.quick.current && role.quick.entry === entry)
  );
}

/** 역할에서 보일 오류(본 자리 먼저). 없으면 null */
export function roleError(role: RoleViews): PreviewErrorCode | null {
  return role.final.error ?? role.quick.error;
}

/** 바이옴 면적표 한 줄 */
export interface AreaRow {
  readonly index: number;
  readonly id: string;
  /** 행성 대비(0~1) */
  readonly planetShare: number;
  /** 육지 대비(0~1, 육지 바이옴만) */
  readonly landShare: number | null;
  /** 공개본 대비 행성 몫 차이(초안 − 공개본, 0~1 단위). 견줄 공개본이 없으면 null */
  readonly diff: number | null;
}

/** 면적표 줄(바이옴 표 순서). 공개본 요약은 같은 면 레벨일 때만 견준다 */
export function areaRows(draft: PlanetSummary, base: PlanetSummary | null): AreaRow[] {
  const comparable = base !== null && base.faceLevel === draft.faceLevel ? base : null;
  return draft.biomes.map((biome) => {
    const other = comparable?.biomes.find((row) => row.id === biome.id);
    return {
      index: biome.index,
      id: biome.id,
      planetShare: biome.planetShare,
      landShare: biome.landShare,
      diff: other ? biome.planetShare - other.planetShare : null,
    };
  });
}

/** 견줄 공개본 요약: 같은 면 레벨의 공개본 본 결과 → 빠른 결과 */
export function comparableBaseSummary(base: RoleViews, faceLevel: number): PlanetSummary | null {
  for (const view of [base.final, base.quick]) {
    const summary = view.entry?.result.summary ?? null;
    if (view.current && summary && summary.faceLevel === faceLevel) return summary;
  }
  return null;
}

/** 열 때 확인(ADR 38 6절) */
export type DeviceCheck =
  /** 공개본 빠른 결과를 기다림 */
  | "pending"
  | "match"
  /** 이 기기의 미리보기가 서버와 다르다 → 내보내기를 막는다 */
  | "mismatch"
  /** 생성기 판이 다르다 → 앱을 새로 고치라고 하고 내보내기를 막는다 */
  | "generator_mismatch"
  /** 공개본 빠른 결과를 만들지 못했다(워커 없음·실패) */
  | "failed";

export interface ServerCheck {
  /** 서버 생성기 판(정의 조회) */
  readonly generatorVersion: number;
  /** 서버가 켤 때 만든 공개본 결과 해시(면 레벨) */
  readonly check: { readonly faceLevel: number; readonly hash: string };
}

/** 서버 확인 값과 이 기기의 공개본 빠른 자리를 견준다 */
export function deviceCheck(
  server: ServerCheck,
  deviceGeneratorVersion: number,
  baseQuick: RoleView,
): DeviceCheck {
  if (server.generatorVersion !== deviceGeneratorVersion) return "generator_mismatch";
  const { entry } = baseQuick;
  if (baseQuick.current && entry && entry.level === server.check.faceLevel) {
    return entry.result.fields.meta.hash === server.check.hash ? "match" : "mismatch";
  }
  if (baseQuick.error) return "failed";
  return "pending";
}

/** 내보내기를 막는 이유(없으면 null) */
export type ExportBlock = "generator_mismatch" | "mismatch" | "pending" | "failed" | "no_draft";

export function exportBlock(check: DeviceCheck, hasDraft: boolean): ExportBlock | null {
  if (check === "generator_mismatch" || check === "mismatch" || check === "pending" || check === "failed") {
    return check;
  }
  return hasDraft ? null : "no_draft";
}

/** u32 시드 글 → 수(틀리면 null). 앞뒤 빈칸은 무시하고 10진 숫자만 받는다 */
export function parseSeedText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,10}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= 0xffff_ffff ? value : null;
}

/** 무작위 u32 시드(crypto). 판정·생성과 무관한 화면 편의라 기기 난수를 쓴다 */
export function randomSeed(
  random: (array: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer> = (array) =>
    crypto.getRandomValues(array),
): number {
  return random(new Uint32Array(1))[0] ?? 0;
}
