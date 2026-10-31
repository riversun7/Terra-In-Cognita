// [제안 적용] — 항성계 화면이 제안한 적도·극 기온을 보관함 행성의 작업 사본(이 기기 localStorage, 행성 편집기와 같은 사본)에 쓴다.
// ADR 2026-10-31-star-system-editor. 서버의 행성은 바꾸지 않는다: 행성 편집기에서 열어 보고 [저장]해야 서버에 간다.
// - 사본이 이미 있으면 그 위에 쓴다(고치던 값과 시작한 판을 지킨다: 판 충돌 확인이 그대로 돈다). 없으면 서버 정의에서 시작한다.
// - 극 기온 ≤ 적도 기온 규칙(editorModel.withSetting이 맞춘다) 때문에 적도를 올릴 때는 적도부터, 내릴 때는 극부터 쓴다.
// - 마지막으로 연 행성도 바꾼다: 행성 편집기를 열면 이 행성부터 보인다.
import { NORMAL_PRESETS, type PlanetSettings, resolvePlanetSettings } from "@terra/shared";
import { type DraftEntry, entrySettings, withSetting } from "../planet/editorModel.ts";
import type { WorkingCopy, WorkingCopyStore } from "../planet/workingCopy.ts";

/** 온도 제안의 지구 기준: 보통 프리셋 값(적도·극 기온) */
export const EARTH_REFERENCE: PlanetSettings = resolvePlanetSettings(NORMAL_PRESETS);

export interface Temperatures {
  readonly equatorTemperatureC: number;
  readonly poleTemperatureC: number;
}

/** 항목에 적도·극 기온을 쓴다(극 ≤ 적도가 중간에 깨지지 않는 차례로) */
export function withTemperatures(entry: DraftEntry, target: Temperatures): DraftEntry {
  const current = entrySettings(entry);
  if (target.equatorTemperatureC >= current.equatorTemperatureC) {
    const raised = withSetting(entry, "equatorTemperatureC", target.equatorTemperatureC);
    return withSetting(raised, "poleTemperatureC", target.poleTemperatureC);
  }
  const lowered = withSetting(entry, "poleTemperatureC", target.poleTemperatureC);
  return withSetting(lowered, "equatorTemperatureC", target.equatorTemperatureC);
}

/** 보관함 행성(서버 판·정의) */
export interface SuggestionTarget {
  readonly id: string;
  readonly revision: number;
  readonly definition: DraftEntry;
}

/** 작업 사본에 제안을 쓰고 마지막으로 연 행성으로 둔다. 쓴 사본을 돌려준다 */
export function applySuggestion(
  store: WorkingCopyStore,
  planet: SuggestionTarget,
  target: Temperatures,
): WorkingCopy {
  const existing = store.read(planet.id);
  const base: WorkingCopy = existing ?? {
    key: planet.id,
    fromRevision: planet.revision,
    entry: planet.definition,
  };
  const copy: WorkingCopy = { ...base, entry: withTemperatures(base.entry, target) };
  store.write(copy);
  store.setLastPlanet(planet.id);
  return copy;
}
