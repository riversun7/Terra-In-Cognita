// 운영자 배율(기기 쪽) — 기획 D-560 1246~1248 "운영자 유닛은 그렇게 조정가능하나 기본은 그대로 동일하게", "운영자 모드 끄면 바로 해제".
// 운영 메뉴의 [운영자 속도] 칩(1×·10×·100×)이 고르고 operator_pace(프로토콜 36)로 서버에 알린다. 기본 1, 운영자 모드를 끄면 1로 돌아간다
// (서버도 전체 보기가 풀리면 1로 돌리고 빠른 표시를 바로 푼다 — 서버 권위). 기기에 기억하지 않는다(켤 때마다 보통 빠르기).
// 다시 맺은 연결·다시 구독은 지도 자료(mapFeed.ts operatorPace)가 구독 바로 뒤에 다시 보낸다.
import { type RefObject, useRef, useState } from "react";
import { type ServerLink, serverLink } from "../net/serverLink.ts";
import { defaultRequestId } from "./mapFeed.ts";

/** 고를 수 있는 배율(서버 상한 OPERATOR_PACE_MAX 안) */
export const OPERATOR_PACE_CHOICES = [1, 10, 100] as const;

/** 배율을 서버에 알린다(그 2차맵을 전체 보기로 구독 중이어야 한다 — 아니면 서버가 forbidden. 결과는 버린다) */
export function sendOperatorPace(mapKey: number, factor: number, link: ServerLink = serverLink): boolean {
  if (!link.isReady()) return false;
  return link.send({ t: "operator_pace", id: defaultRequestId(), mapKey, factor });
}

export interface OperatorPaceControl {
  /** 지금 배율(운영자 모드가 아니면 1) */
  readonly pace: number;
  readonly paceRef: RefObject<number>;
  readonly choose: (factor: number) => void;
  /** 운영자 모드를 끌 때 부른다: 1로(서버도 같은 때 1로 돌린다) */
  readonly reset: () => void;
}

/** 운영자 배율 상태. ref는 지도 자료가 다시 구독할 때 읽는다 */
export function useOperatorPace(operator: boolean, mapKeyRef: RefObject<number>): OperatorPaceControl {
  const [pace, setPace] = useState(1);
  const paceRef = useRef(1);
  const choose = (factor: number): void => {
    paceRef.current = factor;
    setPace(factor);
    sendOperatorPace(mapKeyRef.current, factor);
  };
  const reset = (): void => {
    paceRef.current = 1;
    setPace(1);
  };
  return { pace: operator ? pace : 1, paceRef, choose, reset };
}
