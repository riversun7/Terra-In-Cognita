// 문서 갱신 검사 (docs/adr/2026-10-28-dev-workflow.md)
// - 코드를 바꿨으면 작업 기록(docs/worklog/)도 함께 추가·수정해야 한다. 의존성 버전만 올린 변경은 제외.
// - 새 런타임 의존성(dependencies)을 추가했으면 ADR(docs/adr/)도 함께 추가해야 한다.
// 사용: node scripts/check-docs.mjs [기준 커밋]  (기본: upstream, 없으면 HEAD~1)
import { fail, git } from "./lib.mjs";

function exists(ref) {
  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function resolveBase() {
  const arg = process.argv[2];
  // 강제 푸시 등으로 기준 커밋이 사라졌으면 다음 후보로 넘어간다
  if (arg && !/^0+$/.test(arg) && exists(arg)) return arg;
  try {
    return git(["rev-parse", "--verify", "@{u}"]);
  } catch {
    try {
      return git(["rev-parse", "--verify", "HEAD~1"]);
    } catch {
      return null; // 첫 커밋
    }
  }
}

const base = resolveBase();
if (!base) {
  console.log("✓ 기준 커밋이 없어 문서 검사를 건너뜁니다 (첫 커밋)");
  process.exit(0);
}
const changed = git(["diff", "--name-only", `${base}...HEAD`])
  .split("\n")
  .filter(Boolean);
const CODE = /^(apps|packages|scripts|ops)\/|^\.github\/workflows\//;
const errors = [];

const readJson = (ref, file) => {
  try {
    return JSON.parse(git(["show", `${ref}:${file}`]));
  } catch {
    return null; // 그 시점에 파일이 없음
  }
};
// 키 순서와 무관하게 비교하려고 객체 키를 정렬한다
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .toSorted()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

// 버전 올림만 있는 파일(Dependabot PR 등)은 코드 변경으로 치지 않는다 (docs/adr/2026-10-28-dependency-updates.md)
// - package.json: 의존성 버전 문자열만 바뀜 (이름이 늘거나 줄거나, 다른 필드가 바뀌면 코드 변경)
// - 워크플로: 바뀐 줄이 모두 `uses:` 줄 (액션 버전)
function isVersionBumpOnly(file) {
  if (/(^|\/)package\.json$/.test(file)) {
    const before = readJson(base, file);
    const after = readJson("HEAD", file);
    if (!before || !after) return false;
    const shape = (pkg) =>
      JSON.stringify(
        canonical({
          ...pkg,
          ...Object.fromEntries(DEP_FIELDS.map((field) => [field, Object.keys(pkg[field] ?? {}).toSorted()])),
        }),
      );
    return shape(before) === shape(after);
  }
  if (file.startsWith(".github/workflows/")) {
    const lines = git(["diff", "-U0", `${base}...HEAD`, "--", file])
      .split("\n")
      .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line));
    return lines.length > 0 && lines.every((line) => /^[+-]\s*(-\s+)?uses:\s/.test(line));
  }
  return false;
}

const codeFiles = changed.filter((f) => CODE.test(f));
const bumpOnly = codeFiles.filter(isVersionBumpOnly);
if (bumpOnly.length > 0) {
  console.log(`· 버전 올림만 있어 작업 기록 검사에서 뺀 파일: ${bumpOnly.join(", ")}`);
}
if (
  codeFiles.length > bumpOnly.length &&
  !changed.some((f) => f.startsWith("docs/worklog/") && !f.endsWith("TEMPLATE.md"))
) {
  errors.push(
    "코드를 바꿨지만 작업 기록이 없습니다. docs/worklog/YYYY/MM/DD-HHMM-<slug>.md를 추가하세요 (양식: docs/worklog/TEMPLATE.md).",
  );
}

const readDeps = (ref, file) => Object.keys(readJson(ref, file)?.dependencies ?? {});
const addedRuntimeDeps = changed
  .filter((f) => f === "package.json" || /^(apps|packages)\/[^/]+\/package\.json$/.test(f))
  .flatMap((file) => {
    const before = new Set(readDeps(base, file));
    return readDeps("HEAD", file)
      .filter((dep) => !before.has(dep) && !dep.startsWith("@terra/"))
      .map((dep) => `${file}: ${dep}`);
  });
if (addedRuntimeDeps.length > 0 && !changed.some((f) => /^docs\/adr\/\d{4}-\d{2}-\d{2}-.+\.md$/.test(f))) {
  errors.push(`새 런타임 의존성에는 ADR이 필요합니다: ${addedRuntimeDeps.join(", ")}`);
}

if (errors.length > 0) fail(errors);
console.log(`✓ 문서 갱신 규칙 통과 (기준 ${base.slice(0, 7)})`);
