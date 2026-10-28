// 문서 갱신 검사 (docs/adr/2026-10-28-dev-workflow.md)
// - 코드를 바꿨으면 작업 기록(docs/worklog/)도 함께 추가·수정해야 한다.
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

if (
  changed.some((f) => CODE.test(f)) &&
  !changed.some((f) => f.startsWith("docs/worklog/") && !f.endsWith("TEMPLATE.md"))
) {
  errors.push(
    "코드를 바꿨지만 작업 기록이 없습니다. docs/worklog/YYYY/MM/DD-HHMM-<slug>.md를 추가하세요 (양식: docs/worklog/TEMPLATE.md).",
  );
}

const readDeps = (ref, file) => {
  try {
    return Object.keys(JSON.parse(git(["show", `${ref}:${file}`])).dependencies ?? {});
  } catch {
    return [];
  }
};
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
