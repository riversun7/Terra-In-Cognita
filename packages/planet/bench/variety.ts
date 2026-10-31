// 반복·단조로움 검사 측정 — 면 레벨(기본 9) × 시드(기본 팩·1·42·2718281828)의 지표를 표와 JSON으로 내고, 기준 JSON과
// 비교한다.
// 실행: pnpm --filter @terra/planet variety [면 레벨] [시드 목록] [--json <경로>] [--compare <경로>] [--strict]
//   예: pnpm --filter @terra/planet variety 9 pack,1,42,2718281828 --compare bench/variety-baseline.json
//   명령은 packages/planet에서 돈다: 상대 경로는 packages/planet 기준이다. 기준 파일은 bench/variety-baseline.json
//   (출력 판 3, F9 × 팩·1·42·2718281828). 시드 1·42는 생성기를 맞출 때 본 시드, 2718281828은 맞출 때 보지 않은 시드
//   (main의 편집 전용 행성 s2_editor_planet과 같은 시드)다. 출력 판 2의 같은 측정은 bench/variety-baseline-v2.json.
// - 지표 계산은 시험(src/generator/variety.test.ts, F7)과 같은 코드다(testVariety*.ts). 모은 맵 레벨 지표(F−4·F−3·F−2,
//   F9면 L5·L6·L7: 기기가 실제로 보는 타일 값)는 여기서만 잰다(testVarietyLevels.ts). pnpm test에 넣지 않는다:
//   F9 × 시드 4개는 약 2분 걸린다.
// - --compare: 같은 시드의 문턱 있는 지표를 기준과 비교해 문턱 쪽으로 10%(기준이 0 근처면 0.01) 넘게 나빠진 것을 알린다.
//   땅 바이옴 몫이 기준과 얼마나 다른지(%p)도 찍는다. 종료 코드는 0이다(--strict면 나빠진 지표가 있을 때 1).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GENERATOR_VERSION, runPlanetGenerator } from "../src/generator/index.ts";
import {
  type SeedVariety,
  VARIETY_TARGETS,
  type VarietyMetric,
  crossSeedMetrics,
  fieldMetrics,
  formatVarietyReport,
  varietyContext,
} from "../src/generator/testVariety.ts";
import { levelMetrics } from "../src/generator/testVarietyLevels.ts";
import { unitMetrics } from "../src/generator/testVarietyUnit.ts";
import { loadPackPlanet } from "./testPlanet.ts";

interface Options {
  readonly faceLevel: number;
  readonly seeds: readonly string[];
  readonly json: string | undefined;
  readonly compare: string | undefined;
  readonly strict: boolean;
}

function parseOptions(args: readonly string[]): Options {
  const rest: string[] = [];
  let json: string | undefined;
  let compare: string | undefined;
  let strict = false;
  for (let k = 0; k < args.length; k++) {
    const arg = args[k] ?? "";
    if (arg === "--json") json = args[++k];
    else if (arg === "--compare") compare = args[++k];
    else if (arg === "--strict") strict = true;
    else rest.push(arg);
  }
  return {
    faceLevel: Number(rest[0] ?? 9),
    seeds: (rest[1] ?? "pack,1,42,2718281828").split(","),
    json,
    compare,
    strict,
  };
}

/** JSON에 적는 값: 유효 숫자 6자리 */
const round6 = (value: number) => Number(value.toPrecision(6));
const record = (metrics: readonly VarietyMetric[]) =>
  Object.fromEntries(metrics.map((entry) => [entry.name, round6(entry.value)]));

