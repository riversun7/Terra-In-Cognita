# 1차맵 레이어: 고도·자원 분포·영토

- 일시: 2026-11-12 17:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-planet-view.md` "바뀜 (2026-11-12): 고도·자원 분포·영토 레이어", 질문 `docs/questions/2026-11-12-planet-layers.md`(1166~1172), 가지 `work/planet-layers`(기준 main `9e30065`)
- 사용자 요청(2026-11-12, 원문): "1차맵 레이아웃선택에 지형,기후만 있는데. 고도, 자원별 분포, 세력영토 레이아웃도 추가해달라."

## 한 일
- 1차맵 레이어를 다섯으로 늘렸다: 지형·기후(그대로)·고도·자원(분포)·영토. 레이어 버튼 다섯(좁으면 줄바꿈) + 레이어마다 범례.
- 고도: 타일에 이미 있는 꼭짓점 높이로 칠한다(타일 형식·생성기 그대로). 땅 = 가장 높은 땅에 대한 몫의 색 띠, 바다 = 수심 띠, 호수 = 청록. 범례에 m 값.
- 자원 분포: 원자재 여섯 가운데 하나를 고르면 서버가 셈한 칸 몫 지도를 받아 칠한다. 몫 = 서버 NPC 경제와 같은 함수(`cellSharesPm` "supply"·`highOrePm`). 광석은 산지(높은 티어)를 보라로 더 칠한다.
- 영토: 바탕을 흐리게 하고 도시 덧그림(아는 도시의 영향권·아는 영토 껍질)을 국가 색으로 진하게, 경계를 굵게. 수도 별 표시(모든 레이어). 영토 레이어에서 땅을 누르면 "영토: 국가 · 도시 지방" / "영토 밖" 줄.

### 자료 길 선택(자원 분포) — 서버에서 셈해 지도 하나로
- 기기에서 타일 값으로 셈하지 않았다: 1차맵 타일에는 강수(mm)·칸 고도가 없어(습도·꼭짓점 높이만) 작물·축산물·약초 문턱과 광석 몫을 서버와 같게 낼 수 없다. 공식을 옮겨 적는 것도 금지(다른 줄기 `ore-2`가 몫 규칙을 바꾸는 중).
- 타일마다 작은 층을 굽지도 않았다: 몫은 설정 칸이 바뀌면 달라져 불변 타일(1년 캐시)에 넣을 수 없고, 타일 파이프라인에 두 번째 받기 줄을 더해야 한다.
- 그래서 원자재 하나의 행성 전체 격자(면 레벨 min(F, 9), F9 = 157만 칸, 바이트 몫)를 새 HTTP 경로로 한 번에 준다(이진이라 tRPC가 아님, 조회만). 기기는 그것을 면 6장 배열 텍스처 하나로 올리고 모든 타일 재질이 같이 읽는다 → 타일 파이프라인·타일 메모리 상한은 그대로.
- 모바일 메모리: 고른 원자재 하나만(텍스처 약 2MB, 광석 4MB, 밉맵 포함), 다른 레이어로 가면 버린다. 받는 양: gzip 35~225KB(Verified: F9 시험 행성 값으로 잼 — 광석 225,391B, 목재 43,927B, 약초 43,911B, 작물 34,917B, 축산물 34,918B, 어류 38,803B). 첫 화면 묶음: 1차맵 지연 조각에만 들어간다(`check:bundle` 결과는 아래).
- 서버 셈: 678ms(F9, 개발 컨테이너), 8,192칸마다 이벤트 루프에 양보(16,384칸일 때 가장 긴 조각 51ms — 첫 조각, 그래서 줄였다). 설정 칸이 바뀌면 다음 요청에서 다시 셈한다. ETag로 304.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/layerColors.ts`(새) | 고도·자원·영토 색 한곳(셰이더 GLSL + 범례 그라데이션) |
| `packages/engine/src/planet/resourceLayer.ts`(새) | 자원 분포 지도 → 배열 텍스처(바꾸면 옛 텍스처 버림), 모양 검사 |
| `packages/engine/src/planet/planetMaterials.ts` | 레이어 번호 5개, 고도(`vHeight`)·흐린 바탕·자원 덧칠 셰이더, 공유 uniform(고도 꼭대기·자원 텍스처) |
| `packages/engine/src/planet/planetTypes.ts`·`planetView.ts`·`planetEngine.ts`·`inertPlanetEngine.ts`·`index.ts` | `PlanetLayer` 다섯·`PLANET_LAYERS`·`PlanetResourceMap`·`setResourceMap`·`stats().resourceMapBytes`, 프레임마다 고도 꼭대기 |
| `packages/engine/src/planet/sky.ts` | 지형이 아닌 자료 레이어 모두 낮밤을 옅게(기후와 같은 배율) |
| `packages/protocol/src/planetResource.ts`(새)·`index.ts`·`package.json` | 자원 분포 지도 이진 형식 "TCPR"·경로·진입점 `@terra/protocol/planetResource` |
| `packages/planet/src/secondMap/planetValues.ts`·`index.ts` | `planetValuesReader`(머리를 한 번만 풀고 칸을 여럿 읽기) — `readPlanetValuesCell`은 이것을 쓴다 |
| `apps/server/src/planet/resourceMap.ts`(새)·`routes.ts`·`app.ts` | 공개 행성 몫 셈·gzip 캐시·ETag, 경로 `GET /api/planets/:planetId/resources/:material`, 연결(세계 행성·설정 칸) |
| `packages/shared/src/worldMap.ts`·`apps/server/src/worldMap/reads.ts` | 도시 줄 `capital`(세력 행 `capital_city_id`) |
| `apps/game/src/map/PlanetLayerPicker.tsx`(새)·`usePlanetLayers.ts`(새)·`planetResource.ts`(새)·`territoryPick.ts`(새) | 레이어 버튼·원자재 고르기·범례, 자원 지도 받기·버리기, 누른 곳의 국가 |
| `apps/game/src/map/PlanetMapScreen.tsx` | 위 부품 연결, `data-material`·`data-resource`·`data-resource-bytes` |
| `apps/game/src/map/CityOverlay.tsx`·`cityOverlay.css`·`planetMap.css` | 영토 강조(`data-emphasis`), 수도 별, 범례 모양 |
| `apps/game/messages/{ko,en}.json` | 새 문구 30개(ko·en) |
| 시험: `layerColors.test.ts`·`planetResource.test.ts`·`resourceMap.test.ts`·`territoryPick.test.ts`·`reads.db.test.ts`(수도)·`e2e/planet-view.spec.ts`("레이어") | |
| `docs/adr/2026-11-07-planet-view.md`·`docs/questions/2026-11-12-planet-layers.md` | 바뀜 절·질문 1166~1172 |

