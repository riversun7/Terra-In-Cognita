# 2차맵 계획: 고른 유닛 고정 카메라·근처 목록 탭·로딩 없는 이동(이웃 안개)

- 일시: 2026-11-08 20:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-seamless-second-map.md`(제안), 가지 `claude/kind-turing-2g2t45`(main `27f35c6`에서)

## 한 일
- 사용자 지적 "문제1(이웃 2차맵 안개 없음)·개선1(근처 자원·건물·유닛 탭 목록, 고른 탭 표시만)"을 조사하고 사용자에게 네 가지를 물었다.
- 답에 따라 계획 ADR(제안)을 썼다: WP-1 자유 시점 없애기(늘 유닛 고름, 기본 사이보그) → WP-2 근처 탭 판 → WP-3 로딩 없는 2차맵 이동(이웃 미리 구독 → 이웃 안개 비트).
- 코드는 바꾸지 않았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-11-08-seamless-second-map.md`(새) | 계획·지금 모습(Verified: 코드)·확인 대기 Q1~Q5 |
| `docs/worklog/2026/11/08-2010-seamless-second-map-plan.md`(새) | 이 기록 |
| `docs/WORKLOG.md` | 목차 다시 만듦(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- ADR이 확정되면 `docs/adr/2026-11-08-map-input.md` 상태에 "일부 대체됨(2절 끌기로 둘러보기)"을 단다.

## 건드리지 말 것
- 서버 시야 규칙(`apps/server/src/world/vision.ts` `canView`)·구독 상한(`gateway.ts` `MAX_MAPS_PER_SOCKET = 4`)은 계획이 그대로 쓴다고 가정한다.

## 미검증·TODO·알려진 문제
- 사용자가 말한 "다른 세션 9. 프로젝트 질문" 원문은 저장소에 없다(Unknown). D-139·ADR second-map-from-planet 메모를 바탕으로 썼다.
- 계획 속 바꿀 곳·서버 바꿈 없음은 코드 읽기로 추정했다(Assumed). 측정은 하지 않았다.

## 사용자 결정 대기
- ADR 확인 대기 Q1~Q5(한 손가락 끌기, 운영자, 내 유닛 없는 2차맵, 유닛 탭 줄 수, 넘을 때 흐리기).
