// 시뮬레이터 실행 도구 — docs/adr/2026-10-31-rules-simulator.md
// 사용: pnpm --filter @terra/sim sim <시나리오> [--seed N] [--days D] [--out 줄.jsonl] [--summary 요약.json]
//        [--pack 팩폴더] [--units N] [--check-every D]
//   <시나리오>: scenarios/<이름>.json의 이름 또는 .json 경로. 상대 경로는 packages/sim 기준(pnpm --filter가 거기서 돈다).
//   요약은 --summary가 없으면 표준 출력. 걸린 시간·배속은 표준 오류(요약에 넣지 않는다 — 같은 시드면 요약이 같다).
//   종료 코드: 불변 조건 위반이 있으면 3(서버 check-world와 같다). D-391 통과 여부는 종료 코드에 넣지 않는다.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DAY_MS, runSimulation } from "../src/index.ts";
import { DEFAULT_PACK_DIR, fmt, readPack, readScenario, withUnits } from "./common.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    seed: { type: "string", default: "1" },
    days: { type: "string", default: "30" },
    out: { type: "string" },
    summary: { type: "string" },
    pack: { type: "string", default: DEFAULT_PACK_DIR },
    units: { type: "string" },
    "check-every": { type: "string", default: "1" },
  },
});

const name = positionals[0];
if (!name) {
  console.error(
    "사용: pnpm --filter @terra/sim sim <시나리오> [--seed N] [--days D] [--out 줄.jsonl] [--summary 요약.json]",
  );
  process.exit(2);
}
let scenario = readScenario(name);
if (values.units !== undefined) scenario = withUnits(scenario, Number(values.units));
const { catalog, combat, tuning, ...content } = readPack(values.pack, scenario);
const days = Number(values.days);
const lines: string[] = [];
const started = performance.now();
const summary = runSimulation({
  scenario,
  seed: Number(values.seed),
  days,
  content,
  catalog,
  combatCatalog: combat,
  tuning,
  checkEveryDays: Number(values["check-every"]),
  sink: values.out === undefined ? undefined : (line) => lines.push(line),
});
const wallMs = performance.now() - started;
if (values.out !== undefined) writeFileSync(values.out, `${lines.join("\n")}\n`);
const text = `${JSON.stringify(summary, null, 2)}\n`;
if (values.summary === undefined) process.stdout.write(text);
else writeFileSync(values.summary, text);

const simHours = (days * DAY_MS) / 3_600_000;
const events = summary.events.processed;
console.error(
  `scenario=${summary.scenario} seed=${summary.seed} days=${days} units=${fmt(summary.world.units)} ` +
    `wall=${fmt(wallMs)}ms events=${fmt(events)} (${fmt(events / (wallMs / 1000))}/s) ` +
    `sim=${fmt(simHours / (wallMs / 1000), 1)} h/s (×${fmt((days * DAY_MS) / wallMs)}) ` +
    `hash=${summary.linesHash} violations=${summary.invariants.violations} ` +
    `D-391=${summary.metrics.monopoly.pass ? "M" : "m"}${summary.metrics.churn.pass ? "C" : "c"}${summary.metrics.tech.pass ? "T" : "t"}`,
);
if (summary.invariants.violations > 0) process.exit(3);