const options = parseOptions(process.argv.slice(2));
const planet = loadPackPlanet("s2_test_planet", options.faceLevel);
const seeds = options.seeds.map((seed) => (seed === "pack" ? planet.input.seed : Number(seed)));
console.log(
  `Node ${process.version}, 면 레벨 ${options.faceLevel}, 시드 ${seeds.join(", ")}, 생성기 판 ${GENERATOR_VERSION}`,
);
const ctx = varietyContext(options.faceLevel);
const perSeed: SeedVariety[] = [];
const hashes: Record<string, string> = {};
const ms: Record<string, { generate: number; metrics: number }> = {};
const levelShares: Record<string, unknown> = {};
for (const seed of seeds) {
  const input = { ...planet.input, seed };
  const started = performance.now();
  const details = runPlanetGenerator(input);
  const generated = performance.now();
  const result = fieldMetrics(ctx, details, input);
  const levels = levelMetrics(ctx, details.fields, input.biomes);
  levelShares[String(seed)] = Object.fromEntries(
    Object.entries(levels.shares).map(([level, shares]) => [
      level,
      Object.fromEntries(Object.entries(shares).map(([id, share]) => [id, round6(share)])),
    ]),
  );
  perSeed.push({
    ...result,
    metrics: [...result.metrics, ...levels.metrics, ...unitMetrics(ctx, seed, input.settings)],
  });
  const done = performance.now();
  hashes[String(seed)] = details.fields.meta.hash;
  ms[String(seed)] = { generate: Math.round(generated - started), metrics: Math.round(done - generated) };
  console.log(
    `시드 ${seed}: 생성 ${Math.round(generated - started)} ms, 해시 ${details.fields.meta.hash}, 지표 ${Math.round(done - generated)} ms`,
  );
}
const cross = crossSeedMetrics(
  perSeed.map((result) => result.bandTable),
  planet.input.biomes.length,
);
console.log(`\n${formatVarietyReport(seeds, perSeed, cross)}`);

const report = {
  generatorVersion: GENERATOR_VERSION,
  faceLevel: options.faceLevel,
  seeds,
  hashes,
  perSeed: Object.fromEntries(seeds.map((seed, k) => [String(seed), record(perSeed[k]?.metrics ?? [])])),
  landShares: Object.fromEntries(
    seeds.map((seed, k) => [
      String(seed),
      Object.fromEntries(
        Object.entries(perSeed[k]?.landShares ?? {}).map(([id, share]) => [id, round6(share)]),
      ),
    ]),
  ),
  levelShares,
  cross: record(cross),
  targets: VARIETY_TARGETS,
  ms,
};
if (options.json) {
  writeFileSync(path.resolve(options.json), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`JSON: ${path.resolve(options.json)}`);
}

// ── 기준과 비교 ──
function field(value: unknown, name: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, name) : undefined;
}
function numberAt(value: unknown, ...names: string[]): number | undefined {
  let at = value;
  for (const name of names) at = field(at, name);
  return typeof at === "number" ? at : undefined;
}

/** 문턱 방향으로 10%(기준이 0 근처면 0.01) 넘게 나빠졌으면 true */
function worse(name: string, base: number, value: number): boolean {
  const target = VARIETY_TARGETS[name];
  if (!target) return false;
  const tolerance = 0.1 * Math.max(Math.abs(base), 0.1);
  return target.op === "<=" ? value - base > tolerance : base - value > tolerance;
}

if (options.compare) {
  const file = path.resolve(options.compare);
  const baseline: unknown = JSON.parse(readFileSync(file, "utf8"));
  const baseLevel = numberAt(baseline, "faceLevel");
  console.log(
    `\n기준 ${file}: 생성기 판 ${numberAt(baseline, "generatorVersion")}, 면 레벨 ${baseLevel}${baseLevel === options.faceLevel ? "" : " (면 레벨이 달라 값이 바로 비교되지 않는다)"}`,
  );
  const regressions: string[] = [];
  for (const seed of seeds) {
    const current = report.perSeed[String(seed)] ?? {};
    for (const [name, value] of Object.entries(current)) {
      const base = numberAt(baseline, "perSeed", String(seed), name);
      if (base === undefined) continue;
      if (worse(name, base, value)) regressions.push(`시드 ${seed} ${name}: ${base} → ${value}`);
    }
    let largest = 0;
    let largestId = "";
    for (const [id, share] of Object.entries(report.landShares[String(seed)] ?? {})) {
      const base = numberAt(baseline, "landShares", String(seed), id);
      if (base !== undefined && Math.abs(share - base) > Math.abs(largest)) {
        largest = share - base;
        largestId = id;
      }
    }
    console.log(
      `시드 ${seed}: 땅 바이옴 몫이 기준과 가장 다른 것 ${largestId || "—"} ${(100 * largest).toFixed(2)}%p`,
    );
  }
  for (const [name, value] of Object.entries(report.cross)) {
    const base = numberAt(baseline, "cross", name);
    if (base !== undefined && worse(name, base, value)) regressions.push(`${name}: ${base} → ${value}`);
  }
  if (regressions.length === 0) console.log("기준보다 10% 넘게 나빠진 지표 없음");
  else console.log(`기준보다 10% 넘게 나빠진 지표 ${regressions.length}개:\n  ${regressions.join("\n  ")}`);
  if (options.strict && regressions.length > 0) process.exitCode = 1;
}
