// 사이보그 초상 기억(portrait.ts) — 외형 → 초상 열쇠, 모아 그리기, 기억 상한, WebGL 없음, 기기 저장소
import { CHARACTER_PRESETS, type CharacterLook, characterLookKey } from "@terra/shared/characterLook";
import { describe, expect, it } from "vitest";
import {
  PORTRAIT_CACHE_MAX,
  PORTRAIT_STORAGE_KEY,
  PORTRAIT_STORED_MAX,
  type PortraitRenderer,
  type PortraitStorage,
  createPortraitCache,
  portraitKey,
  portraitPixelRatio,
} from "./portrait.ts";

const lookAt = (index: number): CharacterLook => {
  const preset = CHARACTER_PRESETS[index % CHARACTER_PRESETS.length];
  if (!preset) throw new Error("프리셋 없음");
  return preset.look;
};

/** 키 값만 바꾼 외형 여럿(기억 상한 시험용) */
function manyLooks(count: number): CharacterLook[] {
  const heights = [90, 95, 100, 105, 110];
  const out: CharacterLook[] = [];
  for (let i = 0; i < count; i++) {
    const base = lookAt(i % CHARACTER_PRESETS.length);
    out.push({ ...base, height: heights[i % heights.length] ?? 100, plating: Math.floor(i / 25) % 4 });
  }
  return out;
}

/** 가짜 렌더러: 부른 횟수·묶음을 적고 외형 표지가 든 data URL을 준다 */
function fakeRenderer(): { render: PortraitRenderer; calls: string[][] } {
  const calls: string[][] = [];
  const render: PortraitRenderer = (looks, size, ratio, framing) => {
    calls.push(looks.map((look) => characterLookKey(look)));
    return looks.map(
      (look) => `data:image/png;base64,${framing}-${String(size)}-${String(ratio)}-${characterLookKey(look)}`,
    );
  };
  return { render, calls };
}

