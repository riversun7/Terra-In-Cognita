// 홈 설정(user_settings.home: 템플릿·카드) 읽기와 저장 — 홈 조각이 쓰는 곳은 이 두 함수뿐이다.
// [임시] W2(계정 설정 넓히기)가 합쳐지기 전에는 이 기기의 저장소(localStorage)에만 둔다. 새로고침에는 남지만 다른 기기에는 가지 않는다.
// W2가 합쳐지면 두 함수의 몸만 바꾼다(꽂는 줄):
//   useStoredHome() → return useSettings().device.home;               (settings/settings.ts, 모양을 모르는 JSON 값)
//   patchHome(patch) → chooseHome(mergeHome(getSettingsSnapshot().device.home, patch));   (기기 저장 + 계정 올리기)
// 그때 이 파일의 임시 열쇠(TEMP_KEY)와 아래 저장소 코드는 지운다. 임시 열쇠에 남은 값은 옮기지 않는다(개발 가지에서만 쓴 값).
// 값은 늘 모양을 모르는 JSON으로 다룬다. 읽기는 그리는 곳이 parseHome(값, 역할)로, 쓰기는 mergeHome(원래 값, 바꾼 칸)으로 한다
// (더 새 버전이 넣은 칸과 모르는 카드가 남는다, ADR 2026-10-29-app-shell 5절).
import { type HomePatch, mergeHome } from "@terra/shared/dashboard";
import { useSyncExternalStore } from "react";

/** [임시] W2 전 저장 열쇠. W2의 기기 저장(terra.settings)과 겹치지 않게 따로 둔다 */
const TEMP_KEY = "terra.home.settings.tmp";

const listeners = new Set<() => void>();
/** 지금 값(모양을 모르는 JSON). undefined = 저장한 적 없음 */
let current: unknown;
let loaded = false;
let listening = false;

function readStored(): unknown {
  try {
    const raw = localStorage.getItem(TEMP_KEY);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    // 저장소를 못 쓰거나 깨진 값: 저장한 적 없는 것으로 본다
    return undefined;
  }
}

function load(): unknown {
  if (!loaded) {
    current = readStored();
    loaded = true;
  }
  return current;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** 다른 탭에서 바꾸면 따른다(storage 이벤트는 앱에 하나만 건다) */
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== TEMP_KEY) return;
  current = readStored();
  loaded = true;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening) {
    listening = true;
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** 저장된 home 값(모양을 모르는 JSON). W2 뒤: useSettings().device.home */
export function useStoredHome(): unknown {
  return useSyncExternalStore(subscribe, load);
}

/**
 * 바꾼 칸만 원래 값에 덮어 저장한다(바꿀 때마다 바로, ADR 37 6절). W2 뒤: chooseHome(mergeHome(device.home, patch)).
 * 원래 값은 늘 지금 값을 다시 읽는다(빠르게 잇달아 바꿔도 앞 바꿈을 잃지 않게).
 */
export function patchHome(patch: HomePatch): void {
  const next = mergeHome(load(), patch);
  current = next;
  try {
    localStorage.setItem(TEMP_KEY, JSON.stringify(next));
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 기억한다
  }
  emit();
}
