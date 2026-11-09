# 개발 도구 묶음 합치기(시험 일꾼 삭제·건물 편집기·아이템 분류·효과 사전)

- 일시: 2026-11-10 01:30 (KST)
- 작업 도구: Claude Code
- 관련: 작업 기록 `09-2330-test-workers-out.md`, `09-2215-building-editor-2.md`, `09-2150-item-classes.md`, `09-2140-effects-page.md`

## 한 일
- 네 줄기를 main c8ca866 위에 합쳤다: test-workers-out → building-editor-2 → item-classes → effects-page(effects-page 줄기가 통합 가지 eba495f를 받아 코드 충돌을 풀었다).
- 메시지 파일(ko·en) 충돌은 키마다 공통 조상·양쪽을 비교해 합쳤다(한쪽이 지운 키는 지운 채로).
- 사용자 결정(2026-11-09, 건물 편집기 질문): 1) 2차맵 "이미지" = 3D 모델(따로 아이콘 그림을 만들지 않는다). 2) 벽·지붕 색은 모델에 벽·지붕이 있는 곳에만 칠한다("마음대로 해라" → 지금 방식 유지).
- 사용자 결정(2026-11-09): 효과 사전은 따로 페이지(B안, "추천대로 해봐라").

## 검사 결과 (**Verified**)
- 합친 끝(7bbee18, effects-page 줄기가 돌림): `pnpm check` 시험 4,325개, 빌드·`check-pwa`·`check:bundle`(107,711 B) 통과, 화면 시험 effects·items·skills·buildings·gather-tiers·dev 96개 통과.
- 같은 끝에서 화면 시험 unit-control·play-map·labor·building-art·recruit·units 78개 통과.

## 함께 바꿔야 하는 파일
- 통신 규약 20(최소 19), 팩 core@59. NAS 서버는 켤 때 옛 시험 일꾼(유닛 종류 1)을 정리하고 서버 기록 `world boot: removed the old test workers`를 남긴다.

## 미검증·TODO·알려진 문제
- NAS 시험 일꾼 수와 정리 결과는 배포 뒤 서버 기록·`check-world`로 본다.
- `vision.spec.ts` "경계 너머 보기"·1440 낮밤 사진은 헤드리스에서 시간 초과(이번 묶음과 무관한지 main에서 아직 안 봄).
- 기획 질문 895~899(아이템 분류) 기획 세션에 보낼 것.

## 사용자 결정 대기
- 복귀 요약 "생산" 숫자를 실제 생산으로 셀지(시험 일꾼이 없어지면 대개 0).
- 편집기에서 효과 사전 링크로 떠날 때 담은 변경을 묻게 할지.
