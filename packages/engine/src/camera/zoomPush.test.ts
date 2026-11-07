import { describe, expect, it } from "vitest";
import { type ZoomEdge, createZoomPush, edgeOf } from "./zoomPush.ts";

function recorder() {
  const pushed: ZoomEdge[] = [];
  return { pushed, push: createZoomPush((edge) => pushed.push(edge)) };
}

describe("확대 한계 너머로 밀기", () => {
  it("가장 멀리에 닿은 채 시작한 두 손가락 묶음이 1.15배 넘게 줄이면 out을 한 번 알린다", () => {
    const { pushed, push } = recorder();
    push.begin("out");
    push.push(1.1);
    expect(pushed).toEqual([]);
    push.push(1.2);
    expect(pushed).toEqual(["out"]);
    // 같은 묶음에서 더 밀어도 다시 알리지 않는다
    push.push(2);
    expect(pushed).toEqual(["out"]);
  });

  it("가장 가까이에서 키우면 in, 반대로 움직이면 풀린다", () => {
    const { pushed, push } = recorder();
    push.begin("in");
    push.push(0.9);
    push.push(1.2);
    push.push(0.5);
    expect(pushed).toEqual([]);
    push.begin("in");
    push.push(0.7);
    expect(pushed).toEqual(["in"]);
  });

  it("끝에 닿지 않은 채 시작한 묶음은 끝까지 가도 알리지 않는다", () => {
    const { pushed, push } = recorder();
    push.begin(null);
    push.push(3);
    push.push(3);
    push.end();
    expect(pushed).toEqual([]);
  });

  it("휠: 쉬지 않고 이어진 휠은 한 묶음(처음에 끝이 아니면 알리지 않음), 쉰 뒤 끝에서 다시 굴리면 알린다", () => {
    const { pushed, push } = recorder();
    push.wheel(1.8, null, 0);
    push.wheel(1.8, "out", 150);
    push.wheel(1.8, "out", 300);
    expect(pushed).toEqual([]);
    push.wheel(1.3, "out", 1000);
    expect(pushed).toEqual(["out"]);
  });

  it("지금 닿아 있는 끝", () => {
    expect(edgeOf(10, 10, 100)).toBe("in");
    expect(edgeOf(100, 10, 100)).toBe("out");
    expect(edgeOf(50, 10, 100)).toBeNull();
  });
});
