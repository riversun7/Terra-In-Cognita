// 첫 화면 모듈의 가져오기 규칙 시험 — 처리할 일·복귀 요약 가운데 첫 화면 묶음에 들어가는 모듈 4개가 무거운 모듈을 정적으로
// 가져오지 않는다(ADR 2026-10-29-app-shell 7·11절, W3 통과 기준 7). 소스 글을 읽어 본다. 빌드 소스 맵 확인과 첫 화면 크기 검사(W5)를
// 대신하지 않고, 그 전에 규칙이 깨진 줄을 바로 알려 준다.
// - tRPC 클라이언트(@trpc/client, net/api.ts)와 홈 자료 조회(net/homeQueries.ts)는 동적 import()로만 부른다.
// - 종류 표가 든 @terra/shared/inbox·@terra/shared/dashboard는 `import type`으로만 가져온다.
//   `import { type X }`는 안 된다: verbatimModuleSyntax에서 빈 import로 남아 그 모듈을 내려받는다.
// - 처리함·복귀 요약의 지연 조각(화면·목록·문구·아이콘·대화상자)과 그 CSS는 정적으로 가져오지 않는다.
// 소스 글은 import.meta.glob(?raw)으로 읽는다(`import x from "./a.ts?raw"`는 린트가 a.ts의 default export를 찾는다).
import { describe, expect, it } from "vitest";

/** 첫 화면 모듈 → 소스 글 */
const FIRST_SCREEN = import.meta.glob<string>(
  ["./store.ts", "./preview.ts", "../summary/summaryGate.ts", "../summary/ReturnSummary.tsx"],
  { query: "?raw", import: "default", eager: true },
);

/** 그 모듈의 소스 글(없으면 시험 실패) */
function sourceOf(path: string): string {
  const source = FIRST_SCREEN[path];
  if (source === undefined) throw new Error(`missing source: ${path}`);
  return source;
}

interface StaticImport {
  readonly specifier: string;
  /** `import type …` / `export type …` 문(실행할 때 없어진다) */
  readonly typeOnly: boolean;
}

/** 줄 맨 앞의 정적 import·export … from 문. 동적 import("…")는 넣지 않는다 */
function staticImports(source: string): StaticImport[] {
  const found: StaticImport[] = [];
  const pattern = /^(?:import|export)\s+(type\s+)?[^;"]*?\bfrom\s+"([^"]+)"|^import\s+"([^"]+)"/gm;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[2] ?? match[3];
    if (specifier !== undefined) found.push({ specifier, typeOnly: match[1] !== undefined });
  }
  return found;
}

/** 첫 화면 모듈이 값으로(정적으로) 가져오면 안 되는 것 */
const LAZY_ONLY = [
  /^@trpc\//,
  /(^|\/)net\/(api|homeQueries)\.ts$/,
  /^@terra\/shared\/(inbox|dashboard)$/,
  /(^|\/)(InboxScreen|InboxList|inboxText|quickActions|icons|SummaryDialog|summaryText)\.tsx?$/,
  /\.css$/,
];

/** 규칙을 어긴 가져오기(문 그대로의 이름) */
function violations(source: string): string[] {
  return staticImports(source)
    .filter((entry) => !entry.typeOnly && LAZY_ONLY.some((rule) => rule.test(entry.specifier)))
    .map((entry) => entry.specifier);
}

describe("첫 화면 모듈의 가져오기", () => {
  it("네 모듈을 모두 읽었다", () => {
    expect(Object.keys(FIRST_SCREEN).toSorted()).toEqual([
      "../summary/ReturnSummary.tsx",
      "../summary/summaryGate.ts",
      "./preview.ts",
      "./store.ts",
    ]);
  });

  it.each(Object.keys(FIRST_SCREEN))("%s는 지연 조각·tRPC·종류 표를 값으로 가져오지 않는다", (path) => {
    const source = sourceOf(path);
    expect(staticImports(source).length).toBeGreaterThan(1);
    expect(violations(source)).toEqual([]);
  });

  it("요청은 홈 자료 조회 모듈 하나를 동적으로 부른다(같은 틱의 조회가 한 요청으로 묶이게)", () => {
    expect(sourceOf("./store.ts")).toContain('import("../net/homeQueries.ts")');
    expect(sourceOf("../summary/summaryGate.ts")).toContain('import("../net/homeQueries.ts")');
    expect(sourceOf("../summary/ReturnSummary.tsx")).toContain('import("./SummaryDialog.tsx")');
  });

  it("검사 자체: 값 가져오기와 `import { type X }`는 잡고, `import type`·동적 import는 넘긴다", () => {
    const sample = [
      'import type { InboxItem } from "@terra/shared/inbox";',
      'import { type InboxCategory } from "@terra/shared/inbox";',
      "import {",
      "  api,",
      '} from "../net/api.ts";',
      'import "./inbox.css";',
      'export { loadInbox } from "../net/homeQueries.ts";',
      'const lazyClient = () => import("../net/homeQueries.ts");',
      'import { useSyncExternalStore } from "react";',
    ].join("\n");
    expect(violations(sample)).toEqual([
      "@terra/shared/inbox",
      "../net/api.ts",
      "./inbox.css",
      "../net/homeQueries.ts",
    ]);
  });
});
