// 기기 ↔ 계정 설정 맞추기(요청) — 로그인한 뒤에만 불러온다(settings.ts의 동적 import). 규칙은 syncRules.ts(순수 함수).
// tRPC settings.get·settings.set(apps/server/src/trpc/settings.ts). 실패(서버에 닿지 못함, 로그인 끝남 등)는 조용히 넘긴다:
// "올릴 것" 표시가 남아 다음 로그인 때 다시 올린다.
// 올리기는 묶음마다 따로 부른다(ADR 2026-10-29-app-shell 5절). 같은 틱에 부르므로 httpBatchLink가 HTTP 요청 하나로 묶고,
// 서버는 부른 것마다 따로 답한다. 그래서 옛 서버가 모르는 칸(nav·home)을 400으로 막아도 화면·언어 묶음은 올라간다.
import { type ApiClient, api } from "../net/api.ts";
import { getLocale, setLocale } from "../paraglide/runtime.js";
import type { DeviceSettings } from "./storage.ts";
import {
  type SettingsPatch,
  afterUpload,
  canReloadForLocale,
  parseLocaleReloadMark,
  pendingPatch,
  planSignIn,
  splitByGroup,
} from "./syncRules.ts";

/** 기기 설정 읽기·쓰기 — settings.ts가 넘긴다. 이 파일이 settings.ts를 가져오지 않아 서로 가져오는 고리(순환 import)가 없다 */
export interface DeviceStore {
  get(): DeviceSettings;
  replace(next: DeviceSettings): void;
}

/** 계정 설정 요청에 쓰는 클라이언트. 기본은 앱 전체 클라이언트(api), 시험은 가짜 fetch를 넣은 클라이언트를 준다 */
export type SettingsClient = Pick<ApiClient, "settings">;

const REQUEST_TIMEOUT_MS = 10_000;
/** 계정 언어로 바꾸며 마지막으로 새로고침한 때(탭마다, 새로고침 뒤에도 남아야 해서 sessionStorage) */
const LOCALE_RELOAD_KEY = "terra.settings.localeReload";

/**
 * 묶음마다 따로 올리고(같은 틱 → 요청 하나), 성공한 묶음만 올린 값과 같으면 "올릴 것" 표시를 지운다.
 * 실패한 묶음(옛 서버의 400, 닿지 못함, 시간 넘음)은 표시가 남는다.
 */
async function upload(
  store: DeviceStore,
  patch: SettingsPatch,
  timeoutMs: number,
  client: SettingsClient,
): Promise<void> {
  const signal = AbortSignal.timeout(timeoutMs);
  await Promise.all(
    splitByGroup(patch).map(async (part) => {
      try {
        await client.settings.set.mutate(part, { signal });
      } catch {
        return;
      }
      store.replace(afterUpload(store.get(), part));
    }),
  );
}

/** 로그인한 동안 바꾼 값을 올린다 */
export async function uploadPending(
  store: DeviceStore,
  userId: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
  client: SettingsClient = api,
): Promise<void> {
  const patch = pendingPatch(store.get(), userId);
  if (patch !== null) await upload(store, patch, timeoutMs, client);
}

/** 같은 언어로 1분 안에 다시 새로고침하지 않는다. 저장소를 못 쓰면(Paraglide도 언어를 못 남긴다) 하지 않는다 */
function claimLocaleReload(locale: string): boolean {
  const now = Date.now();
  try {
    if (!canReloadForLocale(parseLocaleReloadMark(sessionStorage.getItem(LOCALE_RELOAD_KEY)), locale, now)) {
      return false;
    }
    sessionStorage.setItem(LOCALE_RELOAD_KEY, JSON.stringify({ locale, at: now }));
    return true;
  } catch {
    return false;
  }
}

/** 로그인할 때: 계정 값을 읽어 기기와 맞추고, 올릴 값을 올리고, 언어가 바뀌면 새로고침한다 */
export async function syncAtSignIn(
  store: DeviceStore,
  userId: string,
  client: SettingsClient = api,
): Promise<void> {
  let account: Awaited<ReturnType<SettingsClient["settings"]["get"]["query"]>>;
  try {
    account = await client.settings.get.query(undefined, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    return;
  }
  // 읽는 사이에 바꾼 값도 반영되게 지금 기기 값으로 계획한다
  const plan = planSignIn(store.get(), account, userId);
  store.replace(plan.device);
  if (plan.upload !== null) await upload(store, plan.upload, REQUEST_TIMEOUT_MS, client);
  const target = plan.device.locale;
  if (target !== null && target !== getLocale() && claimLocaleReload(target)) await setLocale(target);
}
