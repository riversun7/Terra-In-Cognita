// UTF-8 바이트 세기 시험 — 글자 길이마다의 경계, 짝 없는 대리 문자(U+FFFD로 셈)
import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "./utf8.ts";

describe("utf8ByteLength", () => {
  it("1·2·3·4바이트 문자", () => {
    expect(utf8ByteLength("")).toBe(0);
    expect(utf8ByteLength("a")).toBe(1);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("가")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
    expect(utf8ByteLength("a가😀")).toBe(8);
  });

  it("바이트 수가 바뀌는 경계 코드 포인트", () => {
    expect(utf8ByteLength("\u007f")).toBe(1);
    expect(utf8ByteLength("\u0080")).toBe(2);
    expect(utf8ByteLength("\u07ff")).toBe(2);
    expect(utf8ByteLength("\u0800")).toBe(3);
    expect(utf8ByteLength("\uffff")).toBe(3);
    expect(utf8ByteLength("\u{10000}")).toBe(4);
    expect(utf8ByteLength("\u{10ffff}")).toBe(4);
  });

  it("짝 없는 대리 문자는 하나에 3바이트", () => {
    expect(utf8ByteLength("\ud800")).toBe(3);
    expect(utf8ByteLength("a\ud800")).toBe(4);
    expect(utf8ByteLength("\udc00a")).toBe(4);
    // 순서가 뒤집힌 둘은 짝이 아니다
    expect(utf8ByteLength("\udc00\ud800")).toBe(6);
  });
});
