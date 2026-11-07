# 바운스 브레이커 (Bounce Breaker)

핀볼 로그라이트 모바일 웹게임. 순수 HTML/CSS/JS (ES 모듈), 빌드 없음.

## 실행
```
python -m http.server 8765
```
→ http://localhost:8765/ (디버그: `?debug` → `window.__bb`)

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
