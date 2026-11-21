# 알박기 건물의 도시 칸을 영토 지방 도시로 채우지 않기

- 일시: 2026-11-21 15:49 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 npc-claim-3(`21-1500-npc-claim-3.md` "발견"), ADR `2026-11-01-npc-brain-r5.md`, D-572(알박기 우선)·D-568(영토 지방)

## 한 일
- 원인(Verified, 코드 읽기): 건물 서비스 `fillCity`는 시설 줄 도시가 비어 있으면 칸 판정(`buildingPlace` → `cityAt` — 1차맵 영토 지방이 먼저)으로 도시를 채운다. 그런데 "알박기 중"은 시설 줄 도시가 비어 있는(null) 행정 건물이다(`ruins/landClaim.ts`). 짓기 명령은 다른 세력 영토 안 빈 2차맵에도 알박기를 허용하므로(D-572), 그 자리에서는 영토 지방이 남의 도시를 돌려준다.
  - `fillCity`를 부르는 곳: 시설 틱(모든 시설 줄, 매 틱), `myFacility`(알박기 고르기 바꾸기·면적 모듈·수리 등), `shopFacility`, 창고 옮기기.
  - 그래서 짓는 중 플레이어 알박기 건물이 틱마다 남의 도시로 채워질 수 있었다 → 고르기 바꾸기가 `not_buildable`, 다 지어도 `foundPending`이 건너뜀(도시가 서지 않고 그 건물은 남의 도시 시설이 됨). NPC 알박기는 줄기 npc-claim-3이 `npcJob`에서만 채우기를 꺼 두어 틱 경로는 같은 위험이 있었다.
- 고침: 판정을 `places.ts`의 `cityToFill`/`fillCityOf` 하나로 모았다. 도시가 이미 있거나 행정(government) 단계 시설이면 채우지 않는다(행정 건물은 폐허 되살리기면 지을 때 폐허 도시를 받고, 도시 안 행정 건물도 지을 때 도시를 받으므로 비어 있으면 알박기뿐이다). `fillCity`는 이 함수를 쓰고, `myFacility`의 `fill` 매개변수(npc-claim-3이 더한 것)는 필요 없어져 지웠다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/places.ts` | `cityToFill`(시설 줄에 채울 도시)·`fillCityOf`(판정) — 행정 건물·도시 있음이면 null |
| `apps/server/src/facilities/service.ts` | `fillCity`가 `cityToFill`을 씀, `myFacility`의 `fill` 매개변수 지움(`npcJob` 호출도). 999줄 그대로 |
| `apps/server/src/facilities/places.test.ts` | 새 시험 4개: 일반 시설은 채움, 도시 있으면 그대로(칸 판정 안 함), 도시 없는 행정 건물은 영토 지방이 있어도 안 채움, 칸 판정이 모르면 안 채움 |

## 함께 바꿔야 하는 파일
- "알박기 중" 정의(`ruins/landClaim.ts` 머리 주석: 시설 줄 도시가 비어 있는 행정 건물)를 바꾸면 `fillCityOf`도 함께 바꾼다.

## 건드리지 말 것
- `facilities/service.ts`는 999줄이다. 늘리면 1,000줄 검사가 실패한다.

## 미검증·TODO·알려진 문제
- 실제 영토 지방이 있는 DB 세계에서 플레이어 알박기를 끝까지 지어 보는 DB 시험은 새로 쓰지 않았다(영토 지도를 세우는 준비가 크다). 판정 함수 단위 시험과 기존 시설·폐허·알박기 DB 시험으로 확인했다.
- 옛 줄 중 이미 남의 도시로 채워진 알박기 건물이 NAS에 있는지는 보지 않았다(Unknown). 있으면 그 건물은 그 도시 시설로 남는다.

## 사용자 결정 대기
- 없음
