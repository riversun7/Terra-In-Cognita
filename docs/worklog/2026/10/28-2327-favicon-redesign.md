# 파비콘과 앱 아이콘 새로 그리기 (정원 새싹·행성·궤도 정거장)

- 일시: 2026-10-28 23:27 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-10-28-pwa-and-browser-baseline.md`, `2026-10-28-design-system.md`(후보 A 새싹 장난감), 기획 GDD v4 D-052·D-063·D-070·D-073, 이전 기록 `28-2043-favicon.md`, `28-2040-pwa.md`

## 한 일
- 사용자 요청으로 파비콘과 설치형 웹앱(PWA) 아이콘을 새로 그렸다.
  - 그림 구성: 밤하늘 바탕과 대기 광채 위에 입체감 있는 푸른 행성(바다·초록 대륙·구면 반사광), 북극에서 피어나는 두 잎 새싹(D-073 '정원'과 디자인 시스템 후보 A '새싹 장난감'), 황금빛 궤도 고리, 하얗고 매끈한 본체에 청록빛 코어가 빛나는 궤도 정거장(D-052, D-070 ③).
  - 이전 임시 아이콘의 결함 수정: 반원 두 개를 `stroke-linecap="round"`로 이어 붙여 고리 좌우 끝단에 반투명 겹침 자국이 생기던 문제를 고쳤다. 고리를 닫힌 타원 하나로 그리고 행성 상단 반구만 `evenodd` 클리핑(`#ringVisibleClip`)으로 빼서 좌우 끝단 이음매가 전혀 없다.
- `apps/game/public/favicon.svg`에서 모든 아이콘 파일을 다시 뽑았다(Verified: 헤드리스 Chrome 캔버스 렌더링, `node scripts/check-pwa.mjs` 통과).
  - `favicon.ico`: 16·32·48px PNG 3종 묶음.
  - `pwa-192x192.png`, `pwa-512x512.png`: 둥근 사각형 아이콘(바깥 투명).
  - `apple-touch-icon-180x180.png`: 전체 사각형 우주 배경에 가득 채운 180×180 PNG.
  - `maskable-icon-512x512.png`: 전체 사각형 우주 배경 가운데 80% 안전 영역에 맞춘 512×512 PNG.
- 어두운 탭(`#1e222b`)과 밝은 파스텔 탭(`#dff2fb`) 배경에서 16·32·48·96px 크기로 렌더링해 새싹·행성·고리·정거장 윤곽이 또렷이 보이는지 확인했다(Verified).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/public/favicon.svg` | 새 파비콘 벡터 원본 |
| `apps/game/public/favicon.ico` | 16·32·48px 묶음 파비콘 재생성 |
| `apps/game/public/pwa-192x192.png` | 새 원본에서 192×192 앱 아이콘 재생성 |
| `apps/game/public/pwa-512x512.png` | 새 원본에서 512×512 앱 아이콘 재생성 |
| `apps/game/public/apple-touch-icon-180x180.png` | 새 원본에서 iOS 홈 화면용 180×180 아이콘 재생성 |
| `apps/game/public/maskable-icon-512x512.png` | 새 원본에서 안드로이드 안전 영역(80%)용 512×512 아이콘 재생성 |

## 함께 바꿔야 하는 파일
- 아이콘 그림을 다시 고칠 때는 `apps/game/public/favicon.svg`를 수정한 뒤 `favicon.ico`(16·32·48px)와 PNG 4종(`pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon-180x180.png`, `maskable-icon-512x512.png`)을 함께 다시 만든다.

## 건드리지 말 것
- `apps/game/index.html`과 `apps/game/vite.config.ts`의 아이콘 경로 및 크기 선언(`scripts/check-pwa.mjs`가 검사한다).

## 미검증·TODO·알려진 문제
- 실제 아이폰·안드로이드 기기 홈 화면에 추가했을 때의 마스크 모양은 기기에서 직접 확인하지 않았다(Unknown).

## 사용자 결정 대기
- 없음.
