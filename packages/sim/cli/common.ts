// 실행 도구 공용 — 시나리오·콘텐츠 팩 읽기 (docs/adr/2026-10-31-rules-simulator.md "실행 도구")
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatIssue, hasErrors } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { type Scenario, parseScenario } from "../src/index.ts";

/** 저장소의 기본 콘텐츠 팩 */
export const DEFAULT_PACK_DIR = fileURLToPath(new URL("../../../content/core", import.meta.url));

/** 이름(scenarios/<이름>.json) 또는 .json 경로로 시나리오를 읽는다 */
export function readScenario(nameOrPath: string): Scenario {
  const file = nameOrPath.endsWith(".json")
    ? nameOrPath
    : fileURLToPath(new URL(`../scenarios/${nameOrPath}.json`, import.meta.url));
  const value: unknown = JSON.parse(readFileSync(file, "utf8"));
  return parseScenario(value);
}

/** 콘텐츠 팩을 읽고 시나리오가 가리키는 행성이 팩에 있는지 본다. 판·해시를 돌려준다 */
export function readPack(dir: string, scenario: Scenario): { version: string; hash: string } {
  const loaded = loadContentPack(dir);
  if (hasErrors(loaded.issues) || !loaded.pack || !loaded.version || !loaded.hash) {
    throw new Error(
      [`콘텐츠 팩 검증 실패(${dir})`, ...loaded.issues.map((issue) => formatIssue(issue, `${dir}/`))].join(
        "\n",
      ),
    );
  }
  if (scenario.planet !== undefined) {
    const planets = loaded.pack.entries.get("planets") ?? [];
    if (!planets.some((entry) => entry.id === scenario.planet))
      throw new Error(`시나리오 ${scenario.id}의 행성 ${scenario.planet}이(가) 팩에 없습니다`);
  }
  return { version: loaded.version, hash: loaded.hash };
}

/** 세력마다 일꾼 수를 바꿔 전체 유닛이 약 total개가 되게 한다(속도 측정용) */
export function withUnits(scenario: Scenario, total: number): Scenario {
  const factions = scenario.factions.reduce((sum, group) => sum + group.count, 0);
  const each = Math.ceil(total / factions);
  return { ...scenario, factions: scenario.factions.map((group) => ({ ...group, workers: each })) };
}

/** 사람이 읽는 수(천 단위 쉼표) */
export function fmt(value: number, digits = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