function memoryStorage(
  initial: Record<string, string> = {},
): PortraitStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** 모으는 틱을 손으로 돌린다 */
function manualTick(): { schedule: (run: () => void) => void; run: () => Promise<void> } {
  const queue: (() => void)[] = [];
  return {
    schedule: (run) => {
      queue.push(run);
    },
    run: async () => {
      for (const job of queue.splice(0)) job();
      // load()·then이 끝날 때까지
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe("초상 열쇠", () => {
  it("외형 표지·구도·크기·배율이 모두 들어간다", () => {
    const look = lookAt(0);
    const key = portraitKey(look, "body", 72, 2);
    expect(key).toBe(`body:72@2:${characterLookKey(look)}`);
    expect(portraitKey(look, "face", 72, 2)).not.toBe(key);
    expect(portraitKey(look, "body", 40, 2)).not.toBe(key);
    expect(portraitKey(look, "body", 72, 1)).not.toBe(key);
    expect(portraitKey(lookAt(1), "body", 72, 2)).not.toBe(key);
  });

  it("같은 외형(다른 객체)이면 같은 열쇠, 칸 하나만 달라도 다른 열쇠", () => {
    const look = lookAt(2);
    expect(portraitKey({ ...look }, "face", 40, 1)).toBe(portraitKey(look, "face", 40, 1));
    expect(portraitKey({ ...look, glow: look.glow === "mint" ? "sky" : "mint" }, "face", 40, 1)).not.toBe(
      portraitKey(look, "face", 40, 1),
    );
    expect(portraitKey({ ...look, height: look.height === 100 ? 105 : 100 }, "face", 40, 1)).not.toBe(
      portraitKey(look, "face", 40, 1),
    );
  });

  it("크기는 정수 px로 반올림한다", () => {
    expect(portraitKey(lookAt(0), "body", 71.6, 1)).toBe(portraitKey(lookAt(0), "body", 72, 1));
  });

  it("화소 배율은 1~2, 0.5 단위", () => {
    expect(portraitPixelRatio(0.5)).toBe(1);
    expect(portraitPixelRatio(1)).toBe(1);
    expect(portraitPixelRatio(1.3)).toBe(1.5);
    expect(portraitPixelRatio(2)).toBe(2);
    expect(portraitPixelRatio(2.625)).toBe(2);
    expect(portraitPixelRatio(3)).toBe(2);
    expect(portraitPixelRatio(Number.NaN)).toBe(1);
  });
});

describe("초상 기억", () => {
  it("같은 틱의 요청은 묶음마다 한 번 그리고, 같은 열쇠는 한 번만 그린다", async () => {
    const { render, calls } = fakeRenderer();
    const tick = manualTick();
    const cache = createPortraitCache({ load: () => Promise.resolve(render), schedule: tick.schedule });
    const a = cache.request({ look: lookAt(0), framing: "body", sizePx: 72, pixelRatio: 1 });
    const b = cache.request({ look: lookAt(1), framing: "body", sizePx: 72, pixelRatio: 1 });
    const again = cache.request({ look: { ...lookAt(0) }, framing: "body", sizePx: 72, pixelRatio: 1 });
    const face = cache.request({ look: lookAt(0), framing: "face", sizePx: 40, pixelRatio: 1 });
    await tick.run();
    // body 72 묶음 하나(외형 둘) + face 40 묶음 하나
    expect(calls).toEqual([
      [characterLookKey(lookAt(0)), characterLookKey(lookAt(1))],
      [characterLookKey(lookAt(0))],
    ]);
    expect(await a).toBe(`data:image/png;base64,body-72-1-${characterLookKey(lookAt(0))}`);
    expect(await again).toBe(await a);
    expect(await b).toContain(characterLookKey(lookAt(1)));
    expect(await face).toContain("face-40-1-");
    // 그린 뒤에는 바로 준다(다시 그리지 않는다)
    const key = portraitKey(lookAt(0), "body", 72, 1);
    expect(cache.peek(key)).toBe(await a);
    expect(await cache.request({ look: lookAt(0), framing: "body", sizePx: 72, pixelRatio: 1 })).toBe(
      await a,
    );
    expect(calls).toHaveLength(2);
  });

  it(`기억은 ${String(PORTRAIT_CACHE_MAX)}장까지 — 가장 오래 안 쓴 것부터 버린다`, async () => {
    const { render } = fakeRenderer();
    const tick = manualTick();
    const cache = createPortraitCache({ load: () => Promise.resolve(render), schedule: tick.schedule });
    const looks = manyLooks(PORTRAIT_CACHE_MAX + 5);
    expect(new Set(looks.map((look) => characterLookKey(look))).size).toBe(looks.length);
    const first = looks[0];
    if (!first) throw new Error("외형 없음");
    const pending = looks.map((look) => cache.request({ look, framing: "body", sizePx: 48, pixelRatio: 1 }));
    await tick.run();
    await Promise.all(pending);
    expect(cache.size).toBe(PORTRAIT_CACHE_MAX);
    expect(cache.peek(portraitKey(first, "body", 48, 1))).toBeNull();
    const last = looks.at(-1);
    if (!last) throw new Error("외형 없음");
    expect(cache.peek(portraitKey(last, "body", 48, 1))).not.toBeNull();
  });

  it("WebGL을 쓸 수 없으면 null이고, 그 뒤로는 다시 그리지 않는다", async () => {
    let calls = 0;
    const tick = manualTick();
    const cache = createPortraitCache({
      load: () =>
        Promise.resolve(() => {
          calls += 1;
          throw new Error("WebGL 없음");
        }),
      schedule: tick.schedule,
    });
    const first = cache.request({ look: lookAt(0), framing: "body", sizePx: 72, pixelRatio: 1 });
    await tick.run();
    expect(await first).toBeNull();
    expect(cache.unsupported).toBe(true);
    expect(await cache.request({ look: lookAt(1), framing: "body", sizePx: 72, pixelRatio: 1 })).toBeNull();
    await tick.run();
    expect(calls).toBe(1);
  });

  it("엔진 조각을 받지 못하면 그 요청만 null이고, 다음 요청은 다시 받는다", async () => {
    const { render } = fakeRenderer();
    let fail = true;
    const tick = manualTick();
    const cache = createPortraitCache({
      load: () => (fail ? Promise.reject(new Error("조각 없음")) : Promise.resolve(render)),
      schedule: tick.schedule,
    });
    const first = cache.request({ look: lookAt(0), framing: "body", sizePx: 72, pixelRatio: 1 });
    await tick.run();
    expect(await first).toBeNull();
    expect(cache.unsupported).toBe(false);
    fail = false;
    const second = cache.request({ look: lookAt(0), framing: "body", sizePx: 72, pixelRatio: 1 });
    await tick.run();
    expect(await second).toContain("data:image/png;base64,");
  });

  it("persist 초상만 기기 저장소에 남고, 다음 시작 때 엔진 없이 바로 보인다", async () => {
    const { render, calls } = fakeRenderer();
    const storage = memoryStorage();
    const tick = manualTick();
    const cache = createPortraitCache({
      load: () => Promise.resolve(render),
      storage,
      schedule: tick.schedule,
    });
    const face = cache.request({
      look: lookAt(3),
      framing: "face",
      sizePx: 40,
      pixelRatio: 2,
      persist: true,
    });
    const body = cache.request({ look: lookAt(3), framing: "body", sizePx: 72, pixelRatio: 2 });
    await tick.run();
    const url = await face;
    await body;
    const key = portraitKey(lookAt(3), "face", 40, 2);
    expect(JSON.parse(storage.data.get(PORTRAIT_STORAGE_KEY) ?? "null")).toEqual([{ k: key, u: url }]);

    // 다시 켬: 같은 열쇠는 엔진을 받지 않고 준다
    let loads = 0;
    const next = createPortraitCache({
      load: () => {
        loads += 1;
        return Promise.resolve(render);
      },
      storage,
      schedule: tick.schedule,
    });
    expect(next.peek(key)).toBe(url);
    expect(
      await next.request({ look: lookAt(3), framing: "face", sizePx: 40, pixelRatio: 2, persist: true }),
    ).toBe(url);
    expect(loads).toBe(0);
    expect(calls).toHaveLength(2);
    // 다른 외형은 저장한 것을 쓰지 않는다
    expect(next.peek(portraitKey(lookAt(4), "face", 40, 2))).toBeNull();
  });

  it("기기 저장소는 최근 PORTRAIT_STORED_MAX장을 남긴다(위 띠 얼굴과 사이보그 화면이 서로 밀어내지 않는다)", async () => {
    const { render, calls } = fakeRenderer();
    const storage = memoryStorage();
    const tick = manualTick();
    const cache = createPortraitCache({
      load: () => Promise.resolve(render),
      storage,
      schedule: tick.schedule,
    });
    const face = cache.request({
      look: lookAt(1),
      framing: "face",
      sizePx: 40,
      pixelRatio: 2,
      persist: true,
    });
    const hero = cache.request({
      look: lookAt(1),
      framing: "body",
      sizePx: 220,
      pixelRatio: 2,
      persist: true,
    });
    await tick.run();
    const faceUrl = await face;
    const heroUrl = await hero;
    const next = createPortraitCache({
      load: () => Promise.reject(new Error("엔진을 받지 않아야 한다")),
      storage,
      schedule: tick.schedule,
    });
    expect(next.peek(portraitKey(lookAt(1), "face", 40, 2))).toBe(faceUrl);
    expect(next.peek(portraitKey(lookAt(1), "body", 220, 2))).toBe(heroUrl);

    // 상한을 넘으면 가장 오래된 것부터 버린다
    const many = manyLooks(PORTRAIT_STORED_MAX + 2);
    for (const look of many) {
      const one = cache.request({ look, framing: "body", sizePx: 220, pixelRatio: 2, persist: true });
      await tick.run();
      await one;
    }
    const kept: unknown = JSON.parse(storage.data.get(PORTRAIT_STORAGE_KEY) ?? "[]");
    expect(Array.isArray(kept) ? kept.length : 0).toBe(PORTRAIT_STORED_MAX);
    const last = many.at(-1);
    if (!last) throw new Error("외형 없음");
    const after = createPortraitCache({ load: () => Promise.resolve(render), storage });
    expect(after.peek(portraitKey(last, "body", 220, 2))).not.toBeNull();
    expect(after.peek(portraitKey(lookAt(1), "face", 40, 2))).toBeNull();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("옛 판의 한 장 값({ k, u })도 읽는다", () => {
    const { render } = fakeRenderer();
    const key = portraitKey(lookAt(2), "face", 40, 1);
    const url = "data:image/png;base64,old";
    const storage = memoryStorage({ [PORTRAIT_STORAGE_KEY]: JSON.stringify({ k: key, u: url }) });
    expect(createPortraitCache({ load: () => Promise.resolve(render), storage }).peek(key)).toBe(url);
  });

  it("저장소가 가득 차면 오래된 것을 버리고 다시 쓴다", async () => {
    const { render } = fakeRenderer();
    const data = new Map<string, string>();
    // 두 장보다 많으면 넘친다고 하는 저장소
    const tight: PortraitStorage = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        const list: unknown = JSON.parse(value);
        if (Array.isArray(list) && list.length > 2) throw new Error("가득 참");
        data.set(key, value);
      },
    };
    const tick = manualTick();
    const cache = createPortraitCache({
      load: () => Promise.resolve(render),
      storage: tight,
      schedule: tick.schedule,
    });
    const looks = manyLooks(3);
    for (const look of looks) {
      const one = cache.request({ look, framing: "face", sizePx: 40, pixelRatio: 1, persist: true });
      await tick.run();
      await one;
    }
    const kept: unknown = JSON.parse(data.get(PORTRAIT_STORAGE_KEY) ?? "[]");
    expect(Array.isArray(kept) ? kept.length : 0).toBe(2);
    const newest = looks[2];
    if (!newest) throw new Error("외형 없음");
    expect(
      createPortraitCache({ load: () => Promise.resolve(render), storage: tight }).peek(
        portraitKey(newest, "face", 40, 1),
      ),
    ).not.toBeNull();
  });

  it("깨진 저장 값·막힌 저장소는 무시한다", async () => {
    const { render } = fakeRenderer();
    const tick = manualTick();
    const broken = memoryStorage({ [PORTRAIT_STORAGE_KEY]: "{not json" });
    const cache = createPortraitCache({
      load: () => Promise.resolve(render),
      storage: broken,
      schedule: tick.schedule,
    });
    expect(cache.peek("face:40@1:x")).toBeNull();
    const foreign = memoryStorage({
      [PORTRAIT_STORAGE_KEY]: JSON.stringify({ k: "face:40@1:x", u: "javascript:x" }),
    });
    expect(
      createPortraitCache({ load: () => Promise.resolve(render), storage: foreign }).peek("face:40@1:x"),
    ).toBeNull();
    const blocked: PortraitStorage = {
      getItem: () => {
        throw new Error("막힘");
      },
      setItem: () => {
        throw new Error("막힘");
      },
    };
    const safe = createPortraitCache({
      load: () => Promise.resolve(render),
      storage: blocked,
      schedule: tick.schedule,
    });
    const face = safe.request({ look: lookAt(0), framing: "face", sizePx: 40, pixelRatio: 1, persist: true });
    await tick.run();
    expect(await face).toContain("data:image/png;base64,");
  });
});
