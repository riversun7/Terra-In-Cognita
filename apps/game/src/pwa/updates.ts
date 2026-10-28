// 새 버전 적용 — 서비스 워커(SW) 등록, 새 버전 확인, 적용(새로고침). 화면(React) 밖에서 한 번만 시작한다.
// 언제 적용할지는 updatePolicy.ts가 정한다(켤 때 자동, 쓰는 중엔 배너). ADR 2026-10-28-pwa-and-browser-baseline
// SW가 없는 곳(카카오톡 같은 앱 안 브라우저, https가 아닌 주소)에서는 아무것도 하지 않고, 강제 적용은 그냥 새로고침이다.
import { registerSW } from "virtual:pwa-register";
import { closeForReload } from "../net/connection.ts";
import {
  INITIAL_VISIBILITY,
  type LaunchWindow,
  UPDATE_TIMING,
  type VisibilityTracker,
  canAutoReload,
  decideReadyAction,
  onHidden,
  onVisible,
  parseStoredTime,
} from "./updatePolicy.ts";

/** 배너 상태: 없음 / 새 버전 있음(지금 바꾸기·나중에) / 바꾸는 중 */
export type UpdateState = "idle" | "available" | "applying";

/** 누가 강제 적용을 불렀나: 자동(서버 거절·파일 못 찾음)은 반복 새로고침을 막고, 사람이 누른 것은 막지 않는다 */
export type UpdateTrigger = "auto" | "manual";

// Workbox가 만든 sw.js가 받는 메시지(scripts/check-pwa.mjs가 빌드 결과에서 확인)
const SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;
/** 마지막 자동 새로고침 시각. 새로고침 뒤에도 남아야 해서 sessionStorage에 둔다(탭마다 따로) */
const AUTO_RELOAD_KEY = "terra.pwa.lastAutoReload";

let state: UpdateState = "idle";
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let launch: LaunchWindow = { startedAt: Date.now(), inputSeen: false };
let visibility: VisibilityTracker = INITIAL_VISIBILITY;
/** 이미 처리한(바로 적용했거나 배너로 알린) 새 버전. 같은 것을 두 번 알리지 않는다 */
let handledWorker: ServiceWorker | null = null;
let started = false;
let forcing = false;
let reloading = false;

const swSupported = (): boolean => "serviceWorker" in navigator;

function setState(next: UpdateState): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

/** 배너용(useSyncExternalStore). 그만 받는 함수를 돌려준다 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUpdateState(): UpdateState {
  return state;
}

/** 새로고침은 한 번만. 그 전에 WebSocket을 정상 종료(1000)한다 */
function reloadNow(): void {
  if (reloading) return;
  reloading = true;
  closeForReload();
  window.location.reload();
}

/** 자동 새로고침을 해도 되면 시각을 남기고 true. 저장소를 못 쓰면 막지 않는다 */
function claimAutoReload(): boolean {
  const now = Date.now();
  try {
    if (!canAutoReload(parseStoredTime(sessionStorage.getItem(AUTO_RELOAD_KEY)), now)) return false;
    sessionStorage.setItem(AUTO_RELOAD_KEY, String(now));
  } catch {
    // 사파리 개인 정보 보호 모드 등: 기록 없이 진행
  }
  return true;
}

/** 지금 쓰는 버전을 대신할 새 버전이 기다리는 중인지 (첫 설치는 새 버전이 아니다) */
const hasNewVersion = (reg: ServiceWorkerRegistration): boolean =>
  reg.waiting !== null && reg.active !== null;

/** 새 버전이 준비됐다 — 켤 때면 바로 적용, 아니면 배너 */
function onReady(): void {
  const reg = registration;
  if (!reg || !hasNewVersion(reg) || reg.waiting === handledWorker || state === "applying") return;
  handledWorker = reg.waiting;
  if (decideReadyAction(launch, Date.now()) === "apply" && claimAutoReload()) {
    applyWaiting(reg);
    return;
  }
  setState("available");
}

/** 기다리는 새 버전에 넘겨받으라고 알리고, 넘겨받으면 새로고침한다 */
function applyWaiting(reg: ServiceWorkerRegistration): void {
  const waiting = reg.waiting;
  setState("applying");
  if (!waiting) {
    reloadNow();
    return;
  }
  // 이 화면을 SW가 맡고 있으면 controllerchange(startUpdates)에서, 아직 안 맡았으면(첫 방문) 활성화가 끝나면 새로고침
  waiting.addEventListener("statechange", () => {
    if (waiting.state === "activated") reloadNow();
  });
  setTimeout(reloadNow, UPDATE_TIMING.applyTimeoutMs);
  // ServiceWorker.postMessage에는 targetOrigin이 없다(이 규칙은 window.postMessage용)
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  waiting.postMessage(SKIP_WAITING_MESSAGE);
}

/** 배너의 "지금 바꾸기" */
export function applyUpdate(): void {
  if (registration) applyWaiting(registration);
  else reloadNow();
}

/** 배너의 "나중에" — 이 새 버전은 다시 알리지 않는다(다음에 켤 때 자동 적용) */
export function dismissUpdate(): void {
  if (state === "available") setState("idle");
}

