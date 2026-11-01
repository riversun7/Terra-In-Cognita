// 설정 칸 차이를 팩에 넣는다 — docs/adr/2026-11-01-dev-settings-panel.md 11절(D1)
// 개발자 패널(/dev/tuning)의 [내보내기] 파일(terra-tuning-diff)을 받아 content/<팩>/tuning.json의 value만 바꾸고 manifest.json 판을 올린다.
// 사용: pnpm tuning:apply <차이.json> [--pack content/<팩 ID>] [--force] [--dry-run]
//   칸마다: 팩에 있는가(없으면 건너뜀), 지금 팩 값 = 차이의 from인가(아니면 건너뜀, --force면 넣음), 기술 범위 안인가(아니면 건너뜀).
//   바꾼 칸이 하나도 없으면 파일을 쓰지 않는다. 그다음 pnpm check:content → 작업 기록 → 커밋은 사람·에이전트가 한다(PLAN 7장 v1).
//   종료 코드: 0 바꿈(또는 바꿀 것 없음), 1 건너뛴 칸이 있음(바꾼 칸은 썼다), 2 사용법·파일 오류.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyTuningDiff, tuningDiffSchema } from "@terra/content";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * 팩 폴더에 차이를 적용한다(파일을 쓴다, dryRun이면 쓰지 않는다). 결과: 바꾼 칸·건너뛴 칸·새 팩 판
 * 차이의 packId가 팩 manifest의 packId와 다르면 던진다
 */
export function applyDiffToPack(packDir, diffValue, { force = false, dryRun = false } = {}) {
  const diff = tuningDiffSchema.parse(diffValue);
  const manifestPath = path.join(packDir, "manifest.json");
  const tuningPath = path.join(packDir, "tuning.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.packId !== diff.packId)
    throw new Error(`차이의 팩(${diff.packId})과 팩 폴더(${manifest.packId})가 다릅니다`);
  const file = JSON.parse(readFileSync(tuningPath, "utf8"));
  const result = applyTuningDiff(Array.isArray(file.entries) ? file.entries : [], diff, { force });
  let version = manifest.version;
  if (result.applied.length > 0 && !dryRun) {
    writeFileSync(tuningPath, json({ ...file, entries: result.entries }));
    version = manifest.version + 1;
    writeFileSync(manifestPath, json({ ...manifest, version }));
  }
  return { applied: result.applied, skipped: result.skipped, version };
}

const SKIP_TEXT = {
  unknown: "팩에 없는 칸",
  stale: "지금 팩 값이 내보낼 때와 다름(--force로 넣기)",
  out_of_range: "기술 범위 밖",
};

function main(argv) {
  const args = argv.slice(2);
  const option = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const known = new Set(["--pack", "--force", "--dry-run"]);
  const unknown = args.filter(
    (arg, i) => arg.startsWith("--") && !known.has(arg) && args[i - 1] !== "--pack",
  );
  const file = args.find((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--pack");
  if (!file || unknown.length > 0) {
    console.error("사용: pnpm tuning:apply <차이.json> [--pack content/<팩 ID>] [--force] [--dry-run]");
    return 2;
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  const packDir = path.resolve(root, option("--pack") ?? "content/core");
  let outcome;
  try {
    outcome = applyDiffToPack(packDir, JSON.parse(readFileSync(path.resolve(file), "utf8")), {
      force: args.includes("--force"),
      dryRun: args.includes("--dry-run"),
    });
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  for (const change of outcome.applied) console.log(`✓ ${change.id}: ${change.from} → ${change.to}`);
  for (const skip of outcome.skipped) {
    const current = skip.current === undefined ? "" : ` (지금 팩 값 ${skip.current})`;
    console.error(`- 건너뜀 ${skip.id}: ${SKIP_TEXT[skip.reason]}${current}`);
  }
  if (outcome.applied.length === 0) console.log("바꾼 칸이 없습니다(파일을 쓰지 않음)");
  else if (args.includes("--dry-run"))
    console.log(`미리 보기: ${outcome.applied.length}칸(파일을 쓰지 않음)`);
  else
    console.log(
      `${outcome.applied.length}칸을 바꾸고 팩 판을 ${outcome.version}로 올렸습니다 → pnpm check:content, 작업 기록, 커밋`,
    );
  return outcome.skipped.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv));
