// 2단계 뒤 국가 프리셋 검사 — docs/adr/2026-11-10-nation-editor.md 1절, docs/adr/2026-11-09-faction-profiles.md 1절.
// - 세력 약어(shortName)는 켜진 국가 프리셋 사이에서 하나여야 한다(대소문자 무시, nation_short_taken) — 세계 안에서 하나인 값이라 겹치면
//   서버가 처음 정할 때 기본값으로 바꿔 버린다.
// - 화폐 약어(currency.ticker)도 하나여야 한다(nation_ticker_taken). 화폐 코드(currency.code)도 하나여야 한다(nation_currency_code_taken —
//   원장 자산 "cur:<코드>"가 겹친다).
// - 도시 직무(personality.cityJobs)의 레시피는 그 시설의 레시피여야 한다(nation_job_facility — 다르면 서버가 그 줄을 쓰지 않는다).
// - 국력 등급(powerTier)을 적은 프리셋의 등급은 등급 표(nation_tiers)에 줄이 있어야 한다(nation_tier_missing — 없으면 서버가 등급 없이
//   옛 규칙으로 세운다). docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)".
// 꺼진 프리셋은 보지 않는다. 항목은 스키마를 통과한 파싱 결과(참조 = ContentRef)다.
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import { ContentRef } from "../schema/common.ts";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

export function checkNations(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const taken = (id: string, path: string, code: string, other: string) =>
    issues.push({
      stage: "references",
      level: "error",
      file: "nation_presets.json",
      id,
      path,
      code,
      params: { other },
      message: `${path} 값이 ${other}와 겹칩니다. 국가마다 하나씩 적으세요.`,
    });
  const recipeFacility = new Map(
    (pack.entries.get("recipes") ?? []).map((recipe) => {
      const facility = get(recipe, "facility");
      return [recipe.id, facility instanceof ContentRef ? facility.id : undefined];
    }),
  );
  const shorts = new Map<string, string>();
  const tickers = new Map<string, string>();
  const codes = new Map<string, string>();
  const tiers = new Set((pack.entries.get("nation_tiers") ?? []).map((tier) => tier.id));
  for (const nation of pack.entries.get("nation_presets") ?? []) {
    if (get(nation, "enabled") === false) continue;
    const tier = get(nation, "powerTier");
    if (typeof tier === "string" && !tiers.has(tier))
      issues.push({
        stage: "references",
        level: "error",
        file: "nation_presets.json",
        id: nation.id,
        path: "powerTier",
        code: "nation_tier_missing",
        params: { tier },
        message: `국력 등급 ${tier}의 줄이 등급 표(nation_tiers.json)에 없습니다.`,
      });
    const short = get(nation, "shortName");
    if (typeof short === "string") {
      const key = short.toLowerCase();
      const other = shorts.get(key);
      if (other === undefined) shorts.set(key, nation.id);
      else taken(nation.id, "shortName", "nation_short_taken", other);
    }
    const currency = get(nation, "currency");
    const ticker = get(currency, "ticker");
    if (typeof ticker === "string") {
      const other = tickers.get(ticker);
      if (other === undefined) tickers.set(ticker, nation.id);
      else taken(nation.id, "currency.ticker", "nation_ticker_taken", other);
    }
    const code = get(currency, "code");
    if (typeof code === "string") {
      const other = codes.get(code);
      if (other === undefined) codes.set(code, nation.id);
      else taken(nation.id, "currency.code", "nation_currency_code_taken", other);
    }
    const jobs = get(get(nation, "personality"), "cityJobs");
    if (Array.isArray(jobs))
      jobs.forEach((job: unknown, index) => {
        const facility = get(job, "facility");
        const recipe = get(job, "recipe");
        if (!(facility instanceof ContentRef) || !(recipe instanceof ContentRef)) return;
        const want = recipeFacility.get(recipe.id);
        if (want !== undefined && want !== facility.id)
          issues.push({
            stage: "references",
            level: "error",
            file: "nation_presets.json",
            id: nation.id,
            path: `personality.cityJobs[${index}].recipe`,
            code: "nation_job_facility",
            params: { recipe: recipe.id, facility: want },
            message: `레시피 ${recipe.id}는 시설 ${want}의 것입니다. 도시 직무의 시설과 맞추세요.`,
          });
      });
  }
  return issues;
}