## 함께 바꿔야 하는 파일
- 몫 규칙(`packages/shared/src/catchment.ts`)이 설정 칸을 더 쓰게 되면 `apps/server/src/planet/resourceMap.ts` `resourceRulesKey`에 그 칸을 더한다(안 더하면 설정 칸을 바꿔도 지도가 옛 셈 그대로다).
- 원자재 차례(`CATCHMENT_MATERIALS`)를 바꾸면 이진 형식의 원자재 번호 뜻이 바뀐다 → `PLANET_RESOURCE_FORMAT_VERSION`을 올린다.
- 레이어 색은 `layerColors.ts`만 고친다(셰이더·범례가 같이 바뀐다).

## 건드리지 말 것
- 1차맵 타일 형식(`PLANET_TILE_FORMAT_VERSION`)·생성기 판: 이 줄기는 올리지 않았다.

## 미검증·TODO·알려진 문제
- 자원 텍스처 밉맵은 면 6장 배열이라 면 사이 번짐은 없지만, 멀리서는 칸 몫의 평균색이 된다(가까이선 칸 그대로). Verified 아님: 휴대폰 GPU의 R8 배열 텍스처 밉맵(WebGL2 필수 기능 — Assumed).
- 영토 레이어는 새 조회 없이 `world.cities`(안개 514)를 쓴다. 칸 색(D-104)·영토 안개(D-103)는 다음 줄기(질문 1170).
- 누른 곳의 국가는 기기 보기 값(위도·경도 실수 근사): 경계 몇 m 안에서는 서버 칸 표와 다를 수 있다.
- `planetEngine.ts`는 605줄(경고 600, 실패 1,000).

## 사용자 결정 대기
- 질문 1166~1172(추천안을 [임시]로 넣었다).
