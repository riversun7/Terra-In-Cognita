// 타입만 가져와야 하는 패키지의 값 import 찾기 (scripts/check-boundaries.mjs에서 쓴다)
// 허용: `import type … from "<패키지>"`, `export type … from "<패키지>"` — 빌드할 때 지워져 번들에 남지 않는다.
// 금지: 그 밖에 패키지 이름이 나오는 모든 곳 — 값 import, `import { type X }`(빈 import가 남는다),
//       부수효과 import, 동적 import(), require(), `typeof import()`(타입 위치라도 `import type`으로 통일).
// 문법 분석기 없이 글자로 찾는 간단한 검사다. 주석 안의 이름은 무시하고, 문자열 안의 이름은 위반으로 친다(엄격한 쪽).

/** 주석을 같은 줄 수의 빈 줄로 바꾼다 (줄 번호 유지). 줄 끝 주석은 줄 맨 앞에서 시작하는 것만 지운다 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * 타입 전용이 아닌 사용 위치를 돌려준다.
 * @param {string} source 소스 코드
 * @param {string[]} packages 타입만 허용하는 패키지 이름 (하위 경로 포함: "@terra/server/trpc")
 * @returns {{ line: number, text: string }[]}
 */
export function findValueImports(source, packages) {
  const code = stripComments(source);
  const name = packages.map(escapeRegExp).join("|");
  // 패키지 이름(또는 그 하위 경로)을 담은 문자열 리터럴
  const specifier = `(["'\`])(?:${name})(?:/[^"'\`]*)?\\1`;
  // 허용 문장: import type / export type … from "<패키지>" (여러 줄 가능, 문장 끝 ;를 넘지 않는다)
  const allowed = new RegExp(`\\b(?:import|export)\\s+type\\b[^;]*?\\bfrom\\s*${specifier}`, "g");
  const covered = [];
  for (const match of code.matchAll(allowed)) covered.push([match.index, match.index + match[0].length]);

  const violations = [];
  for (const match of code.matchAll(new RegExp(specifier, "g"))) {
    const at = match.index;
    if (covered.some(([start, end]) => at >= start && at < end)) continue;
    const line = code.slice(0, at).split("\n").length;
    violations.push({ line, text: source.split("\n")[line - 1]?.trim() ?? "" });
  }
  return violations;
}
