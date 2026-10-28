// 콘텐츠 팩 검증 (PLAN 7장 content-check, docs/adr/2026-10-28-content-pack-format.md)
// - 1단계 스키마, 2단계 참조 무결성, 4a단계 ID 변경표: 작업 트리의 content/<팩>/을 본다(git 없이).
// - 4b단계 이전 버전 호환: 기준 커밋의 팩과 지금 팩을 비교한다. --no-compat이면 건너뛴다(pnpm check).
// 사용: node scripts/check-content.mjs [기준 커밋] [--no-compat] [--print]
//   기준 커밋: check-docs.mjs와 같다(인자 → upstream → HEAD~1 → 없으면 4b를 건너뜀)
//   --print: 서버가 싣는 팩(core)의 content_version·content_hash를 key=value로 표준 출력에 찍는다
//            (CI: >> "$GITHUB_OUTPUT"). 그 밖의 안내는 모두 표준 오류로 보낸다.
import { readdirSync } from "node:fs";
import path from "node:path";
import { STAGE_LABELS, comparePacks, formatIssue, hasErrors } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { git, resolveBase } from "./lib.mjs";

const ROOT = "content";
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 서버 이미지가 싣는 팩 (Dockerfile의 CONTENT_DIR)
const SERVER_PACK = "core";
const OPTIONS = ["--no-compat", "--print"];

const args = process.argv.slice(2);
const unknownOptions = args.filter((arg) => arg.startsWith("--") && !OPTIONS.includes(arg));
if (unknownOptions.length > 0) {
  console.error(`✗ 모르는 옵션: ${unknownOptions.join(", ")} (쓸 수 있는 것: ${OPTIONS.join(", ")})`);
  process.exit(2);
}
const baseArg = args.find((arg) => !arg.startsWith("--"));
const print = args.includes("--print");
const compat = !args.includes("--no-compat");
// --print일 때 표준 출력에는 key=value만 둔다
const info = print ? (line) => console.error(line) : (line) => console.log(line);

// GitHub Actions에서는 파일 옆에 오류를 표시한다(워크플로 명령). 값의 %·줄 바꿈, 속성의 :·,는 바꿔 써야 한다
const inActions = process.env.GITHUB_ACTIONS === "true";
const escapeData = (text) => text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const escapeProperty = (text) => escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 표시할 줄 번호: 문법 오류는 그 줄, 항목 문제는 그 ID가 처음 나오는 줄 */
function lineOf(issue, text) {
  if (issue.line !== undefined) return issue.line;
  if (issue.id === undefined || text === undefined) return undefined;
  const at = text.search(new RegExp(`"id"\\s*:\\s*"${escapeRegExp(issue.id)}"`));
  return at < 0 ? undefined : text.slice(0, at).split("\n").length;
}

let errorCount = 0;
function report(issue, packDir, files) {
  if (issue.level === "error") errorCount += 1;
  console.error(formatIssue(issue, `${packDir}/`));
  if (!inActions) return;
  const props = [];
  if (issue.file !== undefined) {
    props.push(`file=${escapeProperty(`${packDir}/${issue.file}`)}`);
    const line = lineOf(issue, files?.get(issue.file));
    if (line !== undefined) props.push(`line=${line}`);
  }
  props.push(`title=${escapeProperty(`콘텐츠 검증 [${STAGE_LABELS[issue.stage]}]`)}`);
  const where = [issue.id, issue.path].filter((part) => part !== undefined && part !== "").join(" › ");
  const command = issue.level === "error" ? "error" : "warning";
  console.error(
    `::${command} ${props.join(",")}::${escapeData(`${where ? `${where}: ` : ""}${issue.message}`)}`,
  );
}

