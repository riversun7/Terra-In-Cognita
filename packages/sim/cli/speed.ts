// 시뮬레이터 속도 측정 — docs/adr/2026-10-31-rules-simulator.md "속도"
// 사용: pnpm --filter @terra/sim sim:speed [--units 1000,10000,100000] [--days 30,7,2] [--seed N]
//   synthetic 시나리오(유닛마다 이동 예약: 걷기 도착 + 30~90분 쉼, 세력 16의 판단, 하루마다 정산·기록·불변 조건)를 유닛 수별로
//   새 프로세스에서 돌려 걸린 시간·예약 수/초·가상 시간/실제 초·배속·최대 RSS를 표로 낸다. stub16(빈 세계) 180일과
//   econ16(경제: 생산·유지비·거래소·환전·중앙은행) 180일도 한 줄씩 넣는다.
//   pnpm test에 넣지 않는다(기계·부하에 따라 값이 다르다).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DAY_MS, runSimulation } from "../src/index.ts";
import { DEFAULT_PACK_DIR, fmt, readPack, readScenario, withUnits } from "./common.ts";

const { values } = parseArgs({
  options: {
    units: { type: "string", default: "1000,10000,100000" },
    days: { type: "string", default: "30,7,2" },
    seed: { type: "string", default: "1" },
    one: { type: "string" },
  },
});

interface Row {
  scenario: string;
  units: number;
  days: number;
  wallMs: number;
  events: number;
  arrive: number;
  rssMb: number;
  violations: number;
}

/** 한 번 재기(자식 프로세스): "<시나리오>:<유닛 수 또는 0>:<날 수>" */
function measure(spec: string): Row {
  const [name = "synthetic", unitsText = "0", daysText = "1"] = spec.split(":");
  let scenario = readScenario(name);
  if (Number(unitsText) > 0) scenario = withUnits(scenario, Number(unitsText));
  const days = Number(daysText);
  const catalog = scenario.economy ? readPack(DEFAULT_PACK_DIR, scenario).catalog : undefined;
  let peak = process.memoryUsage().rss;
  const started = performance.now();
  const summary = runSimulation({
    scenario,
    catalog,
    seed: Number(values.seed),
    days,
    onDay: () => {
      peak = Math.max(peak, process.memoryUsage().rss);
    },
  });
  return {
    scenario: name,
    units: summary.world.units,
    days,
    wallMs: performance.now() - started,
    events: summary.events.processed,
    arrive: summary.events.byKind.arrive ?? 0,
    rssMb: peak / 1024 / 1024,
    violations: summary.invariants.violations,
  };
}

if (values.one !== undefined) {
  process.stdout.write(JSON.stringify(measure(values.one)));
} else {
  const sizes = values.units.split(",").map(Number);
  const dayList = values.days.split(",").map(Number);
  const specs = [
    "stub16:0:180",
    "econ16:0:180",
    ...sizes.map((units, index) => `synthetic:${units}:${dayList[index] ?? dayList.at(-1) ?? 1}`),
  ];
  const self = fileURLToPath(import.meta.url);
  console.log(
    "| 시나리오 | 유닛 | 날 | 걸린 시간 s | 예약 | 예약/초 | 유닛당 예약 간격(분) | 가상 시간/실제 초 | 배속 | 최대 RSS MB | 위반 |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const spec of specs) {
    const out = execFileSync(process.execPath, [self, "--one", spec, "--seed", values.seed], {
      encoding: "utf8",
      maxBuffer: 1 << 20,
    });
    const row: Row = JSON.parse(out);
    const seconds = row.wallMs / 1000;
    const simMs = row.days * DAY_MS;
    const interval = row.arrive > 0 ? (row.units * simMs) / row.arrive / 60_000 : 0;
    console.log(
      `| ${row.scenario} | ${fmt(row.units)} | ${row.days} | ${fmt(seconds, 2)} | ${fmt(row.events)} | ${fmt(row.events / seconds)} | ` +
        `${row.arrive > 0 ? fmt(interval, 1) : "-"} | ${fmt(simMs / 3_600_000 / seconds, 1)} h | ${fmt(simMs / row.wallMs)} | ` +
        `${fmt(row.rssMb)} | ${row.violations} |`,
    );
  }
}
