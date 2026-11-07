// 생명 수치 조회(tRPC vitals.list) — 기획 D-512. 로그인한 본인의 사이보그와 보유 유닛의 HP·아머·쉴드를 응답 시각까지 셈해 보낸다.
// 기기는 받은 값에서 @terra/shared vitalsAt으로 그 사이 값을 셈해 보여 준다(서버에 다시 묻지 않는다).
import type { VitalsListResponse } from "@terra/shared/vitals";
import type { Viewer } from "../trpc/context.ts";
import type { WorldVitals } from "./world.ts";

export interface VitalsReadServices {
  list(viewer: Viewer, nowMs: number): VitalsListResponse;
}

/** 월드가 없거나 준비 전이면 늘 빈 목록 */
export const NO_VITALS: VitalsReadServices = {
  list: (_viewer, nowMs) => ({ hasOwner: false, units: [], generatedAt: nowMs }),
};

export function createVitalsReads(access: () => WorldVitals | undefined): VitalsReadServices {
  return {
    list(viewer, nowMs) {
      const vitals = access();
      return vitals ? vitals.list(viewer.id, nowMs) : NO_VITALS.list(viewer, nowMs);
    },
  };
}
