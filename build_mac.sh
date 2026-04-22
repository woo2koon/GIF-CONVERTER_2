#!/bin/bash

# GIF Converter 빌드 스크립트 (Mac용)
# 이 스크립트를 실행하면 dist 폴더에 단독 실행 가능한 .app 파일이 생성됩니다.

echo "빌드를 시작합니다..."

# PyInstaller 및 Eel 패키징 도구가 설치되어 있는지 확인
python3 -m pip install pyinstaller eel

# 빌드 실행
# --onefile: 하나의 파일로 합침
# --noconsole: 실행 시 터미널 창 숨김
# --name: 앱 이름 설정
python3 -m eel main.py web --onefile --noconsole --name "GIF_Converter"

echo "------------------------------------------------"
echo "빌드가 완료되었습니다!"
echo "dist/ 폴더 내의 GIF_Converter.app 파일을 확인하세요."
echo "------------------------------------------------"
