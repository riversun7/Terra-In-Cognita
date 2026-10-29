// 마감 시각의 기계용 글자(<time dateTime>) — 서버 시각(UTC ms)을 기기 시계로 옮긴다. 보이는 글자는 W3 문구(남은 시간)다(itemView.ts).
import { serverLink } from "../net/serverLink.ts";

/** 서버 시계 = 기기 시계 + 차이 → 기기 시각 = 서버 시각 − 차이 */
export function deadlineIso(deadlineAt: number): string {
  return new Date(deadlineAt - serverLink.clockOffsetMs()).toISOString();
}
