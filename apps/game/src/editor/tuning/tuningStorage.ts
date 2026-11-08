// 설정 칸 패널이 이 기기에만 남기는 값 — 고른 분야, 풀이 보기. localStorage를 못 쓰면(사생활 창 등) 이번 화면에서만 기억한다.
// docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 분야별 페이지)"·"바뀜 (2026-11-08 화면 개편)".
import { ALL_PAGES, type TuningPageTab, parsePageTab } from "./tuningModel.ts";

const PAGE_KEY = "terra.devTuning.page";
const DESC_KEY = "terra.devTuning.desc";

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 기억한다
  }
}

/** 이 기기에 남긴 분야(없거나 못 읽으면 전체) */
export const storedPageTab = (): TuningPageTab => parsePageTab(read(PAGE_KEY)) ?? ALL_PAGES;
export const storePageTab = (tab: TuningPageTab): void => write(PAGE_KEY, tab);

/** 풀이 보기(처음은 켬) */
export const storedShowDesc = (): boolean => read(DESC_KEY) !== "0";
export const storeShowDesc = (show: boolean): void => write(DESC_KEY, show ? "1" : "0");
