#!/usr/bin/env node
// S3 규모 계단 시험 요약 — docs/adr/2026-10-31-s3-server-stage.md 6·7절
// ops/s3-ramp.sh가 남긴 폴더를 읽어 Markdown 표와 결론을 찍는다(GitHub Actions Summary에 붙인다).
// 폴더: meta.txt(CPU·이미지·시각), steps.tsv(계단마다 한 줄), metrics-<봇 수>.log(서버 1분 지표 줄).
// steps.tsv 열(탭): bots maps bootMs state recoveryMs recoveryBootMs issues
//   state = ok | loop(p99 > 50ms) | memory(상한 가까움) | died(프로세스 죽음·준비 안 됨)
// 쓰는 법: node ops/s3-ramp-summary.mjs <폴더>
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("사용: node ops/s3-ramp-summary.mjs <폴더>");
  process.exit(2);
}

const read = (name) => {
  const file = path.join(dir, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};

/** 서버 1분 지표 줄(pino JSON) */
function metricsOf(bots) {
  return read(`metrics-${bots}.log`)
    .split("\n")
    .map((line) => {
      try {
        const parsed = JSON.parse(line.slice(line.indexOf("{")));
        return parsed.metric === "server" ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((row) => row !== null);
}

const avg = (values) => (values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length);
const max = (values) => (values.length === 0 ? null : Math.max(...values));
const fmt = (value, digits = 0) => (value === null || Number.isNaN(value) ? "–" : value.toFixed(digits));

const steps = read("steps.tsv")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const [bots, maps, bootMs, state, recoveryMs, recoveryBootMs, issues] = line.split("\t");
    return {
      bots: Number(bots),
      maps: Number(maps),
      bootMs: bootMs === "" ? null : Number(bootMs),
      state,
      recoveryMs: recoveryMs === "" || recoveryMs === undefined ? null : Number(recoveryMs),
      recoveryBootMs: recoveryBootMs === "" || recoveryBootMs === undefined ? null : Number(recoveryBootMs),
      issues: issues === "" || issues === undefined ? null : Number(issues),
    };
  });

const rows = [];
let previous = null;
for (const step of steps) {
  const all = metricsOf(step.bots);
  // 첫 줄은 부팅이 든 1분이라 뺀다(줄이 둘 이상일 때)
  const lines = all.length > 1 ? all.slice(1) : all;
  const rss = avg(lines.map((m) => m.rssMb));
  const cpu = avg(lines.map((m) => m.cpuPercent));
  const row = {
    ...step,
    p99: max(lines.map((m) => m.eventLoopP99Ms)),
    loopMax: max(lines.map((m) => m.eventLoopMaxMs)),
    rss,
    heap: avg(lines.map((m) => m.heapUsedMb)),
    cpu,
    dbRowsPerSec: avg(lines.map((m) => (m.dbRows ?? 0) / 60)),
    commitMax: max(lines.map((m) => m.dbCommitMsMax ?? 0)),
    pending: max(lines.map((m) => m.dbPending ?? 0)),
    units: max(lines.map((m) => m.s1Units ?? 0)),
    // 1천 개당 CPU(ms/초): 코어 하나 기준 % × 10 = ms/초
    cpuMsPer1k: cpu === null ? null : (cpu * 10) / (step.bots / 1000),
    // 1천 개당 늘어난 메모리(MB): 앞 계단과의 차이
    mbPer1k:
      previous && rss !== null && previous.rss !== null && step.bots > previous.bots
        ? ((rss - previous.rss) / (step.bots - previous.bots)) * 1000
        : null,
  };
  rows.push(row);
  if (step.state === "ok") previous = row;
}

const out = [];
out.push("## S3 규모 계단 시험");
out.push("");
out.push("```");
out.push(read("meta.txt").trim());
out.push("```");
out.push("");
out.push(
  "| 봇 | 2차맵 | 결과 | 부팅 ms | 루프 p99 최대 ms | 루프 최대 ms | RSS MB | 힙 MB | CPU %(코어 하나) | 1천 개당 CPU ms/초 | 1천 개당 늘어난 MB | DB 행/초 | 커밋 최대 ms | 밀린 쓰기 | SIGKILL 복구 ms (부팅 ms) | 위반 |",
);
out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const row of rows) {
  out.push(
    `| ${row.bots} | ${row.maps} | ${row.state} | ${fmt(row.bootMs)} | ${fmt(row.p99, 1)} | ${fmt(row.loopMax, 1)} | ${fmt(row.rss)} | ${fmt(row.heap)} | ${fmt(row.cpu, 1)} | ${fmt(row.cpuMsPer1k, 2)} | ${fmt(row.mbPer1k, 1)} | ${fmt(row.dbRowsPerSec, 0)} | ${fmt(row.commitMax)} | ${fmt(row.pending)} | ${fmt(row.recoveryMs)} (${fmt(row.recoveryBootMs)}) | ${fmt(row.issues)} |`,
  );
}
out.push("");
const survived = rows.filter((row) => row.state === "ok");
const failedRow = rows.find((row) => row.state !== "ok");
const best = survived.at(-1);
const reasons = {
  loop: "이벤트 루프 p99 > 50ms",
  memory: "메모리가 컨테이너 상한에 가까움",
  died: "프로세스 죽음·준비 안 됨",
};
if (best)
  out.push(
    `- 버틴 가장 큰 계단: 봇 ${best.bots}개(2차맵 ${best.maps}개), 루프 p99 최대 ${fmt(best.p99, 1)}ms, RSS ${fmt(best.rss)}MB.`,
  );
if (failedRow)
  out.push(`- 처음 무너진 계단: 봇 ${failedRow.bots}개 — ${reasons[failedRow.state] ?? failedRow.state}.`);
else out.push("- 모든 계단을 버텼다(이 시험의 상한까지).");
out.push(
  "- 1천 개당 CPU ms/초 = 코어 하나 기준 CPU % × 10 ÷ (봇 수 ÷ 1000). 워커 스레드를 포함한다. 다른 기계는 이 값을 그 기계의 코어 속도 비로 나눠 어림한다(Assumed).",
);
console.log(out.join("\n"));
