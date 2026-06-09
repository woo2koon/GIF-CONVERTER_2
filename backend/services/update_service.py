import os
import sys
import json
import shutil
import urllib.request
import subprocess

CURRENT_VERSION = "1.6.0"
GITHUB_REPO = "woo2koon/GIF-CONVERTER_2"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

def check_for_updates(current_version):
    """GitHub Releases API를 통해 최신 버전을 검사합니다."""
    try:
        req = urllib.request.Request(GITHUB_API_URL, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode('utf-8'))
                latest_version = data.get("tag_name", "v1.6.0").replace("v", "").strip()
                
                # 다운로드 가능한 에셋 찾기 (.zip 파일 우선)
                download_url = None
                assets = data.get("assets", [])
                for asset in assets:
                    if asset.get("name", "").endswith(".zip"):
                        download_url = asset.get("browser_download_url")
                        break
                
                if not download_url and assets:
                    download_url = assets[0].get("browser_download_url")
        except Exception as http_err:
            # 404 (릴리즈가 아직 등록되지 않은 경우 등) 또는 오류 시 테스트용 mock 데이터 제공
            print(f"[Update check] API error: {http_err}. Using fallback mock data for testing.")
            latest_version = "1.6.0"
            download_url = f"https://github.com/{GITHUB_REPO}/archive/refs/heads/main.zip"
            data = {"body": "GitHub Releases에 릴리즈가 등록되지 않아 테스트용 Mock 데이터를 임시 연동합니다."}
            
        # 버전 비교 (단순 문자열 비교 또는 스플릿 비교)
        current_parts = [int(x) for x in current_version.split('.')]
        latest_parts = [int(x) for x in latest_version.split('.')]
        
        has_update = latest_parts > current_parts
        
        return {
            "status": "success",
            "update_available": has_update,
            "current_version": current_version,
            "latest_version": latest_version,
            "download_url": download_url,
            "release_notes": data.get("body", "")
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"업데이트 서버에 연결할 수 없습니다: {str(e)}",
            "update_available": False,
            "current_version": current_version
        }

def download_update(download_url, progress_callback):
    """최신 버전 압축파일을 다운로드합니다."""
    try:
        temp_dir = os.path.dirname(os.path.abspath(__file__))
        # 부모의 부모 디렉토리(프로젝트 루트)에 저장
        root_dir = os.path.dirname(os.path.dirname(temp_dir))
        zip_path = os.path.join(root_dir, "update.zip")
        
        def reporthook(block_num, block_size, total_size):
            if total_size > 0:
                percent = min(100, int((block_num * block_size / total_size) * 100))
                progress_callback(percent)
            else:
                progress_callback(-1) # 진행률 표시 불가능한 경우

        req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            with open(zip_path, 'wb') as f:
                total_size = int(response.info().get('Content-Length', 0))
                downloaded = 0
                block_size = 8192
                while True:
                    block = response.read(block_size)
                    if not block:
                        break
                    downloaded += len(block)
                    f.write(block)
                    if total_size > 0:
                        percent = min(99, int((downloaded / total_size) * 99))
                        progress_callback(percent)
        
        progress_callback(100)
        return {"status": "success", "zip_path": zip_path, "root_dir": root_dir}
    except Exception as e:
        return {"status": "error", "message": f"다운로드 중 오류가 발생했습니다: {str(e)}"}

def launch_updater_and_exit(zip_path, root_dir):
    """현재 프로세스를 종료하고 파일을 교체할 업데이터 배치파일을 실행합니다."""
    try:
        bat_path = os.path.join(root_dir, "updater.bat")
        
        # 실행 모드 판별 (Frozen EXE인지 여부)
        is_frozen = getattr(sys, 'frozen', False)
        exe_name = os.path.basename(sys.executable)
        
        # 배치 스크립트 작성
        with open(bat_path, "w", encoding="cp949") as f:
            f.write(f"""@echo off
chcp 65001 > nul
echo 업데이트 설치를 위한 준비 중입니다...
timeout /t 2 /nobreak > nul

:: 1. 압축 풀기
echo 최신 파일 압축 해제 중...
powershell -Command "Expand-Archive -Path '{zip_path}' -DestinationPath '{root_dir}' -Force"

:: 2. 임시 파일 삭제
del "{zip_path}"

:: 3. 재기동
echo 프로그램 재기동 중...
if exist "{os.path.join(root_dir, exe_name)}" (
    start "" "{os.path.join(root_dir, exe_name)}"
) else if exist "{os.path.join(root_dir, 'main.exe')}" (
    start "" "{os.path.join(root_dir, 'main.exe')}"
) else (
    echo 재기동 대상을 찾을 수 없습니다. 수동으로 실행해주세요.
)

:: 4. 배치 파일 자체 삭제 후 종료
del "%~f0"
""")
        
        # 배치 스크립트 실행
        if os.name == 'nt':
            subprocess.Popen(["cmd.exe", "/c", bat_path], shell=True, creationflags=subprocess.CREATE_NEW_CONSOLE)
        else:
            # Unix-like (Mac/Linux) shell script fallback (필요시 지원)
            sh_path = os.path.join(root_dir, "updater.sh")
            with open(sh_path, "w", encoding="utf-8") as f:
                f.write(f"""#!/bin/bash
sleep 2
unzip -o "{zip_path}" -d "{root_dir}"
rm "{zip_path}"
open -a "GIF Converter" || python3 main.py
rm "$0"
""")
            os.chmod(sh_path, 0o755)
            subprocess.Popen(["/bin/bash", sh_path])
            
        # 메인 프로세스 강제 종료
        os._exit(0)
    except Exception as e:
        return {"status": "error", "message": f"업데이터 기동 실패: {str(e)}"}
