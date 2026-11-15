// 프로토콜 버전과 전송 한도 (docs/adr/2026-10-28-time-and-session-protocol.md)

/**
 * 현재 프로토콜 버전. 메시지 형식이나 의미가 바뀌면 올린다.
 * 2: 2차맵 구독·명령·전송 메시지(secondMap.ts, ADR 2026-10-28-s1-second-map.md "구현하며 정한 것 (서버 연결)").
 * 3: 2차맵 시야 전송(S3 ADR 3절) — 남의 유닛은 자른 경로(until)·사라짐(hidden), 탐사 칸(vision), 관리자 전체 보기(observe),
 *    개발 시험 명령(dev_spawn_units).
 * 4: 사이보그 만들기(cyborg.ts, ADR 2026-11-01-first-login-cyborg 4절) — cyborg_roll·cyborg_create → cyborg_result.
 *    더하기만 했다. 3판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 5: 사이보그 속성 분배(D-450, 첫 접속 ADR "바뀜 (D-450~D-453)") — cyborg_create에 elements(5판 연결은 꼭), 한 번 분배
 *    cyborg_elements, 결과 코드 elements_invalid·elements_locked·no_cyborg. 4판 기기의 만들기(elements 없음)는 그대로 받고
 *    "분배 기다림"으로 만든다. 새 코드는 5판 연결에만 간다(4판 기기는 그 코드를 부르는 메시지를 보내지 않는다).
 * 6: 보유 물건(items.ts, docs/adr/2026-11-03-item-holdings.md 5절) — item_equip·item_unequip·item_use·dev_grant_item → item_result.
 *    더하기만 했다. 5판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 7: 영토 비콘(territory.ts, docs/adr/2026-11-03-territory-layer.md 4절) — beacon_place·beacon_remove → beacon_result.
 *    구인 카드 고용(recruit.ts, D-469, docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)") — recruit_hire →
 *    recruit_result. 노동 계약(labor.ts, docs/adr/2026-11-03-labor-contracts.md) — labor_create·labor_terminate·labor_top_up·
 *    labor_set_rent → labor_result. 셋 다 더하기만 했고 한 번에 합쳐 판 하나로 올렸다. 6판 기기는 그대로 받는다(이 메시지를
 *    보내지 않는다).
 * 8: 구인 게시(labor.ts, docs/adr/2026-11-03-labor-contracts.md "바뀜 (기획 338~342·구인 게시판)") — labor_post_job·
 *    labor_withdraw_job·labor_accept_job → labor_result(jobId, 결과 코드 job_not_open·employer_insufficient_funds).
 *    더하기만 했다. 7판 기기는 그대로 받는다(이 메시지를 보내지 않고, 새 코드는 이 메시지에만 간다).
 * 9: 개발 시험 병원 치료(items.ts, D-514 — 병원 시설이 생기기 전 규칙 고리) — dev_treat_unit → item_result. 사이보그 유닛 융합·유전자
 *    환생(fusion.ts, docs/adr/2026-11-07-cyborg-fusion-genes.md) — cyborg_fuse·unit_rebirth·dev_grant_goods → fusion_result. 둘 다
 *    더하기만 했고 한 번에 합쳐 판 하나로 올렸다. 8판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 10: 건물 짓기·레벨업·수리·장비 수리(facilities.ts, docs/adr/2026-11-07-buildings-runtime.md) — facility_build·facility_upgrade·
 *    facility_repair·equipment_repair·dev_facility_grant·dev_facility_finish → facility_result. 영토 비콘 놓기에 재료가 들어
 *    beacon_result에 insufficient_materials가 생겼다(10판 연결에만 간다, 9판은 forbidden). 9판 기기는 그대로 받는다.
 * 11: 유전자(fusion.ts, docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)") — 유전자 환생 unit_rebirth를 뺐다(D-516 "무작위 +1은
 *    불가능", 10판 기기가 보내면 invalid_message). gene_synthesize·gene_inject·gene_incubate·dev_grant_gene·dev_expire_unit을 더했고
 *    fusion_result의 결과 코드(alive·insufficient_genes를 빼고 unknown_gene 등을 더함)와 성공 칸(shards를 빼고 gene·genes·outcome·
 *    total·skill)이 바뀌었다. 창고 옮기기(facilities.ts storage_move, docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)") →
 *    facility_result(새 코드 not_storage·storage_full·no_place는 이 판 메시지의 답에만 간다), dev_facility_grant에 짓는 자리 칸
 *    (mapKey·x·y, 선택). 두 줄기를 배포 전에 합쳐 한 판으로 올렸다.
 * 12: 건물·영토 비콘 공격(facilities.ts facility_attack, 질문 381, docs/adr/2026-11-07-buildings-runtime.md "바뀜 (전투·건물)") →
 *    facility_result(doneAtMs = 전투 결과 적용 시각, 새 코드 own_target·target_ruined·out_of_reach·safe_zone은 이 메시지의 답에만 간다).
 *    신전·종교(temple.ts, docs/adr/2026-11-07-temple-religion.md, D-517) — temple_pray·temple_offer·temple_rite·dev_inactivate_unit →
 *    temple_result. 비활성 휴먼 유전자 변환(fusion.ts gene_convert → fusion_result, 새 코드 not_inactive·not_lab·lab_closed·wrong_city는
 *    이 판 메시지의 답에만 간다). 두 줄기를 배포 전에 합쳐 한 판으로 올렸다. 더하기만 했고 11판 기기는 그대로 받는다.
 * 13: 폐허 복원(ruins.ts, docs/adr/2026-11-07-ruins-restoration.md, D-510) — restoration_open·restoration_fund·dev_make_ruin →
 *    restoration_result. 행정 건물(시설 단계 government) 짓기의 facility_result 새 코드 not_ruin·ruin_claimed는 13판 연결에만 가고
 *    더 낮은 판은 not_buildable을 받는다. 신전 2(docs/adr/2026-11-07-temple-religion.md "바뀜 (기획 답 451~459)") — 생명과학 연구소
 *    인큐베이터(fusion.ts gene_incubate에 연구소 칸 buildingId·cost, 칸이 없으면 판 11 그대로 개발 시험)·개발 편집 수호신 버프
 *    (temple.ts dev_guardian_buff → temple_result). 두 줄기를 배포 전에 합쳐 한 판으로 올렸다. 더하기만 했고 12판 기기는 그대로 받는다.
 * 14: 직무 배치(labor.ts labor_assign·labor_unassign → labor_result, docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산") — 내 유닛을 내 채집
 *    시설에 돈 없이 둔다(새 결과 코드 not_workplace·facility_full·not_assigned는 이 메시지의 답에만 간다). 물자 거래소(market.ts, 같은 ADR
 *    "WP4 도시 경제·거래소") — market_place·market_cancel·market_watch → market_result, 체결 알림 market_fill(알림을 켠 연결에만). 두 줄기를
 *    배포 전에 합쳐 한 판으로 올렸다. 더하기만 했고 13판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 15: 직무 위치 조건 + 환전 + 폐허 2(docs/adr/2026-11-07-play-flow.md "WP8"·"WP6", 기획 정리 D-518 522 ①·534 가, 같은 판에 묶음 — 폐허 2도 같은 15)
 *    - 직무(labor.ts 결과 코드 wrong_map): 직무 배치·노동 계약·구인 받기는 유닛이 그 시설과 같은 2차맵에 있어야 한다. 새 코드는 15판 연결에만
 *      가고 14판 연결은 invalid_terms를 받는다.
 *    - 환전(market.ts fx_place·fx_cancel → fx_result): 나라 화폐 ↔ 기준 통화 동시호가에 주문 내기·회차 전 거두기. 더하기만 했고 14판 기기는
 *      그대로 받는다(이 메시지를 보내지 않는다). 거래소 값이 나라 화폐가 되어 market_* 메시지의 값은 그 도시 화폐 최소 단위다(모양은 같다).
 *    - 폐허 2(ruins.ts, docs/adr/2026-11-07-ruins-restoration.md "바뀜 (기획 답 480~489, 472, 535)") — restoration_result 새 코드
 *      not_built(정부 건물을 다 지어야 모금을 열고 넣는다)·expired(모금 기한이 지났다)는 15판 연결에만 가고 더 낮은 판은 not_claimed를 받는다.
 *      더하기만 했고 14판 기기는 그대로 받는다.
 * 16: 2차맵 사이 이동(travel.ts travel_start·travel_cancel → travel_result, docs/adr/2026-11-07-play-flow.md "WP9", 기획 D-197·질문 571 가) —
 *    1차맵 명령 [확정]이 내 유닛을 이웃 2차맵을 하나씩 지나 목적 2차맵으로 걷게 한다. 더하기만 했고 15판 기기는 그대로 받는다(이 메시지를
 *    보내지 않는다).
 * 17: 2차맵 유닛 조종·채집·건물 들어가기(합친 판 — 여러 줄기가 더한 것을 한 판으로 묶었다. 모두 더하기만 했고 16판 기기는 그대로 받는다
 *    — 새 메시지를 보내지 않는다).
 *    - 유닛 조종 권한(secondMap.ts stop_unit → result, docs/adr/2026-11-07-unit-control.md, 사용자 지적 2026-11-07 "유저는 맵 진입시 본인의
 *      유닛만 움직일 수 있어야함") — 멈추기 명령 stop_unit과 결과 코드 not_owner(내 유닛이 아님)·unit_stays(수호신은 도시에 머문다). 두 코드는
 *      17판 연결에만 가고 16판 연결은 전처럼 forbidden을 받는다.
 *    - 원자재 오브젝트 채집·건물 들어가기(gather.ts gather_start·gather_stop·unit_enter → gather_result,
 *      docs/adr/2026-11-07-gather-objects.md, 사용자 지적 2026-11-07 문제 2·3) — 내 유닛이 오브젝트로 걸어가 캐고 넣는 곳에 넣기를 되풀이하고,
 *      건물로 걸어가 화물 넣기·직무 받기·안에 머물기를 한다.
 *    - 병원 치료(hospital.ts hospital_treat·dev_injure_unit → hospital_result, docs/adr/2026-11-08-injury.md, 기획 D-521) — 다친 내 유닛을
 *      그 유닛이 선 도시의 병원(의료 단계 시설)에서 화폐를 내고 빨리 낫게 한다.
 * 18: 합친 판(여러 줄기가 더한 것을 한 판으로 묶었다. 모두 더하기만 했고 17판 기기는 그대로 받는다).
 *    - 유닛 표시 종류(secondMap.ts unitMotionSchema kind, docs/adr/2026-11-07-play-flow.md "WP-NPC3", 기획 정리 748 나) — 서버가 지도에 따로 그릴
 *      유닛(NPC 국가 지도자 npc_leader)의 움직임에 종류를 붙이고, 기기는 그 유닛 머리 위에 이름표·지도자 표시를 늘 그린다. 더하기만 했다: 17판
 *      기기는 모르는 칸을 버리고(zod object) 그대로 받는다(지도자는 다른 유닛과 같은 모양). 서버는 연결 판에 따라 나누지 않는다(스냅샷 조각을 함께 쓴다).
 *    - 국적 바꾸기(citizenship.ts nationality_change → nationality_result, docs/adr/2026-11-08-citizenship.md, 질문 745 나) — 다른 나라 도시의
 *      행정 건물에서 값을 내고 옛 나라 정착 지원금을 돌려준 뒤 그 나라 국민이 된다. 더하기만 했고 17판 기기는 그대로 받는다(이 메시지를 보내지
 *      않는다). 같은 나라 시야 공유(질문 746 나)는 메시지 모양이 그대로다(서버가 보내는 남의 유닛이 늘 뿐).
 * 19: 합친 판(두 줄기를 한 판으로 묶었다. 18판 기기는 그대로 받는다).
 *    - 식품 포장 풀기(items.ts item_unpack → item_result, docs/adr/2026-11-03-item-holdings.md "바뀜 (D-524, 2026-11-08)", 사용자 결정 D-524
 *      "음식은 포장된것만 스택. 포장 해제시 신선도 하락시작") — 포장된 식품 칸에서 낱개를 꺼낸다. 결과 코드 not_packed는 이 메시지의 답에만 간다.
 *      holdings.list 물건 칸 packed(조회 모양, 프로토콜과 무관)도 같은 줄기다. 더하기만 했고 18판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 *    - 귀화 조건 바뀜(citizenship.ts, docs/adr/2026-11-08-citizenship.md "바뀜 (D-526)") — 받는 나라가 지원금 또는 입회비를 정하고 옛 나라에
 *      돌려주지 않는다. nationality_change의 cost가 부호 있는 값(입회비 − 지원금, 음수 = 받는다)이 되었고, nationality_result 성공에 granted·
 *      standingDrop·hostile(선택 칸)을 더했고 returned는 늘 "0"이다. 18 기기는 그대로 받는다(cost는 0 이상만 보내고, 결과의 새 칸은 버린다 —
 *      지원금을 주는 나라에서는 18 기기가 보낸 합이 맞지 않아 terms_changed).
 * 20: 시험 일꾼 없애기(사용자 지적 2026-11-09 "시험일꾼 다 없애라고", docs/adr/2026-10-31-s3-server-stage.md "바뀜 (2026-11-09)") — 개발 시험
 *    명령 dev_spawn_units(3에서 더함)를 뺐다. 19판 기기가 보내면 invalid_message(그 단추는 19판 기기에서도 이미 지웠다 — 보내지 않는다).
 *    다른 메시지는 그대로라 19판 기기는 그대로 받는다.
 * 21: 물가 조건(facilities.ts, docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)", 질문 947 나) — facility_result 새 코드
 *    needs_water(낚시터처럼 팩 needsWaterWithin이 있는 시설을 물에서 먼 자리에 지으려 함). 21판 연결에만 가고 20판 연결은 blocked_terrain을
 *    받는다(그 판 기기가 모르는 코드라 메시지를 풀지 못한다). 다른 메시지는 그대로라 20판 기기는 그대로 받는다.
 * 22: 3D 외형 한 번 고르기(cyborg.ts cyborg_look → cyborg_result, 질문 961 나, docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-11, 961·963)") —
 *    3D 외형을 고르기 전에 만든 사이보그가 사이보그 화면에서 한 번 무료로 고른다. 결과 코드 look_locked는 이 메시지의 답에만 간다.
 *    더하기만 했고 21판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 *    + 가문 창설(같은 22판에 합침)(house.ts house_found → house_result, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)", 질문 926 나) —
 *    저장한 세력 정체성으로 가문(세력 행)을 만들고 창설 비용을 낸다. 더하기만 했고 21판 기기는 그대로 받는다(이 메시지를 보내지 않는다 —
 *    그 판 기기의 정체성 저장은 tRPC라 그대로 되고, 창설만 새 앱에서 한다). 받는 가장 낮은 판은 원칙(현재 + 직전 1개)대로 21.
 * 23: 가문 가입(house.ts house_invite·house_apply·house_answer·house_withdraw·house_leave·house_kick → house_member_result,
 *    docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)", 질문 985 다) — 가문장의 초대와 플레이어의 가입 신청(같은 나라
 *    시민만), 받기·거절·거두기·나가기·내보내기. 더하기만 했고 22판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 24: 가문장 넘기기·해산(house.ts house_handover·house_dissolve → house_member_result, 새 코드 not_alone·has_city·성공 handed_over·dissolved는 24판
 *    연결에만 간다)·가문 도시(house_village·house_ruin → house_city_result, docs/adr/2026-11-11-house-village.md, 질문 1003 가·1005 가). 더하기만
 *    했고 23판 기기는 그대로 받는다(이 메시지를 보내지 않는다). 받는 가장 낮은 판은 원칙대로 23.
 * 25: 가문 도시 구인(houseRecruit.ts house_recruit_auto·house_recruit_hire → house_recruit_result, 질문 1041 다,
 *    docs/adr/2026-11-11-house-village.md "바뀜 (2026-11-12)"). 더하기만 했고 24판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 *    받는 가장 낮은 판은 원칙대로 24.
 * 26: 움직이는 어군 번호(gather.ts gather_start objectId 상한 65,535 → 1,048,575, 기획 D-536, docs/adr/2026-11-07-gather-objects.md
 *    "바뀜 (2026-11-12)") — 어군 번호는 배치 칸 번호(256²) 다음이다. 넓히기만 했고 25판 기기는 그대로 받는다(어군을 모르고 큰 번호를
 *    보내지 않는다). 받는 가장 낮은 판은 원칙대로 25.
 * 27: 배(boats.ts boat_build·boat_board·boat_leave → boat_result, docs/adr/2026-11-13-boats.md, 기획 D-540 1221 "지도 위 배부터") — 부두에서 배를
 *    만들고 타고 내린다. 이동 결과 코드 aboard(배에 탄 유닛은 따로 움직이지 않는다)는 27판 연결에만 가고 더 낮은 판은 invalid_request를 받는다.
 *    유닛 표시 종류 boat는 글자 칸이라 26판 기기는 보통 유닛으로 그린다. 더하기만 했고 26판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 *    받는 가장 낮은 판은 원칙대로 26.
 * 28: 배 B2(boats.ts, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)", 기획 D-541) — 배 만드는 시간이 생겨 boat_result에 readyAtMs(선택 칸)와
 *    결과 코드 dock_busy가 생겼다(dock_busy는 28판 연결에만, 27판은 busy). 승객에게 내린 이동은 배 이동이 되고(aboard는 남의 배일 때만), 배는
 *    2차맵 사이 이동(travel_start)으로 이웃 2차맵 바다로 건너간다(메시지 모양은 그대로). 더하기만 했고 27판 기기는 그대로 받는다.
 *    받는 가장 낮은 판은 원칙(ADR 7 "현재 + 직전 1개", 판 시험이 본다)대로 27 — 26판 기기는 새 앱을 받는다.
 * 29: 구간 빠르기(secondMap.ts unitMotionSchema pace, docs/adr/2026-11-14-segment-speed.md, 기획 D-541 — 질문 1317 나) — 유닛 움직임에 구간마다
 *    걸음 배율(천분율)이 실린다. 숲·얕은 물·느려짐 소품·바위 땅에서 실제로 느리게 걷고, 기기는 같은 배율로 보간한다. 칸을 더하기만 했다. 28판
 *    기기는 모르는 칸을 버리고 경로 전체를 같은 빠르기로 보간해 위치가 어긋난다(숲 구간이면 도착보다 먼저 닿아 보인다 — 판정은 서버라 틀리지 않고,
 *    새 경로가 오면 맞춰진다). 받는 가장 낮은 판은 원칙(현재 + 직전 1개, 판 시험이 본다)대로 28 — 27판 기기는 새 앱을 받는다.
 * 30: 배 체계 개편(boats.ts, docs/adr/2026-11-15-shipyard-harbor.md, 기획 D-547 1481~1500) — 조선소에서 배 종류를 골라 만들기(boat_build boatType, 선택 칸),
 *    수리(boat_repair)·집 정박장(boat_berth)·교역 부두 시간 사기(boat_dock_time)·배 시설 주인 설정(harbor_policy) → boat_result. 새 결과 코드(not_shipyard 등
 *    12개)는 30판 연결에만 가고 29판 연결은 옛 코드로 낮춘다(legacyBoatCode — 만들기를 옛 부두 = 정박장에 보내면 not_dock). 더하기만 했고 29판 기기는
 *    그대로 받는다(새 메시지를 보내지 않는다).
 * 31~33: 같은 묶음의 다른 줄기가 쓴다(배정 번호).
 * 34: 사업장 장부(business.ts, docs/adr/2026-11-15-business-ledger.md, 기획 D-548·D-555) — business_settle·business_invest·business_buy·business_price·
 *    unit_gift → business_result. 더하기만 했고 33판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 35: 같은 묶음의 다른 줄기(좌표 이동)가 미리 받은 판 — 그 줄기는 프로토콜을 바꾸지 않아 쓰지 않았다.
 * 36: 운영자 모드·옛 2D 외형 정리(기획 D-560, docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-15, D-560)",
 *    docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-15, D-560 1421)").
 *    - 운영자 빠르기 배율(secondMap.ts operator_pace → result): 운영자 모드 연결의 유닛 명령 걷기 배율(기본 1 = 보통 유닛과 같다). 운영자 모드를
 *      끄면 서버가 1로 돌리고 그 연결이 단 빠른 표시를 바로 푼다(1248).
 *    - 운영자 텔레포트(travel.ts travel_start teleport 칸): dev·admin이 내 유닛을 목적 2차맵 칸으로 바로 옮긴다(1차맵, 1239).
 *    - 사이보그 만들기(cyborg.ts cyborg_create)의 옛 2D 칸 appearance가 선택 칸이 됐다(1421 — 기기는 3D 외형 look만 보낸다). 서버는 옛 칸을 저장하지
 *      않는다(look이 없고 옛 칸만 오면 그 값에서 3D 외형을 넘겨 만든다).
 *    더하기만 했고(선택 칸) 35판 기기는 그대로 받는다(새 메시지·칸을 보내지 않는다).
 * 37: 배 D-559(boats.ts, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559") — 다 된 배는 조선소 도크에 들고 꺼내기(boat_release, 남의 배는 장기 보관료),
 *    조선소 모듈 묶음(harbor_policy modules, 선택 칸), 연료 보급(boat_refuel)·오버히트(boat_overheat)·보직(boat_crew)·표류한 배 빼앗기(boat_seize) → boat_result.
 *    새 결과 코드(not_docked 등 9개)는 37판 연결에만 가고 36판 연결은 legacyVoyageCode로 낮춘다. 더하기만 했고 36판 기기는 그대로 받는다(새 메시지를 보내지 않는다 —
 *    다만 다 만든 배가 도크에 들어 36판 기기에서는 꺼낼 단추가 없다: 새 앱을 받으면 꺼낸다). 받는 가장 낮은 판은 원칙대로 36.
 * 38: 건물 화면 개편(docs/adr/2026-11-15-building-screen.md) — 생산시설 지분 주문(business.ts business_share_order·business_share_cancel →
 *    business_result, 새 코드 order_limit·unknown_order·insufficient_shares는 이 메시지의 답에만 간다, ok 답에 orderId). 더하기만 했고 37판 기기는
 *    그대로 받는다(이 메시지를 보내지 않는다).
 * 43: 배 D-564·D-568(boats.ts, docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)") — 배 창고 내리기(boat_unload → boat_result), 새 결과 코드
 *    no_fuel_items(연료는 아이템만)·hold_empty는 43판 연결에만 가고 그 아래 연결은 legacyHoldCode로 낮춘다. 남의 조선소 주문은 boat_build 그대로.
 *    더하기만 했고 42판 기기는 그대로 받는다(새 메시지를 보내지 않는다). 받는 가장 낮은 판은 원칙대로 42(39~42판 줄은 같이 합쳐지는 다른 줄기).
 */
