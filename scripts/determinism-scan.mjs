// 결정성 검사 — 판정·생성 코드에서 엔진마다 값이 다를 수 있는 API를 찾는다 (scripts/check-boundaries.mjs에서 쓴다)
// 주석·문자열·템플릿 글자는 공백으로 바꾼 뒤 본다: 설명에 Math.sin이나 **를 적어도 된다. 템플릿의 ${…}는 코드로 본다.
// 문법 분석기 없이 글자를 한 번 훑는 검사다. 정규식 리터럴은 알아보지 않는다(검사 대상 파일에 없다). 생기면 그 안의
// // · 따옴표를 주석·문자열의 시작으로 잘못 볼 수 있다(그러면 그 뒤를 덜 본다. 없는 위반을 만들지는 않는다).

/** [정규식, 이유] — 주석·문자열을 지운 코드 줄에서 찾는다 */
export const FORBIDDEN = [
  [/\bMath\.random\b/, "Math.random (시드 난수 createRng 사용)"],
  [/\bcrypto\.(getRandomValues|randomUUID)\b/, "암호 난수 (시드 난수 createRng 사용)"],
  [/\bDate\.now\b|\bnew\s+Date\b|\bperformance\.now\b/, "현재 시각 (서버가 넘겨준 시각 사용)"],
  [
    /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/,
    "엔진마다 결과가 다를 수 있는 초월함수 (packages/shared의 결정적 함수 사용)",
  ],
  [
    /\bMath\s*\[|=\s*Math\b(?!\s*\.)|\bMath\s*[,;)}\]]/,
    "Math를 통째로 넘기거나 계산된 이름으로 읽기 (검사를 피할 수 있다. Math.이름으로 직접 쓴다)",
  ],
  // 명세가 거듭제곱을 "구현이 근사한 값"으로 둔다(Math.pow와 같다). 주석·문자열을 지웠으니 남은 **는 연산자다
  [/\*\*/, "거듭제곱 연산자 ** (곱셈 또는 정확한 2의 거듭제곱 표 사용)"],
  // 다른 모듈이 전역에 걸어 둔 함수(예: 엔진 Math.sin)를 읽으면 위 검사를 피한다
  [/\bglobalThis\b/, "globalThis (전역에 건 함수·값을 읽지 않는다. 가져올 것은 import로)"],
];

/**
 * 주석과 문자열·템플릿 글자를 공백으로 바꾼다. 줄 바꿈은 그대로 둬서 줄 번호가 같다.
 * 템플릿 리터럴의 ${…} 안은 코드다(중첩 템플릿과 그 안의 중괄호도 센다).
 */
export function blankCommentsAndStrings(source) {
  const out = [...source];
  // 열린 ${…}마다 그 안에서 연 중괄호 수
  const templateDepth = [];
  let state = "code";
  const blank = (index) => {
    if (out[index] !== "\n") out[index] = " ";
  };
  for (let index = 0; index < out.length; index++) {
    const char = out[index];
    const next = out[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        blank(index);
      } else if (char === "/" && next === "*") {
        state = "block";
        blank(index);
        blank(index + 1);
        index++;
      } else if (char === "'" || char === '"') {
        state = char;
      } else if (char === "`") {
        state = "template";
      } else if (char === "{" && templateDepth.length > 0) {
        templateDepth[templateDepth.length - 1]++;
      } else if (char === "}" && templateDepth.length > 0) {
        if (templateDepth[templateDepth.length - 1] === 0) {
          templateDepth.pop();
          state = "template";
        } else {
          templateDepth[templateDepth.length - 1]--;
        }
      }
    } else if (state === "line") {
      if (char === "\n") state = "code";
      else blank(index);
    } else if (state === "block") {
      if (char === "*" && next === "/") {
        blank(index);
        blank(index + 1);
        index++;
        state = "code";
      } else {
        blank(index);
      }
    } else if (state === "template") {
      if (char === "\\") {
        blank(index);
        blank(index + 1);
        index++;
      } else if (char === "`") {
        state = "code";
      } else if (char === "$" && next === "{") {
        templateDepth.push(0);
        index++;
        state = "code";
      } else {
        blank(index);
      }
    } else {
      // 작은따옴표·큰따옴표 문자열(한 줄)
      if (char === "\\") {
        blank(index);
        blank(index + 1);
        index++;
      } else if (char === state || char === "\n") {
        state = "code";
      } else {
        blank(index);
      }
    }
  }
  return out.join("");
}

/** 위반 목록 [{ line(1부터), reason }] */
export function findDeterminismViolations(source) {
  const violations = [];
  blankCommentsAndStrings(source)
    .split("\n")
    .forEach((code, index) => {
      for (const [pattern, reason] of FORBIDDEN) {
        if (pattern.test(code)) violations.push({ line: index + 1, reason });
      }
    });
  return violations;
}

/**
 * 상대 경로로 시험 도우미(이름이 test + 대문자로 시작하는 파일)를 가리키는 import·export … from·import()와
 * 이름 없이 부르기만 하는 import "./testX.ts"(모듈을 실행만 해도 전역에 엔진 함수를 걸 수 있다)
 */
const TEST_HELPER_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.{1,2}\/(?:[^"'\n]*\/)?test[A-Z][^"'\n]*)["']/;

/**
 * 시험 도우미(testFixtures.ts·testVariety.ts 등)를 가져오는 줄 [{ line, reason }].
 * 시험 도우미는 결정성 검사 밖이라(기준값을 Math 함수로 만들어도 된다), 판정·생성 코드가 가져오면 검사를 피한다.
 * 주석 안은 보지 않는다(주석을 지운 줄에 from·import가 남아 있어야 한다).
 */
export function findTestHelperImports(source) {
  const violations = [];
  const code = blankCommentsAndStrings(source).split("\n");
  source.split("\n").forEach((text, index) => {
    if (!/\b(from|import)\b/.test(code[index] ?? "")) return;
    const match = TEST_HELPER_SPECIFIER.exec(text);
    if (match) {
      violations.push({ line: index + 1, reason: `시험 도우미 가져오기 ${match[1]} (시험 파일에서만 쓴다)` });
    }
  });
  return violations;
}
