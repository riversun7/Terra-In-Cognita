# 특수 지형·반복 분석 측정 스크립트 보관 (prototype, main에 합치지 않음)

- 만든 날: 2026-10-29 (KST), 작업 도구: Claude Code
- 쓰는 문서: main의 `docs/questions/2026-10-29-special-terrain.md`(D-214 특수 지형 제안)
- 측정에 쓴 생성기: 작업 가지 `worktree-wf_855dd1b7-352-1`의 `c08f84f`(출력 판 2, 강가 습도 가산 고침). 이 판은 S2 다듬기 묶음에서 main에 합친다.

## 들어 있는 것 (`special-terrain-research.tar.gz`)
- `synthesis/lib/cands.ts`: 후보 18개·변형·예비 5개의 판정 조건(제안서 1.2절의 "자료 조건")
- `synthesis/lib/rules.ts`: 정보창용 조항 표(제안서 3장)
- `synthesis/harness/`: 생성기 단계 함수를 직접 불러 칸별 중간값을 모으는 읽기 전용 하네스(`cli.ts`, `lib/`). 생성기 사본과 캐시는 뺐다(105MB)
- `synthesis/scripts/`: `measure.ts`(비율·덩어리·겹침), `trace.ts`(정보창 예시), `tilecost.ts`(타일 비용·모으기 규칙), `summarize.ts`·`extract.ts`·`lost.ts`(표)
- `synthesis/out/`: 작은 결과 파일(F7·F9 측정 JSON·TXT, 반복 검사 다시 돌린 결과)
- `repetition/check/`: 반복 검사 시제품(`variety-check.ts`, 지표 14개, 제안서 4.1·4.4)
- `repetition/scripts/`: 반복 분석 스크립트(numpy 시제품 포함, 제안서 4.3의 시제품 수치)

## 쓰는 법
- 저장소 밖 빈 폴더에 푼다: `tar -xzf special-terrain-research.tar.gz -C <빈 폴더>`
- 하네스는 생성기 사본을 `synthesis/harness/snapshot-<커밋>/`에 두고 쓴다: 저장소에서 `git archive <커밋> packages/planet packages/shared | tar -x -C <그 폴더>/synthesis/harness/snapshot-<커밋>`
- Node 24로 `node scripts/measure.ts 7 pack --json out/measure-F7.json`처럼 돌린다(자세한 순서는 제안서 0장과 부록)
- 측정용이라 `Math.sin`·`Math.exp`를 쓴 곳이 있다. 생성기에 옮길 때는 `@terra/shared`의 결정적 함수로 바꾼다(제안서 2.5)
