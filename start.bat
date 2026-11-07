@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 바운스 브레이커 서버를 켭니다... (이 창을 닫으면 게임이 꺼집니다)
echo PC:  http://localhost:8765/
echo 폰:  같은 Wi-Fi에서 http://[이 PC의 IPv4 주소]:8765/   (ipconfig 로 확인)
start "" http://localhost:8765/
python -m http.server 8765 --bind 0.0.0.0
pause
