// 다국어 검사 시험 — 겹친 키 찾기(원문 훑기)와 언어 파일 비교. 실제 메시지 파일에도 돌려 본다.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCALES, checkMessages, findDuplicateKeys } from "./check-i18n.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = fileURLToPath(new URL("./check-i18n.mjs", import.meta.url));

describe("findDuplicateKeys", () => {
  it("겹친 키가 없으면 빈 목록", () => {
    expect(findDuplicateKeys('{\n  "a": "1",\n  "b": "2"\n}\n')).toEqual([]);
  });

  it("맨 위 객체의 겹친 키를 줄 번호와 함께 찾는다", () => {
    const text = '{\n  "$schema": "x",\n  "a": "처음",\n  "b": "2",\n  "a": "나중"\n}\n';
    expect(JSON.parse(text).a).toBe("나중"); // JSON.parse는 말없이 뒤 값을 남긴다
    expect(findDuplicateKeys(text)).toEqual([{ key: "a", path: "a", line: 5, firstLine: 3 }]);
  });

  it("세 번 나오면 두 번째·세 번째를 모두 알린다", () => {
    const found = findDuplicateKeys('{"k": 1,\n"k": 2,\n"k": 3}');
    expect(found.map((d) => [d.line, d.firstLine])).toEqual([
      [2, 1],
      [3, 1],
    ]);
  });

  it("키는 풀어서 비교한다(이스케이프가 달라도 같은 키)", () => {
    expect(findDuplicateKeys('{"a": 1, "\\u0061": 2}').map((d) => d.key)).toEqual(["a"]);
  });

  it("값 안의 따옴표·괄호·쉼표·콜론은 키로 보지 않는다", () => {
    const text = '{"a": "\\"a\\": {x, y}", "b": "끝 \\\\", "c": "[1, 2]: {"}';
    expect(findDuplicateKeys(text)).toEqual([]);
  });

  it("키와 같은 글자의 값은 겹침이 아니다", () => {
    expect(findDuplicateKeys('{"a": "b", "b": "a"}')).toEqual([]);
  });

  it("다른 객체에 있는 같은 키는 겹침이 아니고, 안쪽 객체의 겹침은 경로로 알린다", () => {
    const text = '{"x": {"id": 1}, "y": {"id": 2, "id": 3}, "z": [{"id": 1, "id": 2}]}';
    expect(findDuplicateKeys(text).map((d) => d.path)).toEqual(["y.id", "z.[0].id"]);
  });
});

const file = (locale, body) => ({ locale, text: JSON.stringify(body, null, 2) });

describe("checkMessages", () => {
  it("키·변수가 같으면 통과", () => {
    const result = checkMessages([file("ko", { hi: "안녕 {name}" }), file("en", { hi: "Hi {name}" })]);
    expect(result).toEqual({ errors: [], keyCount: 1 });
  });

  it("겹친 키는 언어·줄과 함께 실패한다(뒤 값이 같은 키를 덮어써 다른 검사로는 안 보인다)", () => {
    const ko = { locale: "ko", text: '{\n  "hi": "안녕",\n  "bye": "잘 가",\n  "hi": "잘 가"\n}\n' };
    const { errors } = checkMessages([ko, file("en", { hi: "Hi", bye: "Bye" })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ko\.json:4: "hi" 키가 2번째 줄에도 있습니다/);
  });

  it("빠진 번역·변수 다름·없는 키·빈 값·JSON 아님", () => {
    const { errors } = checkMessages([
      file("ko", { a: "{n}개", b: "비", c: " " }),
      file("en", { a: "{count} items", d: "extra", c: "C" }),
    ]);
    expect(errors).toEqual([
      'en.json: "a"의 변수({...})가 ko.json과 다릅니다.',
      'en.json: "b" 번역이 없습니다.',
      'en.json: "d"는 ko.json에 없는 키입니다.',
      'ko.json: "c" 값이 비어 있습니다.',
    ]);
    expect(checkMessages([{ locale: "ko", text: "{" }]).errors[0]).toMatch(/^ko\.json: JSON이 아닙니다/);
  });
});

describe("저장소 메시지 파일", () => {
  it("겹친 키가 없다", () => {
    for (const locale of LOCALES) {
      const text = readFileSync(`${ROOT}apps/game/messages/${locale}.json`, "utf8");
      expect(findDuplicateKeys(text), locale).toEqual([]);
    }
  });

  it("명령줄이 통과한다", () => {
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("겹친 키 없음");
  });
});