/** 기준 커밋의 팩 파일(이름 → 내용). 팩 폴더가 없으면 undefined */
function readBasePack(sha, packId) {
  const dir = `${ROOT}/${packId}/`;
  const entries = git(["ls-tree", "-z", sha, "--", dir]).split("\0").filter(Boolean);
  if (entries.length === 0) return undefined;
  const files = new Map();
  for (const entry of entries) {
    // 형식: <모드> <종류> <객체>\t<경로>
    const [meta = "", file = ""] = entry.split("\t");
    const name = path.posix.basename(file);
    if (meta.split(" ")[1] === "blob") files.set(name, git(["show", `${sha}:${file}`]));
    else files.set(`${name}/`, "");
  }
  return files;
}

function basePackIds(sha) {
  return git(["ls-tree", "-z", "-d", "--name-only", sha, "--", `${ROOT}/`])
    .split("\0")
    .filter(Boolean)
    .map((dir) => path.posix.basename(dir));
}

// 1·2·4a단계
let roots;
try {
  roots = readdirSync(ROOT, { withFileTypes: true });
} catch {
  console.error(`✗ ${ROOT}/ 폴더가 없습니다. 콘텐츠 팩은 ${ROOT}/<팩 ID>/에 둡니다.`);
  process.exit(1);
}
for (const stray of roots.filter((entry) => !entry.isDirectory())) {
  errorCount += 1;
  console.error(
    `✗ [스키마] ${ROOT}/${stray.name}: 팩 폴더 밖의 파일입니다. 팩 파일은 ${ROOT}/<팩 ID>/ 안에 둡니다.`,
  );
}
const results = new Map();
for (const packId of roots
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted()) {
  const dir = `${ROOT}/${packId}`;
  const loaded = loadContentPack(dir);
  for (const issue of loaded.issues) report(issue, dir, loaded.source?.files);
  results.set(packId, loaded);
}
if (results.size === 0) {
  errorCount += 1;
  console.error(`✗ ${ROOT}/에 팩 폴더가 없습니다.`);
}

// 4b단계
let compatLabel;
if (compat) {
  const base = resolveBase(baseArg);
  if (!base) {
    info("· 기준 커밋이 없어 호환 검사(4b)를 건너뜁니다 (첫 커밋)");
  } else {
    const sha = git(["rev-parse", `${base}^{commit}`]);
    compatLabel = sha.slice(0, 7);
    const packIds = [...new Set([...results.keys(), ...basePackIds(sha)])].toSorted(byCodeUnit);
    for (const packId of packIds) {
      const dir = `${ROOT}/${packId}`;
      const head = results.get(packId);
      const baseFiles = readBasePack(sha, packId);
      if (!head) {
        errorCount += 1;
        console.error(
          `✗ [호환] ${dir}: 기준 커밋(${compatLabel})에 있던 팩 폴더가 없습니다. 팩은 지우지 않습니다(ID는 id-changes.json에 기록).`,
        );
        continue;
      }
      // 앞 단계 오류가 있으면 비교 결과를 믿을 수 없다
      if (!head.source || hasErrors(head.issues)) continue;
      if (!baseFiles) {
        info(`· ${dir}: 기준 커밋(${compatLabel})에 없는 새 팩이라 호환 검사(4b)를 건너뜁니다`);
        continue;
      }
      const issues = await comparePacks(packId, baseFiles, head.source.files, { baseLabel: compatLabel });
      for (const issue of issues) report(issue, dir, head.source.files);
    }
  }
}

if (errorCount > 0) {
  console.error(`✗ 콘텐츠 검증 실패 — 오류 ${errorCount}건`);
  process.exit(1);
}
const summary = [...results.values()]
  .map((loaded) => `${loaded.version} (${loaded.hash.slice(0, 12)})`)
  .join(", ");
const stages = compatLabel ? `1·2·4a·4b(기준 ${compatLabel})` : "1·2·4a";
info(`✓ 콘텐츠 검증 통과 — ${summary}, 단계 ${stages}`);

if (print) {
  const server = results.get(SERVER_PACK);
  if (!server?.version) {
    console.error(`✗ 서버가 싣는 팩 ${ROOT}/${SERVER_PACK}이 없습니다.`);
    process.exit(1);
  }
  console.log(`content_version=${server.version}`);
  console.log(`content_hash=${server.hash}`);
}
