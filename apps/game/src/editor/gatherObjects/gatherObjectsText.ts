// 채집 오브젝트 편집기 문구 표·작은 도우미(기획 D-552). 메시지 키는 표로 고른다(oxlint import(namespace) — AGENTS 6장).
import { m } from "../../paraglide/messages.js";
import type { GatherSource, LocalName, SurfaceName } from "./gatherObjectsModel.ts";

/** 자리 종류 이름 */
export const SOURCE_TEXT: Readonly<Record<GatherSource, () => string>> = {
  prop: m.dev_gather_objects_source_prop,
  rock: m.dev_gather_objects_source_rock,
  plot: m.dev_gather_objects_source_plot,
  outcrop: m.dev_gather_objects_source_outcrop,
  site: m.dev_gather_objects_source_site,
  school: m.dev_gather_objects_source_school,
};

/** 지표 이름 */
export const SURFACE_TEXT: Readonly<Record<SurfaceName, () => string>> = {
  water: m.dev_gather_objects_surface_water,
  grass: m.dev_gather_objects_surface_grass,
  dirt: m.dev_gather_objects_surface_dirt,
  rock: m.dev_gather_objects_surface_rock,
  sand: m.dev_gather_objects_surface_sand,
  gravel: m.dev_gather_objects_surface_gravel,
  snow: m.dev_gather_objects_surface_snow,
  ice: m.dev_gather_objects_surface_ice,
  mud: m.dev_gather_objects_surface_mud,
  ash: m.dev_gather_objects_surface_ash,
  shallow_water: m.dev_gather_objects_surface_shallow_water,
};

/** 이름(언어) */
export function nameText(name: LocalName, locale: "ko" | "en"): string {
  return name[locale];
}

/** 백만분율 → "12.5%"(소수 한 자리) */
export function percentText(ppm: number): string {
  return `${(Math.round(ppm / 1000) / 10).toFixed(1)}%`;
}

/** 파일 내려받기(브라우저) */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
