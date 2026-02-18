# API DROP/KEEP Report

Generated: 2026-02-17T14:33:45.438Z

## Summary

| Decision | Count |
|---|---|
| ✅ KEEP | 69 |
| ❌ DROP | 27 |
| 🔶 MAYBE | 0 |
| **Total** | **96** |

## ✅ KEEP (69)

| # | API Name | Provider | Endpoint | Ops | Relevance | Reason |
|---|----------|----------|----------|-----|-----------|--------|
| 1 | 국세청_사업자등록정보 진위확인 및 상태조회 서비스 | 국세청 | `https://infuser.odcloud.kr/api/stages/28493/api-do` | 0 | HIGH | HIGH relevance to SME platform, endpoint reachable (200) |
| 2 | 한국예탁결제원_기업정보서비스 | 한국예탁결제원 | `(없음)` | 20 | HIGH | HIGH relevance, endpoint unreachable but may need different  |
| 3 | 조달청_나라장터 계약정보서비스 | 조달청 | `https://apis.data.go.kr/1230000/ao/CntrctInfoServi` | 21 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 4 | 공정거래위원회_통신판매사업자 등록변경현황 제공 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/MllBsChg_2Service` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 5 | 공정거래위원회_통신판매사업자 등록현황 제공 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/MllBs_2Service` | 7 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 6 | 근로복지공단_산재보험 판례 판결문 조회 서비스 | 근로복지공단 | `https://apis.data.go.kr/B490001/sjbPrecedentInfoSe` | 5 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 7 | 근로복지공단_고용/산재보험 현황정보 | 근로복지공단 | `https://apis.data.go.kr/B490001/gySjbPstateInfoSer` | 13 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 8 | 국민연금공단_국민연금 가입 사업장 내역 | 국민연금공단 | `https://apis.data.go.kr/B552015/NpsBplcInfoInqireS` | 3 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 9 | 금융위원회_기업 재무정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetFinaSta` | 3 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 10 | 금융위원회_기업기본정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetCorpBas` | 3 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 11 | 행정안전부_식품_건강기능식품유통전문판매업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/health_functional_` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 12 | 행정안전부_식품_건강기능식품일반판매업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/health_functional_` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 13 | 행정안전부_식품_식품운반업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/food_transporters` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 14 | 행정안전부_자원환경_제재업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/sawmills` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 15 | 행정안전부_자원환경_목재수입유통업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/lumber_import_dist` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 16 | 행정안전부_동물_종축업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/breeding_stock_bus` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 17 | 행정안전부_동물_부화업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/hatcheries` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 18 | 행정안전부_동물_가축사육업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/livestock_farming` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 19 | 행정안전부_기타_출판사 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/publishers` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 20 | 행정안전부_문화_게임물제작업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/game_producers` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 21 | 행정안전부_문화_게임물배급업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/game_distributors` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 22 | 행정안전부_문화_영화수입업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/film_importers` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 23 | 행정안전부_문화_영화배급업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/film_distributors` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 24 | 행정안전부_문화_온라인음악서비스제공업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/online_music_servi` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 25 | 행정안전부_동물_동물위탁관리업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/animal_boarding` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 26 | 행정안전부_건강_의료기기판매(임대)업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/medical_device_sal` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 27 | 금융위원회_기업지배구조 공시정보 | 금융위원회 | `https://apis.data.go.kr/1160100/GetCGDiscInfoServi` | 3 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 28 | 경상북도_사회적기업 현황조회 | 경상북도 | `https://apis.data.go.kr/6470000/SocialCompany` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 29 | 재단법인천안과학산업진흥원_천안지역내 공장현황정보 | 재단법인천안과학산업진흥원 | `https://apis.data.go.kr/B554597/fctry` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 30 | 한국자산관리공사_관급자재 선정심의결과 목록 | 한국자산관리공사 | `https://apis.data.go.kr/B010003/GvslMtrlSlctn` | 1 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 31 | 재단법인천안과학산업진흥원_천안지역내 기업현황정보 | 재단법인천안과학산업진흥원 | `https://apis.data.go.kr/B554597/service` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 32 | 한국남부발전(주)_중소기업지원사업 정보_GW | 한국남부발전(주) | `https://apis.data.go.kr/B552520/RndContest` | 1 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 33 | 충청북도_일자리 우수기업 인증현황 | 충청북도 | `https://apis.data.go.kr/6430000/excellJobCompServi` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 34 | 한국중부발전(주)_협력기업 정보 | 한국중부발전(주) | `https://apis.data.go.kr/B552521/partners` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 35 | 전라남도_우수기업 정보 | 전라남도 | `https://apis.data.go.kr/6460000/goodCompany` | 3 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 36 | 금융위원회_크라우드펀딩중개업자정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetFundBro` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 37 | 한국산업기술진흥원_기술은행 등록기술 특허 조회 서비스 | 한국산업기술진흥원 | `https://211.188.64.69/OpenAPI/service/tech` | 1 | HIGH | HIGH relevance, endpoint unreachable but may need different  |
| 38 | 한국산업인력공단_블라인드 채용 기업 | 한국산업인력공단 | `https://apis.data.go.kr/B490007/ncs.go.kr/api` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 39 | 지식재산처_심판 정보 검색 서비스 | 지식재산처 | `https://kipo-api.kipi.or.kr/openapi/service/judgme` | 5 | HIGH | HIGH relevance, endpoint unreachable but may need different  |
| 40 | 중소벤처기업연구원_중소벤처기업연구원 중소기업정책연구정보 | 중소벤처기업연구원 | `https://apis.data.go.kr/B553436/kosi` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 41 | 금융위원회_단기금융증권발행정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetShorTer` | 9 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 42 | 창업진흥원_창업기업확인서발급기업정보_조회서비스 | 창업진흥원 | `https://apis.data.go.kr/B552735/kisedCertService` | 2 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 43 | 금융위원회_금융회사공시정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetFnCoDis` | 30 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 44 | 경기도 용인시_관내 기업 현황 조회 서비스 | 경기도 용인시 | `https://apis.data.go.kr/4050000/entp` | 1 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 45 | 지식재산처_상표 정보 검색 서비스 | 지식재산처 | `https://kipo-api.kipi.or.kr/openapi/service/tradem` | 6 | HIGH | HIGH relevance, endpoint unreachable but may need different  |
| 46 | 금융위원회_채권발행정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetBondTra` | 3 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 47 | 금융위원회_금융회사기본정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetFnCoBas` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 48 | 금융위원회_주식발행정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetStocIss` | 4 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 49 | 금융위원회_주식배당정보 | 금융위원회 | `https://apis.data.go.kr/1160100/service/GetStocDiv` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 50 | 식품의약품안전처_의료기기 GMP 신청품목 현황 | 식품의약품안전처 | `https://apis.data.go.kr/1471000/MdeqGMPAplyPrdlstS` | 1 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 51 | 식품의약품안전처_의약품 제품 허가정보 | 식품의약품안전처 | `https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoS` | 3 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 52 | 식품의약품안전처_의료기기 품목허가 정보 | 식품의약품안전처 | `https://apis.data.go.kr/1471000/MdlpPrdlstPrmisnIn` | 2 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 53 | 국토교통부_토지 매매 실거래가 자료 | 국토교통부 | `https://apis.data.go.kr/1613000/RTMSDataSvcLandTra` | 1 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 54 | 국토교통부_아파트 매매 실거래가 상세 자료 | 국토교통부 | `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrad` | 1 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 55 | 국토교통부_아파트 매매 실거래가 자료 | 국토교통부 | `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrad` | 1 | MEDIUM | MEDIUM relevance, endpoint works (404) |
| 56 | 조달청_나라장터 입찰공고정보서비스 | 조달청 | `https://apis.data.go.kr/1230000/ad/BidPublicInfoSe` | 25 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 57 | 조달청_나라장터 공공데이터개방표준서비스 | 조달청 | `https://apis.data.go.kr/1230000/ao/PubDataOpnStdSe` | 3 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 58 | 조달청_나라장터 낙찰정보서비스 | 조달청 | `https://apis.data.go.kr/1230000/as/ScsbidInfoServi` | 23 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 59 | 조달청_나라장터 발주계획현황서비스 | 조달청 | `https://apis.data.go.kr/1230000/ao/OrderPlanSttusS` | 8 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 60 | 조달청_누리장터 민간낙찰정보_서비스 | 조달청 | `https://apis.data.go.kr/1230000/ao/PrvtScsbidInfoS` | 7 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 61 | 조달청_누리장터 민간계약정보 서비스 | 조달청 | `https://apis.data.go.kr/1230000/ao/PrvtCntrctInfoS` | 4 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 62 | 조달청_나라장터 사용자정보 서비스 | 조달청 | `https://apis.data.go.kr/1230000/ao/UsrInfoService0` | 5 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 63 | 공정거래위원회_대규모기업집단 계열 편입/제외/유예 변경내역 조회 | 공정거래위원회 | `https://apis.data.go.kr/1130000/tyAssetsRentDelngD` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 64 | 공정거래위원회_대규모기업집단 소속회사 임원현황 정보 조회 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/executiveCompSttus` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 65 | 공정거래위원회_대규모기업집단 소속회사 주주현황 정보 조회 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/stockholderCompStt` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 66 | 공정거래위원회_대규모기업집단 소속회사 재무현황 정보 조회 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/financeCompSttusLi` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 67 | 공정거래위원회_대규모기업집단 소속회사 개요 정보 조회 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/affiliationCompStt` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 68 | 공정거래위원회_지정된 대규모기업집단 조회 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/appnGroupSttusList` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |
| 69 | 공정거래위원회_지정된 대규모기업집단 소속회사 조회 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/appnGroupAffiList` | 1 | HIGH | HIGH relevance to SME platform, endpoint reachable (404) |

