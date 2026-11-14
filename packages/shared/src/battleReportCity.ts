// 전투 보고서의 실제 세계 도시 공성(기획 D-543, 질문 1383 나) 공용 자료 모양 — docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-14, 실제 도시·웨이브 수비)".
// 서버(apps/server/src/battleReport/worldCity.ts)가 살아 있는 세계에서 도시 하나를 읽기만 해서(바꾸지 않는다) 스냅숏을 만들고, 보고서 결과에
// 어느 도시·어느 때의 스냅숏을 썼는지 적는다. 화면은 저장된 스냅숏과 지금 도시를 견줘 "저장 뒤 바뀜"을 알린다(reportCityChanges).
// 판정·스냅숏 만들기는 서버만 한다.

/** 도시 목록 한 번에 받는 수 상한 */
export const REPORT_CITY_LIST_MAX = 50;
/** 실제 도시 수비 인원 상한(서버 정원사 웨이브와 같은 값 — apps/server/src/npc/gardener.ts WAVE_DEFENDERS) */
export const REPORT_WORLD_DEFENDERS = 10;

/** 보고서가 쓴 실제 도시 스냅숏(결과 칸 city) */
export interface ReportCityInfo {
  readonly cityId: number;
  /** 도시 이름(없으면 null — 화면이 "도시 N") */
  readonly name: string | null;
  /** 도시 주인 세력 ID·코드 */
  readonly owner: number;
  readonly factionCode: string | null;
  /** 도시가 선 2차맵·칸 */
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  /** 스냅숏을 뜬 실제 시각(ms) */
  readonly atMs: number;
  /** 행정 건물(넥서스)이 있나 — 없으면 옛 열린 맵(서버 정원사와 같다) */
  readonly hall: boolean;
  /** 건물 배치 지문(건물 ID·칸·성벽·성문·넥서스·지형 판 — 내구도는 뺀다) */
  readonly layoutHash: string;
  /** 전투맵 창 안 건물 수·성벽(성문 포함) 수 */
  readonly buildings: number;
  readonly walls: number;
  /** 넥서스(행정 건물) 지금 내구도, 성벽·성문 내구도 합 */
  readonly nexusDurability: number;
  readonly wallDurability: number;
  /** 그 도시 휴먼 수(세계 거울)와 수비로 든 세계 유닛 수(휴먼 상한 REPORT_WORLD_DEFENDERS + 수호신) */
  readonly humans: number;
  readonly defenders: number;
  readonly guardians: number;
  /** 수비 사양 지문(몸·장비·버프·남은 HP·물약 — 자리 빼고). 설정 판이 바뀌어도 바뀐다 */
  readonly defenseHash: string;
}

/** 도시 목록 한 줄(도시 고르기) */
export interface ReportCityListItem {
  readonly id: number;
  readonly name: string | null;
  readonly owner: number;
  readonly factionCode: string | null;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly humans: number;
  /** 2차맵이 떠 있나(아니면 배치를 읽을 수 없어 고를 수 없다) */
  readonly loaded: boolean;
  readonly hall: boolean;
  readonly start: boolean;
}

export interface ReportCityListInput {
  /** 이름에 든 글(대소문자 무시) 또는 도시 ID */
  readonly query?: string | undefined;
  readonly limit?: number | undefined;
}

export interface ReportCityListResponse {
  /** 세계(NPC 사회 런타임·DB)가 켜져 있나. 꺼져 있으면 목록이 비고 실제 도시를 고를 수 없다 */
  readonly available: boolean;
  readonly cities: readonly ReportCityListItem[];
}

/** 지금 도시 스냅숏(견주기). 도시가 없어졌거나 읽을 수 없으면 info = null */
export interface ReportCityResponse {
  readonly info: ReportCityInfo | null;
}

/** 저장된 스냅숏과 지금이 다른 곳 */
export type ReportCityChange = "gone" | "owner" | "layout" | "nexus" | "walls" | "defense";

/** 저장된 스냅숏 → 지금 스냅숏의 바뀐 곳(없으면 빈 목록). now가 null이면 도시가 없어졌거나 읽을 수 없다 */
export function reportCityChanges(saved: ReportCityInfo, now: ReportCityInfo | null): ReportCityChange[] {
  if (!now) return ["gone"];
  const out: ReportCityChange[] = [];
  if (now.owner !== saved.owner) out.push("owner");
  if (now.layoutHash !== saved.layoutHash || now.hall !== saved.hall) out.push("layout");
  if (now.nexusDurability !== saved.nexusDurability) out.push("nexus");
  if (now.wallDurability !== saved.wallDurability || now.walls !== saved.walls) out.push("walls");
  if (now.defenseHash !== saved.defenseHash || now.defenders !== saved.defenders) out.push("defense");
  return out;
}
