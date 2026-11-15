// 정부 판의 사람 줄(나라·지도자·시장) — 사용자 지적 2026-11-15 "유저이름 소유자나 시장같은것도 다르게 보이게해야한다. 전체적으로 너무 단일톤".
// 역할마다 왼쪽 띠·역할 이름표 색이 다르다(나라 = 초록, 지도자 = 금색 왕관 — 지도 이름표 leaderTags.css와 같은 꼴, 시장 = 파랑). 이름은 크고 굵게,
// 덧말(수도에 있음·만족도)은 작게. 색에만 기대지 않게 역할 이름표 글자를 늘 함께 둔다. dt·dd 틀(시험이 [data-part] dd를 읽는다)은 그대로다.
import type { ReactNode } from "react";

export type PersonRole = "nation" | "leader" | "mayor";

/** 지도자 왕관(지도 이름표와 같은 꼴) */
function Crown() {
  return (
    <svg className="gov-role-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 12h12l1-7-4 3-3-5-3 5-4-3z" />
    </svg>
  );
}

export function PersonFact(props: {
  readonly part: string;
  readonly role: PersonRole;
  readonly label: string;
  readonly name: string;
  /** 이름 앞에 둘 것(나라 마크 등) */
  readonly lead?: ReactNode;
  /** 덧말(작게). part = 시험·스타일이 고르는 이름(없으면 없음) */
  readonly notes?: readonly { readonly text: string; readonly part?: string }[];
  /** 값이 없다(—·없음): 이름을 흐리게 */
  readonly empty?: boolean;
  readonly unitId?: number | undefined;
}) {
  return (
    <div className="gov-person" data-part={props.part} data-role={props.role} data-unit={props.unitId}>
      <dt className="gov-role">
        {props.role === "leader" ? <Crown /> : null}
        {props.label}
      </dt>
      <dd className="gov-person-body">
        <span className="gov-person-name" data-empty={props.empty ? "true" : undefined}>
          {props.lead}
          {props.name}
        </span>
        {(props.notes ?? []).map((note) => (
          <span key={note.text} className={note.part ? `gov-person-note ${note.part}` : "gov-person-note"}>
            {note.text}
          </span>
        ))}
      </dd>
    </div>
  );
}
