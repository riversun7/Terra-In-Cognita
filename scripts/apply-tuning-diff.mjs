// 설정 칸 차이를 팩에 넣는다 — docs/adr/2026-11-01-dev-settings-panel.md 11절(D1)
// 개발자 패널(/dev/tuning)의 [내보내기] 파일(terra-tuning-diff)을 받아 content/<팩>/tuning.json의 value만 바꾸고 manifest.json 판을 올린다.
// 차이에 가중치 표 칸(statRows, 밸런스 화면 /dev/balance — docs/adr/2026-11-01-balance-screen.md 2절)이 있으면 stat_rows.json의 그 칸도
// 같은 규칙으로 바꾼다(판은 한 번만 올린다). 계산식 차이(formulas, docs/adr/2026-11-01-formula-editor.md)가 있으면 formulas.json의
// expression·stat_rows.json의 formula도 바꾼다(지금 팩 식 = from, 그 칸 변수로 읽히는 식만).
// 사용: pnpm tuning:apply <차이.json> [--pack content/<팩 ID>] [--force] [--dry-run]
//   칸마다: 팩에 있는가(없으면 건너뜀), 지금 팩 값 = 차이의 from인가(아니면 건너뜀, --force면 넣음), 기술 범위 안인가(아니면 건너뜀).
//   바꾼 칸이 하나도 없으면 파일을 쓰지 않는다. 그다음 pnpm check:content → 작업 기록 → 커밋은 사람·에이전트가 한다(PLAN 7장 v1).
//   종료 코드: 0 바꿈(또는 바꿀 것 없음), 1 건너뛴 칸이 있음(바꾼 칸은 썼다), 2 사용법·파일 오류.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyFormulasDiff, applyStatRowsDiff, applyTuningDiff, tuningDiffSchema } from "@terra/content";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * 팩 폴더에 차이를 적용한다(파일을 쓴다, dryRun이면 쓰지 않는다). 결과: 바꾼 칸·건너뛴 칸(설정 칸, 가중치 칸 rows)·새 팩 판
 * 차이의 packId가 팩 manifest의 packId와 다르면 던진다
 */
export function applyDiffToPack(packDir, diffValue, { force = false, dryRun = false } = {}) {
  const diff = tuningDiffSchema.parse(diffValue);
  const manifestPath = path.join(packDir, "manifest.json");
  const tuningPath = path.join(packDir, "tuning.json");
  const statRowsPath = path.join(packDir, "stat_rows.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.packId !== diff.packId)
    throw new Error(`차이의 팩(${diff.packId})과 팩 폴더(${manifest.packId})가 다릅니다`);
  const file = JSON.parse(readFileSync(tuningPath, "utf8"));
  const result = applyTuningDiff(Array.isArray(file.entries) ? file.entries : [], diff, { force });
  const statChanges = diff.statRows ?? [];
  const formulaChanges = diff.formulas ?? [];
  const formulasPath = path.join(packDir, "formulas.json");
  const rowsFile =
    statChanges.length > 0 || formulaChanges.length > 0
      ? JSON.parse(readFileSync(statRowsPath, "utf8"))
      : null;
  const rows = rowsFile
    ? applyStatRowsDiff(Array.isArray(rowsFile.entries) ? rowsFile.entries : [], statChanges, { force })
    : { entries: [], applied: [], skipped: [] };
  const formulasFile = formulaChanges.length > 0 ? JSON.parse(readFileSync(formulasPath, "utf8")) : null;
  const formulas = formulasFile
    ? applyFormulasDiff(
        Array.isArray(formulasFile.entries) ? formulasFile.entries : [],
        rows.entries,
        formulaChanges,
        // from은 내보낼 때의 팩 식이라 같은 차이의 가중치 칸을 넣기 전 행으로 견준다
        { force, compareRows: Array.isArray(rowsFile?.entries) ? rowsFile.entries : [] },
      )
    : { formulaEntries: [], statRowEntries: rows.entries, applied: [], skipped: [] };
  const rowsChanged =
    rows.applied.length > 0 || formulas.applied.some((change) => change.id.endsWith(".formula"));
  const formulasChanged = formulas.applied.some((change) => !change.id.endsWith(".formula"));
  let version = manifest.version;
  if ((result.applied.length > 0 || rows.applied.length > 0 || formulas.applied.length > 0) && !dryRun) {
    if (result.applied.length > 0) writeFileSync(tuningPath, json({ ...file, entries: result.entries }));
    if (rowsFile && rowsChanged)
      writeFileSync(statRowsPath, json({ ...rowsFile, entries: formulas.statRowEntries }));
    if (formulasFile && formulasChanged)
      writeFileSync(formulasPath, json({ ...formulasFile, entries: formulas.formulaEntries }));
    version = manifest.version + 1;
    writeFileSync(manifestPath, json({ ...manifest, version }));
  }
  return {
    applied: result.applied,
    skipped: result.skipped,
    rows: { applied: rows.applied, skipped: rows.skipped },
    formulas: { applied: formulas.applied, skipped: formulas.skipped },
    version,
  };
}

const SKIP_TEXT = {
  unknown: "팩에 없는 칸",
  stale: "지금 팩 값이 내보낼 때와 다름(--force로 넣기)",
  out_of_range: "기술 범위 밖",
  invalid: "그 칸 변수로 읽히지 않는 식",
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
  for (const change of outcome.rows.applied)
    console.log(`✓ stat_rows ${change.row}.${change.field}: ${change.from} → ${change.to}`);
  for (const change of outcome.formulas.applied) console.log(`✓ 식 ${change.id}: ${change.to}`);
  for (const skip of outcome.formulas.skipped)
    console.error(`- 건너뜀 식 ${skip.id}: ${SKIP_TEXT[skip.reason]}`);
  for (const skip of outcome.skipped) {
    const current = skip.current === undefined ? "" : ` (지금 팩 값 ${skip.current})`;
    console.error(`- 건너뜀 ${skip.id}: ${SKIP_TEXT[skip.reason]}${current}`);
  }
  for (const skip of outcome.rows.skipped) {
    const current = skip.current === undefined ? "" : ` (지금 팩 값 ${skip.current})`;
    console.error(`- 건너뜀 stat_rows ${skip.row}.${skip.field}: ${SKIP_TEXT[skip.reason]}${current}`);
  }
  const count = outcome.applied.length + outcome.rows.applied.length + outcome.formulas.applied.length;
  if (count === 0) console.log("바꾼 칸이 없습니다(파일을 쓰지 않음)");
  else if (args.includes("--dry-run")) console.log(`미리 보기: ${count}칸(파일을 쓰지 않음)`);
  else
    console.log(
      `${count}칸을 바꾸고 팩 판을 ${outcome.version}로 올렸습니다 → pnpm check:content, 작업 기록, 커밋`,
    );
  return outcome.skipped.length + outcome.rows.skipped.length + outcome.formulas.skipped.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv));