/** 새 버전 확인 — 서버 welcome마다, 화면이 다시 보일 때(10분에 1번까지) */
export function checkForUpdate(): void {
  if (!registration || state === "applying") return;
  // 오프라인·서버 재시작 중 실패는 무시한다(다음 welcome에 다시 확인)
  registration.update().catch(() => undefined);
}

/** 설치 중인 새 버전이 기다림 상태(또는 실패)가 될 때까지, 최대 timeoutMs */
function waitForInstall(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (): void => {
      clearTimeout(timer);
      reg.removeEventListener("updatefound", onFound);
      resolve();
    };
    const track = (worker: ServiceWorker | null): void => {
      worker?.addEventListener("statechange", () => {
        if (worker.state !== "installing") done();
      });
    };
    const onFound = (): void => track(reg.installing);
    if (hasNewVersion(reg) || !reg.installing) {
      done();
      return;
    }
    reg.addEventListener("updatefound", onFound);
    track(reg.installing);
    timer = setTimeout(done, timeoutMs);
  });
}

async function findRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (registration) return registration;
  if (!swSupported()) return undefined;
  try {
    return await navigator.serviceWorker.getRegistration();
  } catch {
    return undefined;
  }
}

/**
 * 강제 적용 — 서버가 버전을 거절했거나(protocol_unsupported), 지연 로딩 파일을 못 찾았을 때(vite:preloadError).
 * 새 버전을 찾아(최대 15초) 있으면 적용하고, 없으면 그냥 새로고침한다. 되돌림 배포로 기기가 더 새 버전일 때도 이 길로 맞춘다.
 * 자동으로 불렸는데 1분 안에 이미 자동 새로고침을 했다면 새로고침하지 않는다(새 버전이 있으면 배너만).
 */
export async function forceUpdate(trigger: UpdateTrigger = "manual"): Promise<void> {
  if (forcing || reloading) return;
  forcing = true;
  try {
    const reg = await findRegistration();
    if (reg && !hasNewVersion(reg)) {
      await reg.update().catch(() => undefined);
      await waitForInstall(reg, UPDATE_TIMING.forceWaitMs);
    }
    const allowed = trigger === "manual" || claimAutoReload();
    if (reg && hasNewVersion(reg)) {
      if (allowed) {
        applyWaiting(reg);
      } else {
        handledWorker = reg.waiting;
        setState("available");
      }
      return;
    }
    if (allowed) reloadNow();
  } finally {
    forcing = false;
  }
}

/** 등록이 끝나면: 이후 새 버전 설치를 직접 지켜본다 */
function watch(reg: ServiceWorkerRegistration): void {
  registration = reg;
  // Workbox(workbox-window)는 밖에서 생긴 두 번째 새 버전부터는 알려 주지 않아서 직접 본다
  const track = (worker: ServiceWorker | null): void => {
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed") onReady();
    });
  };
  reg.addEventListener("updatefound", () => track(reg.installing));
  // 등록이 끝나기 전에 브라우저가 이미 받기 시작한 새 버전(화면을 열 때 브라우저도 확인한다)
  track(reg.installing);
  // 등록 전부터 기다리던 새 버전(지난번에 "나중에"를 눌렀거나 앱을 닫은 동안 받은 것)
  onReady();
}

/** 첫 터치·키 입력 — 그 뒤로는 쓰는 중으로 본다 */
function onInput(): void {
  if (!launch.inputSeen) launch = { ...launch, inputSeen: true };
}

/** 앱 시작 때 한 번 부른다(main.tsx) */
export function startUpdates(): void {
  if (started) return;
  started = true;

  window.addEventListener("pointerdown", onInput, { capture: true, passive: true });
  window.addEventListener("keydown", onInput, { capture: true, passive: true });

  if (document.visibilityState === "hidden") visibility = onHidden(visibility, Date.now());
  document.addEventListener("visibilitychange", () => {
    const now = Date.now();
    if (document.visibilityState === "hidden") {
      visibility = onHidden(visibility, now);
      return;
    }
    const outcome = onVisible(visibility, now);
    visibility = outcome.next;
    if (outcome.resumed) {
      // 오래 쉬었다 돌아옴 → 다시 "켤 때". 미뤄 둔 새 버전도 이번에는 바로 적용 대상이다
      launch = { startedAt: now, inputSeen: false };
      handledWorker = null;
      if (state === "available") setState("idle");
      onReady();
    }
    if (outcome.check) checkForUpdate();
  });

  // 배포 뒤 옛 화면이 없어진 지연 로딩 파일을 부르면 Vite가 이 이벤트를 낸다
  window.addEventListener("vite:preloadError", () => {
    void forceUpdate("auto");
  });

  if (!swSupported()) return;
  // 이 화면을 맡은 SW가 새 버전으로 바뀌면(이 탭이나 다른 탭에서 적용) 새로고침한다.
  // 옛 버전의 캐시는 새 SW가 지우므로 옛 화면을 계속 쓰면 지연 로딩이 깨진다
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) reloadNow();
  });
  registerSW({
    onNeedRefresh: onReady,
    // 플러그인이 직접 새로고침하지 않고 연결을 먼저 닫게 한다
    onNeedReload: reloadNow,
    onRegisteredSW: (_url, reg) => {
      if (reg) watch(reg);
    },
    onRegisterError: () => {
      // 등록 실패(앱 안 브라우저 등): SW 없이 계속 쓴다
    },
  });
}
