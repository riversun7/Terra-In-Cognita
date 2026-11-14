// 사이보그 초상 — 3D 외형(CharacterLook)을 프리셋 썸네일과 같은 렌더러(@terra/engine/characterPreview renderCharacterThumbnails)로
// 한 장 그려 PNG data URL로 둔다. docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 초상)".
// - 열쇠 = 구도(body·face) + 크기(px) + 화소 배율 + 외형 표지(characterLookKey). 같은 열쇠는 한 번만 그린다(목록이 여러 번 그려도 싸다).
// - 같은 틱에 들어온 요청은 모아서 렌더러 하나로 그린다(구도·크기·배율이 같은 묶음마다 한 번 부른다).
// - 엔진(three)은 처음 요청할 때 동적 import()로 받는다(첫 화면 묶음에 넣지 않는다).
// - WebGL을 쓸 수 없으면(렌더러가 던짐) 다시 시도하지 않고 null을 준다 → 부르는 쪽은 무늬 없는 실루엣(CyborgSilhouette)을 둔다.
//   엔진 조각을 받지 못했을 때는 그 요청만 null이고 다음 요청이 다시 받는다.
// - 위 띠 얼굴·사이보그 화면처럼 다시 보는 초상은 기기 저장소(localStorage)에 남겨(persist, 최근 PORTRAIT_STORED_MAX장)
//   다음 시작 때 엔진 없이 첫 그림부터 바로 보인다("바뀜 (2026-11-14, 2D 제거)" — 들어갈 때 옛 2D 그림이 번쩍이던 것).
//   기기 편의일 뿐이다: 읽기·쓰기가 실패하면 그냥 다시 그린다.
import type { CharacterThumbnailFraming } from "@terra/engine/characterPreview";
import { type CharacterLook, characterLookKey } from "@terra/shared/characterLook";
import { useEffect, useState } from "react";
import { loadPreviewEngine } from "./previewEngine.ts";

export type PortraitFraming = CharacterThumbnailFraming;

/** 기억하는 초상 수(넘으면 가장 오래 안 쓴 것부터 버린다). 한 장 = 수 KB~수십 KB의 data URL */
export const PORTRAIT_CACHE_MAX = 48;
/** 기기 저장소 열쇠(초상 목록: [{ k: 열쇠, u: data URL }, …], 마지막이 가장 최근. 옛 판의 한 장 { k, u }도 읽는다) */
export const PORTRAIT_STORAGE_KEY = "terra.portrait";
/** 기기 저장소에 남기는 초상 수(위 띠 얼굴 + 사이보그 화면 + 바로 앞 외형 몫). 한 장 = 수십 KB라 적게 둔다 */
export const PORTRAIT_STORED_MAX = 4;

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

interface StoredPortrait {
  readonly k: string;
  readonly u: string;
}

function storedEntry(data: unknown): StoredPortrait | null {
  if (typeof data !== "object" || data === null) return null;
  const k: unknown = Reflect.get(data, "k");
  const u: unknown = Reflect.get(data, "u");
  return typeof k === "string" && typeof u === "string" && u.startsWith(DATA_URL_PREFIX) ? { k, u } : null;
}

function readStored(storage: PortraitStorage | null): StoredPortrait[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PORTRAIT_STORAGE_KEY);
    if (raw === null) return [];
    const data: unknown = JSON.parse(raw);
    const list: unknown[] = Array.isArray(data) ? data : [data];
    const out: StoredPortrait[] = [];
    for (const item of list) {
      const entry = storedEntry(item);
      if (entry && !out.some((other) => other.k === entry.k)) out.push(entry);
    }
    return out.slice(-PORTRAIT_STORED_MAX);
  } catch {
    return [];
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
    if (!storage) return;
    const last = stored.at(-1);
    if (last?.k === key) return;
    let next = [...stored.filter((entry) => entry.k !== key), { k: key, u: url }].slice(-PORTRAIT_STORED_MAX);
    // 저장소가 가득 차면 오래된 것부터 버리고 다시 쓴다(마지막 한 장도 못 쓰면 그만둔다 — 다음 시작 때 다시 그린다)
    while (next.length > 0) {
      try {
        storage.setItem(PORTRAIT_STORAGE_KEY, JSON.stringify(next));
        stored = next;
        return;
      } catch {
        next = next.slice(1);
      }
    }
  };

  const peek = (key: string): string | null => {
    const url = done.get(key);
    if (url !== undefined) return url;
    const kept = stored.find((entry) => entry.k === key);
    if (kept) {
      remember(key, kept.u);
      return kept.u;
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

/** 초상 칸의 상태: 3d = 그린 초상, pending = 그리는 중, none = 그릴 수 없다(외형 없음·WebGL 없음) */
export type PortraitState = "3d" | "pending" | "none";

/**
 * 외형의 3D 초상(data URL)과 상태. 그리는 중이면 pending, 외형 없음·WebGL 없음이면 none → 부르는 쪽이 무늬 없는 실루엣을 보인다.
 * 기억(메모리·기기 저장소)에 있으면 첫 그림부터 3d다(효과를 기다리지 않는다).
 * sizePx는 CSS 크기(px)다. 화소 배율은 기기 값(1~2)을 쓴다
 */
export function usePortrait(
  look: CharacterLook | null,
  framing: PortraitFraming,
  sizePx: number,
  persist = false,
): { url: string | null; state: PortraitState } {
  const pixelRatio = portraitPixelRatio(typeof window === "undefined" ? 1 : window.devicePixelRatio);
  const key = look ? portraitKey(look, framing, sizePx, pixelRatio) : null;
  const ready = key === null ? null : portraitCache().peek(key);
  const [drawn, setDrawn] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (look === null || key === null || ready !== null) return undefined;
    let live = true;
    void portraitCache()
      .request({ look, framing, sizePx, pixelRatio, persist })
      .then((url) => {
        if (live) setDrawn({ key, url });
      });
    return () => {
      live = false;
    };
  }, [look, key, ready, framing, sizePx, pixelRatio, persist]);
  if (key === null) return { url: null, state: "none" };
  if (ready !== null) return { url: ready, state: "3d" };
  if (drawn?.key === key)
    return drawn.url === null ? { url: null, state: "none" } : { url: drawn.url, state: "3d" };
  return { url: null, state: portraitCache().unsupported ? "none" : "pending" };
}
