// 미리보기 결과 기억 시험 — 바이트 상한 LRU, 고정, 큰 결과 버리기
import { describe, expect, it } from "vitest";
import { DEFAULT_CACHE_BYTES, createPreviewCache } from "./previewCache.ts";

describe("미리보기 결과 기억", () => {
  it("처음 상한은 32MiB", () => {
    expect(DEFAULT_CACHE_BYTES).toBe(32 * 1024 * 1024);
    expect(createPreviewCache().capacity).toBe(DEFAULT_CACHE_BYTES);
  });

  it("상한을 넘으면 오래 안 쓴 것부터 필요한 만큼만 버린다", () => {
    const cache = createPreviewCache<string>(100);
    expect(cache.set("a", "A", 40, 7)).toEqual([]);
    expect(cache.set("b", "B", 40, 7)).toEqual([]);
    cache.get("a"); // a를 최근으로
    expect(cache.set("c", "C", 40, 7)).toEqual(["b"]);
    expect(cache.keys()).toEqual(["a", "c"]);
    expect(cache.bytes()).toBe(80);
  });

  it("방금 넣은 것과 고정한 것은 버리지 않는다(넘으면 넘은 채로)", () => {
    const cache = createPreviewCache<string>(100);
    cache.set("base", "B", 70, 5);
    cache.pin(["base"]);
    expect(cache.set("big", "X", 90, 9)).toEqual([]);
    expect(cache.bytes()).toBe(160);
    expect(cache.set("next", "N", 10, 7)).toEqual(["big"]);
    expect(cache.keys()).toEqual(["base", "next"]);
  });

  it("peek은 순서를 바꾸지 않는다", () => {
    const cache = createPreviewCache<string>(100);
    cache.set("a", "A", 50, 7);
    cache.set("b", "B", 40, 7);
    expect(cache.peek("a")).toBe("A");
    expect(cache.set("c", "C", 20, 7)).toEqual(["a"]);
  });

  it("고정을 바꾸면 풀린 것은 다시 버릴 수 있다", () => {
    const cache = createPreviewCache<string>(100);
    cache.set("a", "A", 60, 5);
    cache.pin(["a"]);
    cache.set("b", "B", 60, 7);
    expect(cache.keys()).toEqual(["a", "b"]);
    expect(cache.pin(["b"])).toEqual(["a"]);
    expect(cache.keys()).toEqual(["b"]);
  });

  it("같은 열쇠를 다시 넣으면 크기를 바꾼다", () => {
    const cache = createPreviewCache<string>(100);
    cache.set("a", "A", 60, 7);
    cache.set("a", "A2", 30, 7);
    expect(cache.bytes()).toBe(30);
    expect(cache.get("a")).toBe("A2");
  });

  it("큰 레벨 결과는 keep·고정 말고 버린다", () => {
    const cache = createPreviewCache<string>(1000);
    cache.set("f9-old", "O", 200, 9);
    cache.set("f9-base", "B", 200, 9);
    cache.set("f7", "S", 10, 7);
    cache.set("f9-new", "N", 200, 9);
    cache.pin(["f9-base"]);
    expect(cache.dropLevelsExcept(9, "f9-new")).toEqual(["f9-old"]);
    expect(cache.keys()).toEqual(["f9-base", "f7", "f9-new"]);
    cache.delete("f7");
    expect(cache.has("f7")).toBe(false);
    cache.clear();
    expect(cache.bytes()).toBe(0);
  });
});
