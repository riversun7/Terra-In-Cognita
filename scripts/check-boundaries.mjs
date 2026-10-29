// 모듈 경계 검사 (AGENTS.md 4장)
// 1) 내부 패키지 의존 관계를 package.json 기준으로 확인한다.
//    pnpm은 선언하지 않은 패키지를 import할 수 없으므로 package.json이 실제 의존 그래프다.
// 2) 타입만 허용한 의존(게임 앱 → 서버)은 devDependencies에만 두고, 소스에서는 `import type`만 쓴다.
// 3) 판정 코드(packages/sim)·행성 코드(packages/planet)·@terra/shared 결정적 모듈에서 결정성을 깨는 API 사용을 막는다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { findDeterminismViolations, findTestHelperImports } from "./determinism-scan.mjs";
import { fail, listFiles } from "./lib.mjs";
import { findValueImports } from "./type-only-imports.mjs";

// 패키지별로 의존해도 되는 내부 패키지
const ALLOWED = {
  "@terra/shared": [],
  "@terra/protocol": [],
  "@terra/content": ["@terra/shared"],
  "@terra/planet": ["@terra/shared"],
  "@terra/sim": ["@terra/shared", "@terra/protocol", "@terra/content"],
  "@terra/engine": ["@terra/shared", "@terra/protocol", "@terra/planet"],
  // 게임 앱은 판정 코드(@terra/sim)를 가질 수 없다
  "@terra/game": ["@terra/shared", "@terra/protocol", "@terra/content", "@terra/planet", "@terra/engine"],
  "@terra/server": ["@terra/shared", "@terra/protocol", "@terra/content", "@terra/planet", "@terra/sim"],
};

// 타입만 가져올 수 있는 내부 의존 — 빌드하면 지워지므로 상대 코드가 번들에 들어가지 않는다
// 게임 앱은 tRPC 라우터 타입(AppRouter) 때문에 서버를 참조한다 (사용자 결정 2026-10-28, ADR 2026-10-28-trpc-type-sharing)
const TYPE_ONLY = {
  "@terra/game": ["@terra/server"],
};
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const errors = [];
const files = listFiles();

for (const file of files.filter((f) => /^(apps|packages)\/[^/]+\/package\.json$/.test(f))) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const allowed = ALLOWED[pkg.name];
  if (!allowed) {
    errors.push(
      `${file}: ${pkg.name}이(가) 경계 규칙 표에 없습니다. scripts/check-boundaries.mjs의 ALLOWED에 추가하세요.`,
    );
    continue;
  }
  const typeOnly = TYPE_ONLY[pkg.name] ?? [];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  for (const dep of Object.keys(deps).filter((d) => d.startsWith("@terra/"))) {
    if (typeOnly.includes(dep)) {
      // 실행 의존(dependencies·peerDependencies)으로 두면 배포물에 함께 묶일 수 있다
      if (pkg.dependencies?.[dep] || pkg.peerDependencies?.[dep]) {
        errors.push(`${file}: ${pkg.name} → ${dep}는 타입 전용이라 devDependencies에만 둡니다.`);
      }
    } else if (!allowed.includes(dep)) {
      errors.push(`${file}: ${pkg.name} → ${dep} 의존은 허용되지 않습니다 (AGENTS.md 4장).`);
    }
  }
  if (typeOnly.length === 0) continue;
  const dir = `${path.posix.dirname(file)}/`;
  for (const source of files.filter((f) => f.startsWith(dir) && SOURCE_FILE.test(f))) {
    if (!existsSync(source)) continue;
    for (const { line, text } of findValueImports(readFileSync(source, "utf8"), typeOnly)) {
      errors.push(
        `${source}:${line}: ${typeOnly.join(", ")}는 타입만 가져올 수 있습니다. \`import type { … } from "…"\`을 쓰세요 → ${text}`,
      );
    }
  }
}

// 판정·생성 코드의 결정성 규칙 (찾는 것과 방법은 determinism-scan.mjs: 주석·문자열 안은 보지 않는다)
// 검사 대상: 판정 코드(packages/sim), 행성 코드(packages/planet: 격자·투영·생성기), 그리고 그 둘이 쓰는 @terra/shared의
// 결정적 모듈(결정적 수학 detMath·시드 난수 rng·행성 정의 어휘와 프리셋 수치). 투영도 결정적 근사를 쓰므로 예외가 없다
// (ADR 2026-10-29-s2-planet-lod). 시험 파일(*.test.ts)과 시험 도우미(test로 시작하는 파일: testOracle.ts·testFixtures.ts)는
// 뺀다 — 기준값을 Math 함수로 만들어도 된다. 대신 시험이 아닌 파일은 시험 도우미를 가져오지 않는다(검사를 피하지 않게)
const DETERMINISTIC_SOURCE =
  /^packages\/(sim|planet)\/src\/.*\.ts$|^packages\/shared\/src\/(detMath|rng|planetDefinition|planetPresets)\.ts$/;
const TEST_ONLY = /(\.test\.ts|\/test[A-Z][^/]*\.ts)$/;
for (const file of files.filter((f) => DETERMINISTIC_SOURCE.test(f) && !TEST_ONLY.test(f))) {
  if (!existsSync(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const { line, reason } of [...findDeterminismViolations(source), ...findTestHelperImports(source)]) {
    errors.push(`${path.normalize(file)}:${line}: ${reason}`);
  }
}

if (errors.length > 0) fail(errors);
console.log("✓ 모듈 경계·결정성 규칙 통과");
