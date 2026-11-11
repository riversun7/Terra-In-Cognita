// 사이보그 초상 — 3D 외형(CharacterLook)을 프리셋 썸네일과 같은 렌더러(@terra/engine/characterPreview renderCharacterThumbnails)로
// 한 장 그려 PNG data URL로 둔다. docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 초상)".
// - 열쇠 = 구도(body·face) + 크기(px) + 화소 배율 + 외형 표지(characterLookKey). 같은 열쇠는 한 번만 그린다(목록이 여러 번 그려도 싸다).
// - 같은 틱에 들어온 요청은 모아서 렌더러 하나로 그린다(구도·크기·배율이 같은 묶음마다 한 번 부른다).
// - 엔진(three)은 처음 요청할 때 동적 import()로 받는다(첫 화면 묶음에 넣지 않는다).
// - WebGL을 쓸 수 없으면(렌더러가 던짐) 다시 시도하지 않고 null을 준다 → 부르는 쪽은 옛 2D 그림(또는 실루엣)을 그대로 둔다.
//   엔진 조각을 받지 못했을 때는 그 요청만 null이고 다음 요청이 다시 받는다.
// - 위 띠 얼굴처럼 앱을 켤 때마다 보이는 초상은 기기 저장소(localStorage)에 한 장 남겨(persist) 다음 시작 때 엔진 없이 바로 보인다.
//   기기 편의일 뿐이다: 읽기·쓰기가 실패하면 그냥 다시 그린다.
import type { CharacterThumbnailFraming } from "@terra/engine/characterPreview";
import { type CharacterLook, characterLookKey } from "@terra/shared/characterLook";
import { useEffect, useState } from "react";
import { loadPreviewEngine } from "./previewEngine.ts";

export type PortraitFraming = CharacterThumbnailFraming;

/** 기억하는 초상 수(넘으면 가장 오래 안 쓴 것부터 버린다). 한 장 = 수 KB~수십 KB의 data URL */
export const PORTRAIT_CACHE_MAX = 48;
/** 기기 저장소 열쇠(초상 한 장: { k: 열쇠, u: data URL }) */
export const PORTRAIT_STORAGE_KEY = "terra.portrait";

/** 화소 배율: 1~2, 0.5 단위(배율마다 다른 열쇠라 잘게 나누지 않는다) */
export function portraitPixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 1) return 1;
  return Math.min(2, Math.round(devicePixelRatio * 2) / 2);
}

/** 초상 열쇠(구도:크기@배율:외형 표지) */
export function portraitKey(
  look: CharacterLook,
  framing: PortraitFraming,
  sizePx: number,
  pixelRatio: number,
): string {
  return `${framing}:${String(Math.max(1, Math.round(sizePx)))}@${String(pixelRatio)}:${characterLookKey(look)}`;
}

/** 썸네일 렌더러(엔진의 renderCharacterThumbnails 모양). WebGL을 못 쓰면 던진다 */
export type PortraitRenderer = (
  looks: readonly CharacterLook[],
  sizePx: number,
  pixelRatio: number,
  framing: PortraitFraming,
) => string[];

/** 저장소(localStorage 모양) — 시험은 가짜를 넣는다 */
export interface PortraitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PortraitRequest {
  readonly look: CharacterLook;
  readonly framing: PortraitFraming;
  readonly sizePx: number;
  readonly pixelRatio: number;
  /** 기기 저장소에 남긴다(위 띠 얼굴) */
  readonly persist?: boolean;
}

interface Job extends PortraitRequest {
  readonly key: string;
  readonly settle: ((url: string | null) => void)[];
}

export interface PortraitCache {
  /** 그려 둔 초상(없으면 null). 기기 저장소에 남긴 것도 본다 */
  peek(key: string): string | null;
  /** 초상을 그린다(이미 있으면 바로). 못 그리면 null */
  request(request: PortraitRequest): Promise<string | null>;
  /** WebGL을 쓸 수 없다고 판정했는지 */
  readonly unsupported: boolean;
  /** 지금 기억하는 수(시험용) */
  readonly size: number;
}

const DATA_URL_PREFIX = "data:image/png;base64,";

function readStored(storage: PortraitStorage | null): { k: string; u: string } | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PORTRAIT_STORAGE_KEY);
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const k: unknown = Reflect.get(data, "k");
    const u: unknown = Reflect.get(data, "u");
    return typeof k === "string" && typeof u === "string" && u.startsWith(DATA_URL_PREFIX) ? { k, u } : null;
  } catch {
    return null;
  }
}

