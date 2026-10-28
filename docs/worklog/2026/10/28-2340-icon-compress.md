# 새 앱 아이콘 PNG를 손실 없이 다시 압축 (736KB → 286KB)

- 일시: 2026-10-28 23:40 (KST)
- 작업 도구: Claude Code
- 관련: 작업 기록 `28-2327-favicon-redesign.md`(아이콘 새로 그림, 다른 도구), ADR `2026-10-28-pwa-and-browser-baseline.md`(아이콘은 앱 껍데기로 미리 캐시), PLAN 9.8(아이콘 예외는 "파일마다 수십 KB 이하")

## 한 일
- 새로 그린 PNG 4개가 커서(512px 두 개가 각 300KB 넘음) 서비스 워커가 처음 설치할 때 받는 양이 크게 늘었다. 그림은 그대로 두고 PNG만 다시 압축했다(Pillow 12.3.0, `optimize=True`, `compress_level=9`).
  - 압축 전후 픽셀이 바이트 단위로 같다(Verified: 두 파일의 RGBA 바이트 비교).
  - `apple-touch-icon-180x180.png` 51,327 → 25,236바이트, `maskable-icon-512x512.png` 303,421 → 93,301, `pwa-192x192.png` 59,630 → 32,817, `pwa-512x512.png` 322,389 → 135,474.
- 빌드 결과로 확인(Verified): `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs` 통과. 미리 캐시 13개 파일의 실제 합은 696,417바이트(약 680KiB). 다시 압축하지 않았다면 약 1,120KiB였다.
  - 참고: 플러그인이 출력하는 "precache … 384.17 KiB"에는 아이콘·manifest가 빠져 있다. 실제 합은 `sw.js`의 목록으로 잰다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/public/{apple-touch-icon-180x180,maskable-icon-512x512,pwa-192x192,pwa-512x512}.png` | 같은 그림, 손실 없는 재압축 |

## 함께 바꿔야 하는 파일
- 아이콘을 다시 그리면(`favicon.svg` 원본) PNG 4개를 만든 뒤 같은 방법으로 다시 압축한다.

## 건드리지 말 것
- 그림 자체(다른 도구가 사용자 요청으로 그림). `index.html`·`vite.config.ts`의 아이콘 경로·크기.

## 미검증·TODO·알려진 문제
- 512px 아이콘은 그래도 93KB·135KB로 PLAN 9.8의 "파일마다 수십 KB 이하"보다 크다. 그라데이션이 많은 그림이라서다. 색 수를 256개로 줄이면 각 20KB 안팎이 되지만 그림이 조금 달라진다(평균 채널 차이 약 2~5, 그라데이션 줄무늬 위험). 사용자 결정 대기.

## 사용자 결정 대기
- 512px 아이콘을 색 수를 줄여 더 작게 할지, 지금 크기로 두고 PLAN 9.8의 기준을 고칠지.