## ❌ DROP (27)

| # | API Name | Provider | Endpoint | Ops | Relevance | Reason |
|---|----------|----------|----------|-----|-----------|--------|
| 1 | 공정거래위원회_후원방문판매사업자 정보 상세 제공 서비스 | 공정거래위원회 | `https://apis.data.go.kr/1130000/SrlClslBsIfDtl_2Se` | 1 | LOW | LOW relevance to SME investor platform (공정거래위원회_후원방문판매사업자 정보 |
| 2 | 행정안전부_문화_비디오물제작업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/video_producers` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_문화_비디오물제작업 조회서 |
| 3 | 행정안전부_동물_동물전시업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/animal_exhibition` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_동물_동물전시업 조회서비스 |
| 4 | 행정안전부_문화_비디오물배급업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/video_distributors` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_문화_비디오물배급업 조회서 |
| 5 | 행정안전부_생활_후원방문판매업체 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/sponsored_door_to_` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_생활_후원방문판매업체 조회 |
| 6 | 행정안전부_문화_음반물배급업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/record_distributor` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_문화_음반물배급업 조회서비 |
| 7 | 행정안전부_문화_음반및음악영상물배급업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/music_video_distri` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_문화_음반및음악영상물배급업 |
| 8 | 행정안전부_문화_음반및음악영상물제작업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/music_video_produc` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_문화_음반및음악영상물제작업 |
| 9 | 행정안전부_자원환경_저수조청소업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/water_tank_cleanin` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_자원환경_저수조청소업 조회 |
| 10 | 행정안전부_동물_동물운송업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/animal_transport` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_동물_동물운송업 조회서비스 |
| 11 | 행정안전부_동물_동물수입업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/animal_import` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_동물_동물수입업 조회서비스 |
| 12 | 행정안전부_동물_동물용의료용구판매업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/veterinary_medical` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_동물_동물용의료용구판매업  |
| 13 | 행정안전부_문화_영화제작업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/film_producers` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_문화_영화제작업 조회서비스 |
| 14 | 행정안전부_문화_음반물제작업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/record_producers` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_문화_음반물제작업 조회서비 |
| 15 | 행정안전부_식품_축산물운반업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/livestock_transpor` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_식품_축산물운반업 조회서비 |
| 16 | 행정안전부_생활_방문판매업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/door_to_door_sales` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_생활_방문판매업 조회서비스 |
| 17 | 행정안전부_기타_담배수입판매업체 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/tobacco_import_ret` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_기타_담배수입판매업체 조회 |
| 18 | 행정안전부_기타_옥외광고업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/outdoor_advertisin` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_기타_옥외광고업 조회서비스 |
| 19 | 행정안전부_동물_동물미용업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/pet_grooming` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_동물_동물미용업 조회서비스 |
| 20 | 행정안전부_생활_통신판매업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/ecommerce_business` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_생활_통신판매업 조회서비스 |
| 21 | 행정안전부_동물_동물생산업 조회서비스 | 행정안전부 | `https://apis.data.go.kr/1741000/animal_breeding` | 2 | LOW | LOW relevance to SME investor platform (행정안전부_동물_동물생산업 조회서비스 |
| 22 | 전라남도 보성군_차 생산 및 가공업체 정보 데이터 조회 서비스 | 전라남도 보성군 | `https://apis.data.go.kr/4890000/teaProdProcInfo` | 1 | LOW | LOW relevance to SME investor platform (전라남도 보성군_차 생산 및 가공업체 |
| 23 | 전라남도_천일염 가공기업 | 전라남도 | `https://apis.data.go.kr/6460000/solarsaltCompany` | 1 | LOW | LOW relevance to SME investor platform (전라남도_천일염 가공기업) |
| 24 | 식품의약품안전처_실험동물제도 및 실험동물 시설정보 | 식품의약품안전처 | `https://apis.data.go.kr/1471000/ExperAnimalExperAn` | 3 | LOW | LOW relevance to SME investor platform (식품의약품안전처_실험동물제도 및 실험 |
| 25 | 식품의약품안전처_의약품 생산·수입실적현황 | 식품의약품안전처 | `https://apis.data.go.kr/1471000/MdcinPrdctnImportA` | 1 | LOW | LOW relevance to SME investor platform (식품의약품안전처_의약품 생산·수입실적 |
| 26 | 식품의약품안전처_의약품 행정처분 정보 | 식품의약품안전처 | `https://apis.data.go.kr/1471000/MdcinExaathrServic` | 1 | LOW | LOW relevance to SME investor platform (식품의약품안전처_의약품 행정처분 정보 |
| 27 | 식품의약품안전처_화장품 관련 정보 | 식품의약품안전처 | `https://apis.data.go.kr/1471000/CsmtcsMfcrtrInfoSe` | 1 | LOW | LOW relevance to SME investor platform (식품의약품안전처_화장품 관련 정보) |

## By Provider

| Provider | KEEP | DROP | MAYBE |
|---|---|---|---|
| 행정안전부 | 16 | 20 | 0 |
| 금융위원회 | 10 | 0 | 0 |
| 공정거래위원회 | 9 | 1 | 0 |
| 조달청 | 8 | 0 | 0 |
| 식품의약품안전처 | 3 | 4 | 0 |
| 국토교통부 | 3 | 0 | 0 |
| 근로복지공단 | 2 | 0 | 0 |
| 재단법인천안과학산업진흥원 | 2 | 0 | 0 |
| 지식재산처 | 2 | 0 | 0 |
| 국세청 | 1 | 0 | 0 |
| 한국예탁결제원 | 1 | 0 | 0 |
| 국민연금공단 | 1 | 0 | 0 |
| 경상북도 | 1 | 0 | 0 |
| 한국자산관리공사 | 1 | 0 | 0 |
| 한국남부발전(주) | 1 | 0 | 0 |
| 전라남도 | 1 | 1 | 0 |
| 충청북도 | 1 | 0 | 0 |
| 한국중부발전(주) | 1 | 0 | 0 |
| 한국산업기술진흥원 | 1 | 0 | 0 |
| 한국산업인력공단 | 1 | 0 | 0 |
| 중소벤처기업연구원 | 1 | 0 | 0 |
| 창업진흥원 | 1 | 0 | 0 |
| 경기도 용인시 | 1 | 0 | 0 |
| 전라남도 보성군 | 0 | 1 | 0 |
