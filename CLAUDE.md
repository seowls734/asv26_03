# 바운스 브레이커 (Bounce Breaker)

핀볼 로그라이트 모바일 웹게임. 순수 HTML/CSS/JS (ES 모듈), 빌드 없음.

## 실행
```
python -m http.server 8765
```
→ http://localhost:8765/dev.html (개발용, js 모듈 그대로 · 디버그: `?debug` → `window.__bb`)

## 한 파일 배포본
`python tools/build_single.py` → `index.html` + `play.html` (같은 내용, CSS·JS·글꼴 전부 인라인, 서버 없이 더블클릭/아무 웹사이트에 올려도 실행). **진짜 게임은 이 두 파일**이고 사이트 첫 주소가 index.html 이다. js/css/dev.html 을 고친 뒤에는 꼭 다시 실행해 갱신한다. index.html 은 직접 고치지 않는다.

## 팀 역할 (.claude/agents/)
planner(기획) → developer(구현) / designer(화면·그림) → tester(검증)
- 모듈 사이 약속(상태 구조·이벤트·함수 이름)은 **docs/구조.md** 가 기준이다. 바꿔야 하면 리드에게 보고하고 임의로 바꾸지 않는다.
- 자기 담당 파일만 수정한다 (구조.md의 "파일 소유" 표).

## 커밋 규칙
- 작업 한 단위가 끝나면 **로컬 커밋만** 한다. `git push` 는 하지 않는다 (사용자 확인 후 리드가 진행).
- 여러 에이전트가 동시에 일할 때는 에이전트가 직접 커밋하지 말고, 끝난 뒤 리드가 역할별로 커밋한다.
- 메시지 접두어: `feat:` `fix:` `refactor:` `docs:` `design:` `test:` `chore:` + 한국어 요약.
- 바깥 폴더의 중첩 저장소 `asv26_03/` 은 커밋하지 않는다 (.gitignore).

## 원칙
- 기존 유명 게임의 캐릭터·이름·맵·아트를 가져오지 않는다.
- 저장은 localStorage + try/catch. 콘솔 에러 0.
