// .ts 워커를 띄우는 시험이 tsWorkerUrl을 쓰는지 본다(testWorkers.ts 머리 주석: 안 쓰면 시험 프로세스가 가끔 죽는다)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tsWorkerUrl } from "./testWorkers.ts";

const SRC = path.dirname(fileURLToPath(import.meta.url));
/** .ts로 끝나는 글자와 import.meta.url로 new URL을 직접 부르는 곳(.ts 진입 파일 주소를 직접 만든다) */
const RAW_TS_URL = /new URL\(\s*["'`][^"'`]*\.ts["'`]\s*,\s*import\.meta\.url\s*\)/g;

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("시험 워커 주소", () => {
  it("서버 시험은 .ts 진입 파일 주소를 new URL로 직접 만들지 않는다(tsWorkerUrl)", () => {
    const offenders = testFiles(SRC).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(RAW_TS_URL)].map(
        (match) => `${path.relative(SRC, file)}: ${match[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("tsWorkerUrl은 new URL(relative, base)와 같은 주소를 준다", () => {
    const relative = "./world/pathWorker.ts";
    expect(tsWorkerUrl(relative, import.meta.url).href).toBe(new URL(relative, import.meta.url).href);
  });
});
