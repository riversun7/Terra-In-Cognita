// 개발·운영 화면 층(dev surface, ADR 2026-11-02-dev-ui) — 개발자·관리자 화면은 게임 테마와 따로 촘촘한 개발자용 모양을 쓴다.
// - 틀(Shell.tsx)이 개발·관리자 주소를 그리는 동안 <html>에 data-surface="dev"와 data-dev-theme="neon"|"light"를 붙인다.
//   값은 styles/tokens.css의 :root[data-surface="dev"] 블록(네온 다크, 기본)과 [data-dev-theme="light"] 블록(라이트)이 바꾼다.
// - 테마는 둘뿐이다(네온 다크 기본 ↔ 라이트). 게임 테마 설정(파스텔·다크·선명·정거장)은 보지 않는다.
// - 고른 테마는 이 기기에만 둔다(localStorage terra.devTheme). 저장소를 못 쓰면 이번 실행 동안만 기억하고 기본(네온)으로 그린다.
import type { RouteId } from "@terra/shared";
import { useSyncExternalStore } from "react";

export type DevTheme = "neon" | "light";

/** 기기 저장 열쇠(값은 "neon" | "light" 글자 그대로) */
export const DEV_THEME_STORAGE_KEY = "terra.devTheme";

/** 개발 화면 층을 쓰는 주소: 개발자 영역(/dev, /dev/…)과 관리자(/admin) */
export function isDevSurfaceRoute(id: RouteId): boolean {
  return id === "admin" || id === "dev" || id.startsWith("dev_");
}

function readTheme(): DevTheme {
  try {
    return localStorage.getItem(DEV_THEME_STORAGE_KEY) === "light" ? "light" : "neon";
  } catch {
    // 저장소를 못 씀(개인 정보 보호 모드 등): 기본값
    return "neon";
  }
}

const listeners = new Set<() => void>();
let theme: DevTheme | null = null;

function currentTheme(): DevTheme {
  theme ??= readTheme();
  return theme;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDevTheme(): DevTheme {
  return useSyncExternalStore(subscribe, currentTheme);
}

export function setDevTheme(next: DevTheme): void {
  if (currentTheme() === next) return;
  theme = next;
  try {
    localStorage.setItem(DEV_THEME_STORAGE_KEY, next);
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 기억한다
  }
  for (const listener of listeners) listener();
}

/** <html>에 개발 화면 층 표시를 붙이거나(active) 뗀다 */
export function applyDevSurface(active: boolean, next: DevTheme): void {
  const root = document.documentElement;
  if (active) {
    root.setAttribute("data-surface", "dev");
    root.setAttribute("data-dev-theme", next);
  } else {
    root.removeAttribute("data-surface");
    root.removeAttribute("data-dev-theme");
  }
}