export function createPortraitCache(options: {
  /** 렌더러를 준다(엔진 조각 받기). 실패하면 그 요청들만 null */
  readonly load: () => Promise<PortraitRenderer>;
  readonly storage?: PortraitStorage | null;
  /** 모으는 틱(기본 다음 매크로 작업) */
  readonly schedule?: (run: () => void) => void;
}): PortraitCache {
  const storage = options.storage ?? null;
  const schedule = options.schedule ?? ((run: () => void) => void setTimeout(run, 0));
  const done = new Map<string, string>();
  const waiting = new Map<string, Job>();
  let unsupported = false;
  let scheduled = false;
  let stored = readStored(storage);

  const remember = (key: string, url: string): void => {
    done.delete(key);
    done.set(key, url);
    while (done.size > PORTRAIT_CACHE_MAX) {
      const oldest = done.keys().next();
      if (oldest.done === true) break;
      done.delete(oldest.value);
    }
  };

  const persist = (key: string, url: string): void => {
    if (!storage || stored?.k === key) return;
    stored = { k: key, u: url };
    try {
      storage.setItem(PORTRAIT_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // 저장소가 가득 찼거나 막혔다 — 다음 시작 때 다시 그린다
    }
  };

  const peek = (key: string): string | null => {
    const url = done.get(key);
    if (url !== undefined) return url;
    if (stored?.k === key) {
      remember(key, stored.u);
      return stored.u;
    }
    return null;
  };

  const finish = (job: Job, url: string | null): void => {
    for (const settle of job.settle) settle(url);
  };

  async function flush(): Promise<void> {
    scheduled = false;
    let render: PortraitRenderer;
    try {
      render = await options.load();
    } catch {
      // 엔진 조각을 받지 못했다 — 지금 기다리는 것만 실패(다음 요청이 다시 받는다)
      const failed = [...waiting.values()];
      waiting.clear();
      for (const job of failed) finish(job, null);
      return;
    }
    const jobs = [...waiting.values()];
    waiting.clear();
    // 구도·크기·배율이 같은 것끼리 한 번에 그린다
    const groups = new Map<string, Job[]>();
    for (const job of jobs) {
      const group = `${job.framing}:${String(job.sizePx)}@${String(job.pixelRatio)}`;
      const list = groups.get(group);
      if (list) list.push(job);
      else groups.set(group, [job]);
    }
    for (const list of groups.values()) {
      const first = list[0];
      if (!first) continue;
      let urls: string[] | null = null;
      if (!unsupported) {
        try {
          urls = render(
            list.map((job) => job.look),
            first.sizePx,
            first.pixelRatio,
            first.framing,
          );
        } catch {
          unsupported = true;
        }
      }
      list.forEach((job, index) => {
        const url = urls?.[index];
        if (url === undefined || !url.startsWith(DATA_URL_PREFIX)) {
          finish(job, null);
          return;
        }
        remember(job.key, url);
        if (job.persist === true) persist(job.key, url);
        finish(job, url);
      });
    }
  }

  const request = (input: PortraitRequest): Promise<string | null> => {
    const key = portraitKey(input.look, input.framing, input.sizePx, input.pixelRatio);
    const ready = peek(key);
    if (ready !== null) {
      if (input.persist === true) persist(key, ready);
      return Promise.resolve(ready);
    }
    if (unsupported) return Promise.resolve(null);
    return new Promise((resolve) => {
      const job = waiting.get(key);
      if (job) {
        job.settle.push(resolve);
        return;
      }
      waiting.set(key, {
        ...input,
        sizePx: Math.max(1, Math.round(input.sizePx)),
        key,
        settle: [resolve],
      });
      if (!scheduled) {
        scheduled = true;
        schedule(() => void flush());
      }
    });
  };

  return {
    peek,
    request,
    get unsupported() {
      return unsupported;
    },
    get size() {
      return done.size;
    },
  };
}

function deviceStorage(): PortraitStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

let shared: PortraitCache | null = null;

/** 앱이 함께 쓰는 초상 기억(처음 쓸 때 만든다) */
export function portraitCache(): PortraitCache {
  shared ??= createPortraitCache({
    load: () => loadPreviewEngine().then((engine) => engine.renderCharacterThumbnails),
    storage: deviceStorage(),
  });
  return shared;
}

/**
 * 외형의 3D 초상(data URL). 그리는 중·WebGL 없음·외형 없음이면 null → 부르는 쪽이 옛 그림을 보인다.
 * sizePx는 CSS 크기(px)다. 화소 배율은 기기 값(1~2)을 쓴다
 */
export function usePortrait(
  look: CharacterLook | null,
  framing: PortraitFraming,
  sizePx: number,
  persist = false,
): string | null {
  const pixelRatio = portraitPixelRatio(typeof window === "undefined" ? 1 : window.devicePixelRatio);
  const key = look ? portraitKey(look, framing, sizePx, pixelRatio) : null;
  const ready = key === null ? null : portraitCache().peek(key);
  const [drawn, setDrawn] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (look === null || key === null || ready !== null) return undefined;
    let live = true;
    void portraitCache()
      .request({ look, framing, sizePx, pixelRatio, persist })
      .then((url) => {
        if (live && url !== null) setDrawn({ key, url });
      });
    return () => {
      live = false;
    };
  }, [look, key, ready, framing, sizePx, pixelRatio, persist]);
  if (ready !== null) return ready;
  return drawn?.key === key ? drawn.url : null;
}
