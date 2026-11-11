// 유닛 추천 표 받기(tRPC units.guide) — 1차 생산 여섯 가지의 스탯 짝·전투 클래스 표·분류 문턱(실효 팩 + 세계 덮어쓰기).
// docs/adr/2026-11-11-production-six.md. 화면 여럿(유닛 상세·사이보그·구인 카드·2차맵 내 유닛)이 같은 표를 쓰므로 한 번 받은 것을 5분 동안
// 같이 쓴다(편집기에서 고친 값은 그 뒤 다시 받는다). 실패하면 추천 칸을 보이지 않는다(값 없음 = null). 지연 조각 안에서만 쓴다.
import type { UnitGuideResponse } from "@terra/shared/unitGuide";
import { useEffect, useState } from "react";
import { api } from "../net/api.ts";

/** 받은 표를 다시 쓰는 시간 */
const GUIDE_STALE_MS = 5 * 60_000;

let cached: { readonly at: number; readonly promise: Promise<UnitGuideResponse | null> } | null = null;

function loadGuide(): Promise<UnitGuideResponse | null> {
  const now = Date.now();
  if (cached && now - cached.at < GUIDE_STALE_MS) return cached.promise;
  const promise = api.units.guide.query().then(
    (guide) => guide,
    () => {
      // 실패는 붙잡아 두지 않는다(다음 화면이 다시 묻는다)
      cached = null;
      return null;
    },
  );
  cached = { at: now, promise };
  return promise;
}

/** 시험용: 붙잡아 둔 표를 버린다 */
export function resetUnitGuideCache(): void {
  cached = null;
}

/** 추천 표(받기 전·실패 = null) */
export function useUnitGuide(): UnitGuideResponse | null {
  const [guide, setGuide] = useState<UnitGuideResponse | null>(null);
  useEffect(() => {
    let active = true;
    void loadGuide().then((value) => {
      if (active) setGuide(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return guide;
}
