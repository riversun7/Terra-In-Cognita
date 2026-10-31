// 세력 기술 단계 — docs/adr/2026-10-31-faction-society-core.md "기술", 질문 121 기본안·D-396·D-5001
// - 지상 단계 1~5 = 짓고 돌릴 수 있는 시설 최고 레벨(D-5001 사다리). 단계 n에 오르는 조건 = 연구 시설 Lv ≥ n인 도시가 있고
//   그 도시 발전도 ≥ 문턱(n) + 연구 작업(작업량)을 마쳤다. 조건이 깨지면(도시·시설을 잃음) 바로 내려간다(D-396).
// - 설계도: 한 번 오른 단계는 다시 오를 때 작업량 할인(출발값 50%). 우주 단계(D-5067)는 그 위(이 파일 밖).
import type { SocietyCoefficients } from "./coefficients.ts";

export interface TechState {
  /** 지금 단계(1 이상) */
  level: number;
  /** 다음 단계로 쌓은 연구 작업량 */
  progress: number;
  /** 지금까지 가장 높았던 단계(설계도) */
  blueprint: number;
}

export interface ResearchSite {
  /** 연구 시설 레벨(0 = 없음) */
  readonly researchLevel: number;
  /** 도시 발전도 */
  readonly development: number;
}

/** 지금 도시·시설로 버틸 수 있는 가장 높은 단계(1~상한) */
export function techCeiling(sites: readonly ResearchSite[], c: SocietyCoefficients): number {
  let best = 1;
  for (const site of sites)
    for (let level = Math.min(c.techGroundMax, site.researchLevel); level > best; level--)
      if (site.development >= c.developmentPerTech * (level - 1)) {
        best = level;
        break;
      }
  return best;
}

/** 단계 n으로 오르는 작업량(설계도가 있으면 할인) */
export function researchCost(level: number, blueprint: number, c: SocietyCoefficients): number {
  const full = c.researchWorkBase * level;
  return level <= blueprint ? Math.floor((full * (10_000 - c.blueprintDiscountBp)) / 10_000) : full;
}

export interface TechChange {
  readonly from: number;
  readonly to: number;
  readonly cause: "research" | "regression";
}

/**
 * 하루치 연구(output = 작업량)를 넣고 상한에 맞춘다. 먼저 상한 아래로 내려가고(D-396), 그다음 작업량이 차면 오른다.
 * 바뀐 것 목록(차례대로)
 */
export function advanceTech(
  state: TechState,
  output: number,
  ceiling: number,
  c: SocietyCoefficients,
): TechChange[] {
  const changes: TechChange[] = [];
  if (state.level > ceiling) {
    changes.push({ from: state.level, to: ceiling, cause: "regression" });
    state.level = ceiling;
    state.progress = 0;
  }
  if (state.level >= ceiling) return changes;
  state.progress += Math.max(0, output);
  while (state.level < ceiling) {
    const cost = researchCost(state.level + 1, state.blueprint, c);
    if (state.progress < cost) break;
    state.progress -= cost;
    changes.push({ from: state.level, to: state.level + 1, cause: "research" });
    state.level += 1;
    state.blueprint = Math.max(state.blueprint, state.level);
  }
  if (state.level >= ceiling) state.progress = 0;
  return changes;
}
