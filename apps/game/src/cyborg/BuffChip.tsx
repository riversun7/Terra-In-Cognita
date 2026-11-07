// 버프 몫 표 — 사이보그 판의 스탯 줄(핵심 사양·상세 전투 스펙)이 기본값 옆에 걸린 효과의 몫을 다른 색으로 붙인다
// (질문 354 → 기획 D-515 "기본값과 버프를 나눠 보인다", D-448 "스탯 UI를 더 잘 보이게"). 값은 서버가 보낸 몫 그대로다.
// 색은 상태색(좋아짐 = --color-success, 나빠짐 = --color-danger)의 알약 — 스탯 색이 색상환을 다 쓰므로 모양(알약·빗금)으로도 가른다.
// 읽는 사람에게는 "버프"·"디버프"를 붙여 읽힌다(색만으로 뜻을 전하지 않는다).
import { m } from "../paraglide/messages.js";
import "./buffChip.css";

export function BuffChip({ text, tone }: { text: string; tone: "up" | "down" }) {
  return (
    <span className="buff-chip" data-tone={tone}>
      <span className="visually-hidden">{tone === "up" ? m.cyborg_buff_up() : m.cyborg_buff_down()} </span>
      {text}
    </span>
  );
}
