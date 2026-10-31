// 홈 설정(user_settings.home: 템플릿·카드) 읽기와 저장 — 홈 조각이 쓰는 곳은 이 두 함수뿐이다(settings/settings.ts).
// 값은 늘 모양을 모르는 JSON으로 다룬다. 읽기는 그리는 곳이 parseHome(값, 역할)로, 쓰기는 mergeHome(원래 값, 바꾼 칸)으로 한다
// (더 새 버전이 넣은 칸과 모르는 카드가 남는다, ADR 2026-10-29-app-shell 5절).
import { type HomePatch, mergeHome } from "@terra/shared/dashboard";
import { chooseHome, getSettingsSnapshot, useSettings } from "../settings/settings.ts";

/** 저장된 home 값(모양을 모르는 JSON) */
export function useStoredHome(): unknown {
  return useSettings().device.home;
}

/**
 * 바꾼 칸만 원래 값에 덮어 저장한다(바꿀 때마다 바로, ADR 37 6절: 기기에 저장 → 로그인했으면 계정에 올림).
 * 원래 값은 늘 지금 값을 다시 읽는다(빠르게 잇달아 바꿔도 앞 바꿈을 잃지 않게).
 * 저장하지 못했으면 false다(4KB 넘음·JSON으로 못 바꿈·계정에 저장할 수 없는 글자 — 편집 시트가 바꾸지 않고 알린다)
 */
export function patchHome(patch: HomePatch): boolean {
  return chooseHome(mergeHome(getSettingsSnapshot().device.home, patch));
}
