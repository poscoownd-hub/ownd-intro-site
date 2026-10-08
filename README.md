# 오운디(OWND) 소개 웹사이트

인천 연수구에서 시작하는 오운디를 소개하는 반응형 웹사이트예요. 본 프로젝트(`~/Desktop/ownd.2차`)와 따로 동작하는 정적 사이트이고, 의존성도 이 폴더 안에만 있어요.

## 실행

```bash
npm install
npm run dev        # http://localhost:5180 (로컬 전용)
npm run build      # dist/ 정적 파일
```

## 구조

| 경로 | 역할 |
|---|---|
| `index.html` | 첫 화면 소개 영상(자막 카드·재생 막대), 앱 화면 갤러리, 지도 활용 목적, 개발 현황, 시작하기 |
| `src/timeline.ts` | 54비트 장면 타임라인, 닫힌 형태 스프링, 재생 속도표(`PACE`, 전체 빠르기 `SPEED`, 약 42초, 구간 경계는 단조 3차 보간으로 부드럽게), 장·자막 |
| `src/story.ts` | 1440×1440 논리 좌표의 연출 무대. `seek(t)`가 시간만으로 모든 스타일을 계산해요 |
| `src/glass.ts` | 리퀴드 글래스(장면 복제 + 거리장 변위 맵 + 채널별 변위 3개), 글자 유리, goo 필터 |
| `src/iris.ts` | 6날 조리개(짧은 호만 사용) |
| `src/controller.ts` | 자동 재생(화면 밖·탭 숨김이면 멈춤), 일시정지·다시 보기, 장 이동, 세대 번호로 늦게 끝난 프레임 차단 |
| `src/start.ts` | “시작하기” 버튼 연결 주소(`START_LINKS`: web·ios·android). 비어 있으면 ‘준비 중/출시 전’ 안내만 해요 |
| `tools/captureApp.mjs` | 본 프로젝트 소비자 앱을 로컬에서 띄운 뒤 화면 캡처 |
| `tools/verify.mjs` | Playwright 검증(레이아웃·내비·54비트 프레임·결정론·급변·동작 줄이기·외부 요청·비밀값·대비) |
| `tools/frames.mjs`, `tools/sheet.mjs`, `tools/pixdiff.mjs` | 특정 비트 프레임 저장·묶어 보기·픽셀 비교 |

## 앱 화면 다시 캡처하기

본 프로젝트 데이터(`.data/`)는 건드리지 않고 임시 DB로 띄워요.

1. 본 프로젝트 루트(`~/Desktop/ownd.2차`)에서 임시 폴더를 만들고 데모 서버 실행: `OWND_DATA_DIR=<임시 폴더> node scripts/verifyPublicSportsE2E.ts --port 8899 --keep`
   (이 스크립트는 `docs/PUBLIC_SPORTS_RESULT.md`를 덮어쓰니 미리 복사해 두고 끝나면 되돌려 주세요.)
2. 소비자 앱 웹: `.claude/launch.json`의 `consumer-capture`(포트 8083)
3. `npm run capture:app`

## 빠르기 조절

`src/timeline.ts`의 `SPEED`만 바꾸면 돼요. 지금(0.65)은 약 42초, 1이면 약 65초예요. 장면 사이에 멈춤 구간은 두지 않고, 처음 워드마크(약 0.65초)와 검은 화면 한 박자만 남겼어요. 화면이 검게 덮이는 순간(약 0.3초)은 빠르기와 상관없이 유지돼요.

## 시작하기 버튼 연결

웹 주소나 스토어 주소가 생기면 `src/start.ts`의 `START_LINKS`에 넣으면 돼요. 그 버튼만 실제 링크로 바뀌어요.

## 검증

개발 서버를 띄운 상태에서 `npm run verify` → `verify-output/report.md`

## 공개 상태

로컬 개발 미리보기 전용이에요. 공개 배포·도메인·호스팅은 하지 않았어요.
