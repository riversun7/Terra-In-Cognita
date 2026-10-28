// 타입 전용 import 검사 시험 — 게임 앱이 서버(@terra/server)를 타입으로만 가져오는지 (ADR 2026-10-28-trpc-type-sharing)
import { describe, expect, it } from "vitest";
import { findValueImports } from "./type-only-imports.mjs";

const PACKAGES = ["@terra/server"];
const check = (source) => findValueImports(source, PACKAGES);

describe("findValueImports", () => {
  it("import type / export type은 허용한다 (여러 줄, 작은따옴표 포함)", () => {
    const source = [
      'import type { AppRouter } from "@terra/server/trpc";',
      "import type {",
      "  AppRouter as Router,",
      "} from '@terra/server/trpc';",
      'export type { AppRouter } from "@terra/server/trpc";',
      'export type * from "@terra/server/trpc";',
      'import { createTRPCClient } from "@trpc/client";',
    ].join("\n");
    expect(check(source)).toEqual([]);
  });

  it("주석 안의 이름은 무시한다", () => {
    const source = [
      '// import { appRouter } from "@terra/server/trpc";',
      '/* import { appRouter } from "@terra/server/trpc"; */',
      "/**",
      ' * 예: import { appRouter } from "@terra/server/trpc"',
      " */",
    ].join("\n");
    expect(check(source)).toEqual([]);
  });

  it("값 import와 우회 형태는 모두 위반이고 줄 번호를 알려준다", () => {
    const lines = [
      'import { appRouter } from "@terra/server/trpc";',
      'import { type AppRouter } from "@terra/server/trpc";',
      'import "@terra/server/trpc";',
      'import server from "@terra/server";',
      'export { appRouter } from "@terra/server/trpc";',
      'export * from "@terra/server/trpc";',
      'const lazy = await import("@terra/server/trpc");',
      "const dynamic = await import(`@terra/server/trpc`);",
      'type Router = typeof import("@terra/server/trpc");',
      'const cjs = require("@terra/server");',
    ];
    expect(check(lines.join("\n")).map((v) => v.line)).toEqual(lines.map((_, index) => index + 1));
  });

  it("type 문장 뒤에 이어진 값 import는 따로 잡는다", () => {
    const source = [
      'import type { AppRouter } from "@terra/server/trpc";',
      'import { appRouter } from "@terra/server/trpc";',
    ].join("\n");
    expect(check(source)).toEqual([{ line: 2, text: 'import { appRouter } from "@terra/server/trpc";' }]);
  });

  it("이름이 비슷한 다른 패키지는 건드리지 않는다", () => {
    expect(check('import { x } from "@terra/serverless";\nimport { y } from "@terra/shared";')).toEqual([]);
  });
});