export const PROTOCOL_VERSION = 43;

/**
 * 서버가 받아주는 가장 낮은 기기 프로토콜 버전. 원칙은 현재 + 직전 1개 지원이다(ADR 7). 5부터 3판 기기는 인사에서
 * protocol_unsupported를 받고 새 앱을 받는다(PWA 강제 적용). 6부터 4판 기기도, 7부터 5판 기기도, 8부터 6판 기기도, 9부터 7판 기기도,
 * 10부터 8판 기기도, 11부터 9판 기기도, 12부터 10판 기기도, 13부터 11판 기기도, 14부터 12판 기기도, 15부터 13판 기기도, 16부터 14판 기기도,
 * 17부터 15판 기기도, 18부터 16판 기기도, 19부터 17판 기기도, 20부터 18판 기기도, 21부터 19판 기기도, 22부터 20판 기기도, 23부터 21판 기기도, 24부터 22판 기기도, 25부터 23판 기기도, 26부터 24판 기기도, 27부터 25판 기기도, 28부터 26판 기기도, 29부터 27판 기기도, 30부터 28판 기기도, 34부터 33판 아래 기기도, 36부터 34판 이하 기기도, 37부터 35판 이하 기기도, 38부터 36판 이하 기기도, 43부터 41판 이하 기기도 같다(현재 + 직전 1개).
 * (3에서는 예외로 2를 받지 않았다: 2판 기기는 걸러지지 않은 2차맵 흐름을 기대하는데, 시야 전송은 보안 규칙이라 그 흐름을 남기지
 * 않는다, S3 ADR 3절.)
 * 속성 분배 전 사이보그(elements null)는 이제 기기가 만들지 않는다(5판부터 만들기에 분배가 꼭 든다). 화면 시험의 legacy 계정은
 * 지금 판으로 만든 뒤 서버를 끄고 DB에서 속성값을 비워 다시 켠다(e2e/global-setup.ts).
 */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 42;

/** WebSocket 메시지 1개의 최대 크기 (바이트) */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** 연결 유지 확인 간격 (ms) — 프록시 유휴 끊김 방지 */
export const HEARTBEAT_INTERVAL_MS = 25_000;

export function isProtocolSupported(version: number): boolean {
  return (
    Number.isInteger(version) && version >= MIN_SUPPORTED_PROTOCOL_VERSION && version <= PROTOCOL_VERSION
  );
}
