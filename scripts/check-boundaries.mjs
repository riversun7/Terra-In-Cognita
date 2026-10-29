// 모듈 경계 검사 (AGENTS.md 4장)
// 1) 내부 패키지 의존 관계를 package.json 기준으로 확인한다.
//    pnpm은 선언하지 않은 패키지를 import할 수 없으므로 package.json이 실제 의존 그래프다.
// 2) 타입만 허용한 의존(게임 앱 → 서버)은 devDependencies에만 두고, 소스에서는 `import type`만 쓴다.
// 3) 판정 코드(packages/sim)와 행성 코드(packages/planet: 격자·투영·생성기)에서 결정성을 깨는 API 사용을 막는다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

// 판정 코드의 결정성 규칙
const FORBIDDEN = [
  [/\bMath\.random\b/, "Math.random (시드 난수 createRng 사용)"],
  [/\bDate\.now\b|\bnew Date\(/, "현재 시각 (서버가 넘겨준 시각 사용)"],
  [
    /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/,
    "엔진마다 결과가 다를 수 있는 초월함수 (packages/shared의 결정적 함수 사용)",
  ],
];
// 거듭제곱 연산자(**)도 명세가 "구현이 근사한 값"으로 둔다(Math.pow와 같음). 주석의 **는 보지 않는다
const EXPONENT_OPERATOR = /[\w)\]]\s*\*\*\s*[\w(.-]/;
// 검사 대상: 판정 코드(packages/sim)와 행성 코드(packages/planet). 투영도 결정적 근사(@terra/shared detTan·detAtan)를
// 쓰므로 예외가 없다(ADR 2026-10-29-s2-planet-lod). 시험 파일(*.test.ts)과 시험 도우미(test로 시작하는 파일:
// testOracle.ts·testSupport.ts)는 뺀다 — 기준값을 Math 함수로 만들어도 된다
const DETERMINISTIC_SOURCE = /^packages\/(sim|planet)\/src\/.*\.ts$/;
const TEST_ONLY = /(\.test\.ts|\/test[A-Z][^/]*\.ts)$/;
for (const file of files.filter((f) => DETERMINISTIC_SOURCE.test(f) && !TEST_ONLY.test(f))) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const [pattern, reason] of FORBIDDEN) {
      if (pattern.test(line)) errors.push(`${path.normalize(file)}:${index + 1}: ${reason}`);
    }
    const code = line.replace(/\/\/.*$/, "").trimStart();
    if (!code.startsWith("*") && !code.startsWith("/*") && EXPONENT_OPERATOR.test(code)) {
      errors.push(
        `${path.normalize(file)}:${index + 1}: 거듭제곱 연산자 ** (곱셈 또는 정확한 2의 거듭제곱 표 사용)`,
      );
    }
  });
}

if (errors.length > 0) fail(errors);
console.log("✓ 모듈 경계·결정성 규칙 통과");
