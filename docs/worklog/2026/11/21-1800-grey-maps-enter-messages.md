# 회색 2차맵(지형 404)·건물 들어가기 자리·상태 메시지 정리

- 일시: 2026-11-21 18:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-seamless-second-map.md`(이웃 지형), `2026-10-31-second-map-from-planet.md` 6·8절(고정본), `2026-11-07-gather-objects.md` 5절(건물 들어가기), `2026-11-07-unit-control.md`(명령 안내)

## 한 일

사용자 지적(2026-11-21, NAS 휴대폰 사진):

- "2차맵 이동시 일부 2차맵 구간이 뜨지 않는 심각한 오류. 로드되지 않아 이동선택자체가 되지 않는다. 그러나 … 다른 npc들은 정상 로드되어 보임"
- "바로 옆에 있는 건물 진입을 눌렀는데 빙 돌아서 이상한곳으로 가는 현상"
- "건물 이름이 뜨지 않는다"
- "조센징, 내사이보그, 유닛 2892 제각각 써있는데 다 같은거냐? … 메세지들이 지저분하게 떠있고 중복이 많다"

### 1. 회색 2차맵

**원인**(Verified: 코드. NAS 기록은 보지 않음 — 그 2차맵이 고정본인지는 Assumed):

- 기기는 이웃 지형 주소를 지금 2차맵 판 표지로 만든다(`neighbourTerrainUrl`).
- 고정본 2차맵(`second_map_pins`, 처음 손댄 때의 표지)과 생성기 2차맵은 표지가 다를 수 있다. 생성기·소품 규칙이 바뀌면 고정본은 옛 표지 그대로다.
- 서버는 표지가 다르면 404였고, 기기는 실패한 이웃을 다시 묻지 않았다. 그 2차맵은 땅이 안 그려진 채 회색으로 남고, 이웃 흐름(유닛)만 보였다.

**고침**:

- 서버 `terrainRoute.ts`: 표지가 있고 그 2차맵 지금 표지와 다르면 지금 표지 주소로 넘긴다(307, `cache-control: no-store`). 표지가 없으면 그대로 404.
- 기기 `secondMapNeighbourLoader.ts`: 못 받은 이웃은 8초 뒤 다시 바랄 수 있다(3번까지).

### 2. 건물 들어가기 자리

전에는 건물 기준 칸(왼쪽 위 모서리)에서 가장 가까운 설 칸을 골랐다. 그래서 유닛이 건물 반대편에 있어도 그 모서리로 돌아갔다.

`stand.ts` `standNearRect`로 바꿨다. 건물 직사각형(회전 반영)과 유닛 몸 사이가 맞닿는 고리부터 보고, 고리 안에서는 유닛에 가까운 칸을 고른다.

### 3. 건물 이름·메시지

- **건물 이름**:
  - 들어가러 가는 줄의 단계 글에 건물 이름을 붙였다: "○○에 들어가는 중"(머리 위 이름표·아래 채집 줄).
  - 건물 판이 닫혀 있어도 들어가러 가는 건물 위에 이름표를 띄운다.
- **유닛 이름 통일**: 명령 안내(이동·멈추기·옆 2차맵 보냄)가 "유닛 2892" 대신 아래 안내 줄과 같은 유닛 이름을 쓴다. 메시지 변수 `{id}` → `{unit}`(ko·en).
- **중복 줄**:
  - 채집 줄이 고른 유닛의 것이면 이름을 빼고 할 일만 쓴다(이름은 안내 줄에 있다).
  - "보냈습니다"는 띄우지 않는다(채집 줄이 바로 알린다). 실패 까닭만 잠깐 띄운다(기존 6초 지움).

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/world/terrainRoute.ts`(+ `appWorld.test.ts`·`secondMapTerrain.test.ts` 옛 404 기대를 307로) | 표지 다름 → 지금 표지로 307 |
| `apps/game/src/map/secondMapNeighbourLoader.ts`(+ 시험) | 이웃 지형 다시 받기 |
| `apps/server/src/gather/stand.ts`(+ `stand.test.ts` 새)·`service.ts` | 건물 둘레 설 칸 |
| `apps/game/src/map/gather/gatherData.ts`·`gatherOverlay.ts`·`GatherPanel.tsx`·`SecondaryMapScreen.tsx`·`commandNotice.ts` | 건물 이름·유닛 이름·중복 줄 |
| `apps/game/messages/{ko,en}.json` | `gather_phase_entering_named`, 명령 안내 `{unit}` |
| `e2e/unit-control.spec.ts` | 명령 안내 문장을 유닛 이름(무엇이든)으로 비교 |

## 함께 바꿔야 하는 파일

- 지형 판 표지 규칙(`mapTerrain.ts` `terrainVersionToken`·고정본)을 바꾸면 `terrainRoute.ts`의 307 규칙을 같이 본다.
- 명령 안내 메시지에 새 문장을 더하면 `{unit}`(유닛 이름)을 쓴다.

## 건드리지 말 것

- 고정본의 판 표지를 바꾸지 않는다(처음 손댄 때의 지형이 고정본이다 — 사용자 결정 U4).

## 미검증·TODO·알려진 문제

- NAS의 회색 2차맵이 정말 고정본이었는지는 보지 않았다(Assumed). 다른 원인이면 다시 볼 일이다.
- 강 폭(사용자 요청 "강 폭을 더 다양하게", "1차맵은 두꺼워 보이나 강줄기는 매우 가늘다")은 이 묶음에 없다. 깊은 강은 걸어서 못 건너 폭을 넓히면 길이 막혀, 사용자에게 묻는다.
- 휴대폰에서 보지 않았다(미검증).

## 검사
- 단위 시험(Verified):
  - 서버 지형 길(`appWorld.test.ts` 8개 — 307 넘김·넘긴 주소 200).
  - 건물 둘레 설 칸(`stand.test.ts` 새 3개)·채집 서비스.
  - 이웃 받기 다시 해 보기(`secondMapNeighbourLoader.test.ts` 6개).
  - 게임 2차맵·서버 채집 403개.
  - 타입 검사·oxlint 통과.
- 화면 시험(Playwright, 헤드리스):
  - 통과: `building-inside`, `seamless` 6개(이웃 안개·옆 2차맵 땅 누르기·걸어서 넘기·미리 띄우기. 1개는 원래 건너뜀).
  - 실패: `unit-control`·`gather`의 여러 시험이 이번 변경과 무관한 까닭으로 실패한다(Verified: 실패 내용).
    - ① `smallTapTargets`: 단추 높이 38px < 44px. main의 홈·쉘 디자인 개편(`65ca9594`·`6cec509f`·`db1e4045`, 2026-11-19~20)이 작은 단추 크기를 바꿨다.
    - ② 남의 유닛 작은 창에 가문 줄(`peek-npc-house`)이 더해져 `.map-peek-line`이 둘이다.
    - 그래서 명령 안내 문장(유닛 이름) 확인 줄까지 시험이 닿지 못했다 — 화면 시험으로는 미검증.
- 합치기 전(Verified): `pnpm check` 통과(시험 5,655개 통과·383개 건너뜀). 처음엔 `secondMapTerrain.test.ts`가 옛 404 기대로 실패해 307로 고쳤다. 빌드·`check-pwa`·`check:bundle`은 CI 이미지 빌드(Dockerfile)가 돌린다.
