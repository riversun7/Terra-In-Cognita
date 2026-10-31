// 행성 생성기 벤치마크 — 면 레벨마다 단계별 시간과 메모리(S2 시험 행성 정의).
// 실행: pnpm --filter @terra/planet bench [면 레벨 ...] [--continents <배치>[:수]]  (기본 6 7 9. 또는 packages/planet에서
// node bench/generator.ts 6 7 9). --continents는 대륙 배치(ADR 2026-10-31-continent-layouts)를 얹어 잰다(예: earthlike:3).
// pnpm test에 넣지 않는다(시간을 재는 스크립트라 결과가 기계마다 다르다). 면 레벨마다 새 프로세스로 재면
// 최대 RSS가 그 레벨 것만 나온다: 기본은 레벨마다 자식 프로세스를 띄운다(--inline이면 한 프로세스에서).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type GeneratorStage, runPlanetGenerator } from "../src/generator/index.ts";
import { continentsArgument, loadPackPlanet, withContinents } from "./testPlanet.ts";

const mib = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MiB`;

function measure(faceLevel: number, continentsSpec: string | undefined): void {
  const input = withContinents(
    loadPackPlanet("s2_test_planet", faceLevel).input,
    continentsArgument(continentsSpec),
  );
  const rows: {
    stage: GeneratorStage;
    ms: number;
    rss: number;
    heap: number;
    buffers: number;
    maxRss: number;
  }[] = [];
  const start = performance.now();
  let last = start;
  const result = runPlanetGenerator(input, {
    onStage(stage) {
      const now = performance.now();
      const memory = process.memoryUsage();
      rows.push({
        stage,
        ms: now - last,
        rss: memory.rss,
        heap: memory.heapUsed,
        buffers: memory.arrayBuffers,
        maxRss: process.resourceUsage().maxRSS * 1024,
      });
      last = now;
    },
  });
  const total = performance.now() - start;
  const cells = 6 * 4 ** faceLevel;
  const maxHeapBuffers = Math.max(...rows.map((row) => row.heap + row.buffers));
  const layout = input.continents ? `, 대륙 배치 ${input.continents.layout}:${input.continents.count}` : "";
  console.log(
    `\n면 레벨 ${faceLevel}${layout}: 칸 ${cells.toLocaleString()}, 합계 ${(total / 1000).toFixed(2)} s, 해시 ${result.fields.meta.hash}, 단계 끝 힙 + 타입 배열 최대 ${mib(maxHeapBuffers)}`,
  );
  console.log("단계            시간(ms)   RSS      힙      타입 배열   최대 RSS(여기까지)");
  for (const row of rows) {
    console.log(
      `${row.stage.padEnd(15)} ${row.ms.toFixed(0).padStart(8)} ${mib(row.rss).padStart(8)} ${mib(row.heap).padStart(7)} ${mib(row.buffers).padStart(10)} ${mib(row.maxRss).padStart(10)}`,
    );
  }
}

const args = process.argv.slice(2);
const inline = args.includes("--inline");
const flag = args.indexOf("--continents");
const continentsSpec = flag >= 0 ? args[flag + 1] : undefined;
const levels = args.filter((arg, k) => !arg.startsWith("--") && (flag < 0 || k !== flag + 1)).map(Number);
const chosen = levels.length > 0 ? levels : [6, 7, 9];
console.log(`Node ${process.version}, ${process.platform} ${process.arch}`);
if (inline || chosen.length === 1) {
  for (const level of chosen) measure(level, continentsSpec);
} else {
  const self = fileURLToPath(import.meta.url);
  const extra = continentsSpec === undefined ? [] : ["--continents", continentsSpec];
  for (const level of chosen) {
    const output = execFileSync(process.execPath, [self, String(level), "--inline", ...extra], {
      encoding: "utf8",
    });
    process.stdout.write(output.split("\n").slice(1).join("\n"));
  }
}
