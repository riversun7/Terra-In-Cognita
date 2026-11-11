# 옆 2차맵 미리 열기 합치기

- 일시: 2026-11-12 05:20 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `12-0330-edge-preopen`, ADR `2026-11-08-seamless-second-map.md` "바뀜 (2026-11-12)"

## 한 일
- edge-preopen을 통합 가지(main 1c722fe 위)에 합쳤다. 팩 core@73(줄기 71 + 셋째 묶음 72를 접음). `world.ts` 992줄·`secondMap.ts` 993줄(상한 1,000 아래).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | core@73 |

## 함께 바꿔야 하는 파일
- 없음.

## 건드리지 말 것
- 없음.

## 미검증·TODO·알려진 문제
- 검사(통합 가지, Verified): `pnpm check` 632 파일·4,870 시험, 빌드·`check-pwa`·`check:bundle`(108,897 B) 통과. 화면 시험 seamless·play-map·unit-control·world-layout 58 통과·1 실패·1 건너뜀 → 실패한 `unit-control` "운영자 모드도 남의 유닛…"(땅 누르기에서 이동이 안 보냄)은 그 시험만 두 번 다시 돌려 2/2 통과(흔들림으로 봄, Assumed).
- `world.ts`·`secondMap.ts`가 1,000줄에 가깝다. 다음 줄기가 더 넣으면 나눠야 한다.
- 가장자리에 세워 둔 유닛은 플레이어가 나가도 옆 맵을 열어 둔다(상한 32만 막는다). 대각선 이웃은 미리 열지 않는다.

## 사용자 결정 대기
- 없음.
