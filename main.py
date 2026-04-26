import eel
VERSION = "1.4.0"
import os
import base64
import bottle
import tempfile
import subprocess
import imageio_ffmpeg
import re
import json
import yt_dlp

# pywebview 전역 참조 (맥OS에서 파일 다이얼로그 호출용)
try:
    import webview
except ImportError:
    webview = None
_webview_window = None  # pywebview 창 객체 전역 보관

# 프록시 저장용 폴더 설정 및 생성 (모듈 상단으로 이동)
PROXY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".proxies")
if not os.path.exists(PROXY_DIR):
    os.makedirs(PROXY_DIR, exist_ok=True)

# 설정 관리
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
DEFAULT_SAVE_DIR = os.path.join(os.path.expanduser("~"), "Downloads")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"save_dir": DEFAULT_SAVE_DIR}
    return {"save_dir": DEFAULT_SAVE_DIR}

def save_config(config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

app_config = load_config()

# Initialize Eel, pointing to the 'web' directory
eel.init('web')

@eel.expose
def get_os_info():
    import platform
    return platform.system()

@eel.expose
def get_youtube_info(url):
    """yt-dlp를 사용하여 유튜브 영상 정보를 추출합니다."""
    print(f"\n[Backend] YouTube 정보 추출 시도: {url}")
    
    ydl_opts = {
        'format': 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # 스트림 URL 추출 (FFmpeg 및 비디오 플레이어용)
            formats = info.get('formats', [])
            
            # 플레이어에서 재생 가능한 포맷 찾기 (보통 mp4 우선)
            stream_url = info.get('url') # Fallback
            
            # 가능한 경우 직접 스트림 URL 확보
            return {
                "status": "success",
                "id": info.get('id'),
                "title": info.get('title'),
                "duration": info.get('duration'),
                "thumbnail": info.get('thumbnail'),
                "stream_url": stream_url,
                "author": info.get('uploader')
            }
    except Exception as e:
        print(f"YouTube extraction error: {e}")
        return {"status": "error", "message": str(e)}

@eel.expose
def get_save_directory():
    return app_config.get("save_dir", DEFAULT_SAVE_DIR)

@eel.expose
def select_save_directory():
    try:
        # macOS 전용: AppleScript를 사용하여 네이티브 폴더 선택창 호출
        # Tkinter보다 맥 환경에서 훨씬 안정적이며 충돌이 없습니다.
        script = 'POSIX path of (choose folder with prompt "저장 폴더를 선택하세요")'
        process = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            selected_dir = stdout.strip()
            if selected_dir:
                app_config["save_dir"] = selected_dir
                save_config(app_config)
                return selected_dir
    except Exception as e:
        print(f"Folder selection error: {e}")
    return None

@eel.btl.route('/local_file/<filepath:path>')
def server_local_file(filepath):
    import os
    import platform
    import mimetypes
    import base64
    from urllib.parse import unquote
    
    # MIME 타입 보강
    if '.webm' not in mimetypes.types_map:
        mimetypes.add_type('video/webm', '.webm')

    # URL 디코딩 및 경로 정리
    filepath = unquote(filepath)
    
    # 윈도우에서 드라이브 문자 처리
    if platform.system() == 'Windows':
        # URL에서 온 경로가 /C:/... 형식이면 앞의 / 제거
        if filepath.startswith('/') and (len(filepath) >= 3 and filepath[1:3] == ':/' or filepath[1:3] == ':\\'):
            filepath = filepath.lstrip('/')
        # 역슬래시를 슬래시로 통일
        filepath = filepath.replace('\\', '/')
    else:
        # 맥/리눅스: 절대 경로 확보
        if not filepath.startswith('/'):
            filepath = '/' + filepath
    
    if not os.path.exists(filepath):
        return bottle.HTTPError(404, "File not found")

    # 파일명과 디렉토리 분리
    root_dir = os.path.dirname(filepath)
    file_name = os.path.basename(filepath)
    
    # MIME 타입 추측
    mime_type, _ = mimetypes.guess_type(filepath)
    if not mime_type:
        if filepath.lower().endswith('.webm'):
            mime_type = 'video/webm'
        else:
            mime_type = 'video/mp4'
        
    response = bottle.static_file(file_name, root=root_dir, mimetype=mime_type)
    response.set_header('Accept-Ranges', 'bytes')
    response.set_header('Access-Control-Allow-Origin', '*')
    
    return response

@eel.expose
def pick_videos():
    """Opens a native file picker and returns absolute paths."""
    import platform
    
    print(f"\n[Backend] pick_videos 호출됨 (OS: {platform.system()})")
    
    if platform.system() == 'Darwin':
        # 1. AppleScript 시도 (사용자가 선호하는 친숙한 느낌)
        import subprocess
        script = '''
        set out to ""
        tell current application
            activate
            set theFiles to choose file with prompt "비디오 파일 선택" of type {"public.movie", "org.webmproject.webm", "mp4", "mov", "avi", "mkv", "wmv"} with multiple selections allowed
            repeat with aFile in theFiles
                set out to out & POSIX path of aFile & "\n"
            repeat
        end tell
        out
        '''
        try:
            print("[Backend] AppleScript 호출 시도...")
            process = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stdout, _ = process.communicate()
            if stdout.strip():
                paths = stdout.strip().split('\n')
                print(f"[Backend] AppleScript 파일 선택 성공: {len(paths)}개")
                return paths
        except Exception as e:
            print(f"[Backend] AppleScript 실패, pywebview로 전환: {e}")

        # 2. Fallback: pywebview (AppleScript 실패 시)
        global _webview_window
        if _webview_window is not None:
            try:
                print("[Backend] pywebview create_file_dialog 호출 (Fallback)...")
                file_types = ('Video Files (*.mp4;*.mov;*.avi;*.mkv;*.wmv;*.webm)', 'All files (*.*)')
                result = _webview_window.create_file_dialog(
                    webview.FileDialog.OPEN,
                    allow_multiple=True,
                    file_types=file_types
                )
                if result:
                    return list(result)
            except: pass
        return []
    else:
        # Windows/Linux: tkinter
        print("[Backend] Tkinter 호출 시도...")
        import tkinter as tk
        from tkinter import filedialog
        try:
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            files = filedialog.askopenfilenames(
                title="비디오 파일 선택",
                filetypes=[("Video files", "*.mp4 *.mov *.avi *.mkv *.wmv *.webm")]
            )
            root.destroy()
            print(f"[Backend] 파일 선택 성공: {len(files)}개")
            return list(files)
        except Exception as e:
            print(f"[Backend] Tkinter 예외 발생: {str(e)}")
            return []


@eel.expose
def get_file_info(path):
    """Returns basic file info like name, size, and actual video FPS."""
    import subprocess
    import imageio_ffmpeg
    import re

    try:
        # 파일 크기 및 기본 정보
        size = os.path.getsize(path)
        name = os.path.basename(path)
        
        # FFmpeg를 이용해 영상의 메타데이터 추출
        duration = 0.0
        width = 1280
        height = 720
        fps = 30.0
        
        try:
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            # ffprobe 대신 ffmpeg -i를 사용해 정보 추출
            cmd = [ffmpeg_exe, "-i", path]
            result = subprocess.run(cmd, stderr=subprocess.PIPE, text=True, errors='ignore')
            output = result.stderr
            
            # 길이 추출: Duration: 00:00:05.14
            dur_match = re.search(r"Duration:\s+(\d+):(\d+):(\d+\.\d+)", output)
            if dur_match:
                h, m, s = dur_match.groups()
                duration = int(h) * 3600 + int(m) * 60 + float(s)
            
            # 해상도 추출: Video: ..., 1920x1080, ...
            res_match = re.search(r",\s+(\d+)x(\d+)\s*[,\[]", output)
            if res_match:
                width = int(res_match.group(1))
                height = int(res_match.group(2))
                
            # FPS 추출
            fps_match = re.search(r'(\d+(?:\.\d+)?)\s+fps', output)
            if fps_match:
                fps = float(fps_match.group(1))
        except Exception as ffmpeg_err:
            print(f"메타데이터 추출 실패: {ffmpeg_err}")

        # 기존 프록시 파일 존재 여부 확인 (hash 기반 fingerprint 사용)
        proxy_path = None
        try:
            import hashlib
            norm_path = os.path.normpath(path)
            file_stat = os.stat(path)
            fingerprint = f"{norm_path}_{file_stat.st_size}_{file_stat.st_mtime}"
            path_hash = hashlib.md5(fingerprint.encode()).hexdigest()
            potential_proxy = os.path.join(PROXY_DIR, f"proxy_{path_hash}.mp4")
            if os.path.exists(potential_proxy):
                proxy_path = potential_proxy
                print(f"기존 프록시 발견: {proxy_path}")
        except Exception as e:
            print(f"프록시 확인 중 오류: {e}")

        return {
            "status": "success",
            "name": name,
            "size": size,
            "path": path,
            "duration": duration,
            "width": width,
            "height": height,
            "fps": fps,
            "proxy_path": proxy_path
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@eel.expose
def request_proxy(path, file_id):
    """프록시 생성을 요청합니다. 캐시가 있으면 즉시 반환하고, 없으면 백그라운드에서 생성을 시작합니다."""
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    import hashlib
    
    # 지능형 해시 생성 (경로 + 크기 + 수정시간)
    try:
        norm_path = os.path.normpath(path)
        file_stat = os.stat(path)
        fingerprint = f"{norm_path}_{file_stat.st_size}_{file_stat.st_mtime}"
        path_hash = hashlib.md5(fingerprint.encode()).hexdigest()
        proxy_path = os.path.join(PROXY_DIR, f"proxy_{path_hash}.mp4")
        
        # 캐시된 프록시가 이미 존재하면 즉시 성공 반환 (UI 알림 생략)
        if os.path.exists(proxy_path):
            return {"status": "success", "proxy_path": proxy_path}

        # 정보 가져오기 및 백그라운드 워커 실행
        info = get_file_info(path)
        total_duration = info.get('duration', 0)
        
        # threading.Thread를 사용하여 완전한 백그라운드 스레드로 실행 (gevent 블로킹 원천 차단)
        import threading
        threading.Thread(target=generate_proxy_worker, args=(path, file_id, proxy_path, total_duration, ffmpeg_exe), daemon=True).start()
        
        return {"status": "processing"}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

def generate_proxy_worker(path, file_id, proxy_path, total_duration, ffmpeg_exe):
    """백그라운드에서 실제로 FFmpeg를 실행하는 워커입니다."""
    try:
        cmd = [
            ffmpeg_exe, "-i", path,
            "-vf", "scale='min(1280,iw)':-2",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "32",
            "-c:a", "aac", "-b:a", "128k", "-y", proxy_path
        ]
        
        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, text=True, errors='ignore', universal_newlines=True)
        
        for line in process.stderr:
            if "time=" in line and total_duration > 0:
                time_match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
                if time_match:
                    h, m, s = time_match.groups()
                    current_time = int(h) * 3600 + int(m) * 60 + float(s)
                    progress = min(99, int((current_time / total_duration) * 100))
                    eel.update_proxy_progress(file_id, progress)
        
        process.wait()
        if process.returncode == 0:
            eel.update_proxy_progress(file_id, 100)
            eel.proxy_completed(file_id, {"status": "success", "proxy_path": proxy_path})
        else:
            eel.proxy_completed(file_id, {"status": "error", "message": "FFmpeg 변환 실패"})
            
    except Exception as e:
        eel.proxy_completed(file_id, {"status": "error", "message": str(e)})

@eel.expose
def open_downloads_folder():
    """현재 설정된 저장 폴더를 엽니다."""
    import platform
    save_dir = app_config.get("save_dir", DEFAULT_SAVE_DIR)
    if not os.path.exists(save_dir):
        os.makedirs(save_dir, exist_ok=True)
        
    try:
        if platform.system() == 'Darwin':
            subprocess.run(['open', save_dir])
        elif platform.system() == 'Windows':
            os.startfile(save_dir)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def open_file_location(path):
    """파일이 있는 폴더를 열고 해당 파일을 선택 상태로 표시합니다."""
    import platform
    try:
        if platform.system() == 'Windows':
            subprocess.run(['explorer', '/select,', os.path.normpath(path)])
        elif platform.system() == 'Darwin':
            subprocess.run(['open', '-R', path])
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def clear_proxy_cache():
    """저장된 모든 프록시 파일을 삭제하여 용량을 확보합니다."""
    import shutil
    try:
        if os.path.exists(PROXY_DIR):
            shutil.rmtree(PROXY_DIR)
            os.makedirs(PROXY_DIR, exist_ok=True)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def request_conversion(input_path, file_id, output_name, start_time, end_time, fps, resolution, num_colors=256, use_dither=False, loop_playback=True, crop_params=None):
    """
    GIF 변환 요청을 수락하고 백그라운드 스레드에서 작업을 시작합니다.
    """
    try:
        save_dir = app_config.get("save_dir", DEFAULT_SAVE_DIR)
        if not os.path.exists(save_dir):
            os.makedirs(save_dir, exist_ok=True)
        
        base_name, extension = os.path.splitext(output_name)
        output_path = os.path.join(save_dir, output_name)
        
        counter = 1
        while os.path.exists(output_path):
            output_path = os.path.join(save_dir, f"{base_name} ({counter}){extension}")
            counter += 1

        import threading
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        
        # 워커 스레드 시작
        threading.Thread(
            target=conversion_worker, 
            args=(file_id, input_path, output_path, start_time, end_time, fps, resolution, num_colors, use_dither, loop_playback, ffmpeg_exe, crop_params),
            daemon=True
        ).start()
        
        return {"status": "processing", "output_path": output_path}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def conversion_worker(file_id, input_path, output_path, start_time, end_time, fps, resolution, num_colors, use_dither, loop_playback, ffmpeg_exe, crop_params):
    """
    실제로 FFmpeg 2-pass 인코딩을 수행하며 진행률을 보고합니다.
    """
    try:
        import tempfile
        temp_dir = tempfile.gettempdir()
        import hashlib
        # 각 작업마다 고유한 팔레트 파일명 생성
        palette_hash = hashlib.md5(f"{file_id}_{start_time}_{end_time}".encode()).hexdigest()
        palette_path = os.path.join(temp_dir, f'palette_{palette_hash}.png')
        
        duration = float(end_time) - float(start_time)
        
        # 해상도 필터 설정
        crop_filter = ""
        if crop_params and isinstance(crop_params, dict):
            cw, ch = crop_params.get('w', 100) / 100.0, crop_params.get('h', 100) / 100.0
            cx, cy = crop_params.get('x', 0) / 100.0, crop_params.get('y', 0) / 100.0
            crop_filter = f"crop=iw*{cw:.4f}:ih*{ch:.4f}:iw*{cx:.4f}:ih*{cy:.4f},"

        scale_filter = ""
        if ":" in str(resolution):
            scale_filter = f"scale={resolution}:flags=lanczos,"
        elif "720" in str(resolution):
            scale_filter = "scale=-1:min(ih\\,720):flags=lanczos,"
        elif "480" in str(resolution):
            scale_filter = "scale=-1:min(ih\\,480):flags=lanczos,"
            
        base_filters = crop_filter + scale_filter
            
        dither_method = "sierra2_4a" if use_dither else "none"
        
        # --- Pass 1: Palette Generation ---
        eel.update_conversion_status(file_id, "팔레트 생성 중...", 5)
        eel.sleep(0.01) # 프론트엔드로 상태 메시지를 즉시 전송하도록 이벤트 루프에 제어권 양보
        filters_pass1 = f"{base_filters}fps={int(fps)},palettegen=max_colors={num_colors}:stats_mode=diff"
        cmd1 = [
            ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(duration),
            "-i", input_path, "-vf", filters_pass1, palette_path
        ]
        
        # Pass 1 실행
        subprocess.run(cmd1, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # --- Pass 2: GIF Encoding ---
        eel.update_conversion_status(file_id, "인코딩 중...", 15)
        eel.sleep(0.01)
        loop_val = "0" if loop_playback else "-1"
        filters_pass2 = f"{base_filters}fps={int(fps)}[x];[x][1:v]paletteuse=dither={dither_method}"
        cmd2 = [
            ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(duration),
            "-i", input_path, "-i", palette_path,
            "-filter_complex", filters_pass2, "-loop", loop_val, 
            "-progress", "pipe:1", output_path
        ]
        
        process = subprocess.Popen(cmd2, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='ignore', universal_newlines=True)
        
        while True:
            line = process.stdout.readline()
            if not line:
                break
                
            if "out_time_us=" in line:
                try:
                    time_us = int(line.split('=')[1])
                    current_time = time_us / 1000000.0
                    if duration > 0:
                        raw_progress = min(100, (current_time / duration) * 100)
                        mapped_progress = min(100, int(15 + (raw_progress * 0.85)))
                        eel.update_conversion_status(file_id, f"인코딩 중... {int(raw_progress)}%", mapped_progress)
                        eel.sleep(0.01) # 진행률이 프론트엔드에 실시간으로 반영되도록 양보
                except:
                    pass
        
        process.wait()
        
        if os.path.exists(palette_path):
            os.remove(palette_path)
            
        if process.returncode == 0:
            pass


            eel.conversion_completed(file_id, {
                "status": "success", 
                "path": output_path
            })
        else:
            eel.conversion_completed(file_id, {"status": "error", "message": "FFmpeg 인코딩 실패"})
            
    except Exception as e:
        eel.conversion_completed(file_id, {"status": "error", "message": str(e)})

@eel.expose
def convert_to_gif(input_path, output_name, start_time, end_time, fps, resolution, num_colors=256, use_dither=False, loop_playback=True):
    """
    이전 버전과의 호환성을 위한 동기식 래퍼
    """
    return {"status": "error", "message": "Async required. Use request_conversion."}


@eel.expose
def debug_log(message):
    """자바스크립트의 로그를 파이썬 터미널에 출력합니다."""
    print(f"[JS-LOG] {message}")

if __name__ == '__main__':
    import sys
    
    print("--- 프로그램 시작 중 (Standalone App 모드) ---")
    
    eel.init('web')

    # 운영체제별 최적화된 실행 방식 선택
    import platform
    current_os = platform.system()

    try:
        if current_os == 'Windows':
            # 윈도우: 엣지 엔진(WebView2) 사용 - 코덱 지원 및 단독 앱 느낌
            eel.start('index.html', 
                      size=(1280, 850), 
                      port=8889, 
                      mode='edge', 
                      cmdline_args=[
                          '--app-id=gif-converter', 
                          '--disable-http-cache',
                          '--hide-scrollbars',
                          '--window-name="GIF Converter"'
                      ])
        elif current_os == 'Darwin':
            # 맥: pywebview 네이티브 엔진 사용 - 크롬 아이콘 방지 및 사파리 코덱 활용
            import webview
            from webview.dom import DOMEventHandler
            import threading
            import time

            def start_eel():
                eel.start('index.html', mode=None, port=8889, host='127.0.0.1')
            
            t = threading.Thread(target=start_eel, daemon=True)
            t.start()
            
            time.sleep(1) # 서버 시작 대기
            window = webview.create_window('GIF Converter', 'http://127.0.0.1:8889', width=1280, height=850)
            _webview_window = window  # 전역에 저장
            
            # 드래그 앤 드롭 파일 경로 수신 핸들러
            def on_drop(e):
                try:
                    # e는 dict 형태로 들어오며 dataTransfer 내부에 파일 정보가 있습니다.
                    files = e.get('dataTransfer', {}).get('files', [])
                    paths = [f.get('pywebviewFullPath') for f in files if f.get('pywebviewFullPath')]
                    if paths:
                        eel.handle_dropped_files_from_python(paths)
                except Exception as ex:
                    print(f"드롭 처리 중 오류: {ex}")

            def init_logic(win):
                # DOM 이벤트를 통해 파일 경로를 가로챕니다.
                win.dom.document.events.dragover += DOMEventHandler(None, prevent_default=True)
                win.dom.document.events.drop += DOMEventHandler(on_drop, prevent_default=True)
            
            webview.start(init_logic, window, debug=False)
        else:
            # 기타 (리눅스 등)
            eel.start('index.html', size=(1280, 800), port=8889, mode='default')
            
    except Exception as e:
        print(f"창 실행 실패: {e}")
        try:
            eel.start('index.html', size=(1280, 800), port=8889, mode='default')
        except: pass
