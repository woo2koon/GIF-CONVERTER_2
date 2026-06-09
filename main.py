import eel
import os
import bottle
import shutil
import platform
import threading
import time

# Import internal modules
from backend.utils.config_manager import app_config, save_config, DEFAULT_SAVE_DIR
from backend.services.youtube_service import get_youtube_info as fetch_youtube_info
from backend.services.video_service import get_file_info as fetch_file_info, start_proxy_generation, stop_proxy_generation
from backend.services.converter_service import start_conversion
from backend.utils.os_utils import get_os_info as fetch_os_info, open_folder, open_file_location as fetch_file_location, pick_videos as fetch_videos, select_save_directory as fetch_save_dir
from backend.utils.process_manager import cleanup_processes, kill_orphaned_ffmpegs
from backend.services.youtube_service import download_youtube_video as fetch_youtube_download
from backend.services.update_service import check_for_updates, download_update, launch_updater_and_exit

VERSION = "1.5.0"

# pywebview 전역 참조
try:
    import webview
except ImportError:
    webview = None
_webview_window = None 

# 프록시 및 유튜브 다운로드 폴더 설정
PROXY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".proxies")
YT_DL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".yt_downloads")
for d in [PROXY_DIR, YT_DL_DIR]:
    if not os.path.exists(d):
        os.makedirs(d, exist_ok=True)

# Initialize Eel
eel.init('web')

# Monkey-patch Eel to prevent KeyError: 'value' when JS returns an error
# This occurs because if 'return' is in message but status is not 'ok', 
# Eel's internal code still tries to access message['value'] in the 'else' block.
_original_process_message = eel._process_message
def _patched_process_message(message, ws):
    if 'return' in message:
        # call_id = message.get('return')
        if 'value' not in message:
            message['value'] = None
    return _original_process_message(message, ws)
eel._process_message = _patched_process_message

@eel.expose
def get_os_info():
    return fetch_os_info()

@eel.expose
def get_clipboard_text():
    """시스템 클립보드 텍스트를 읽어옵니다."""
    try:
        if platform.system() == 'Darwin':
            import subprocess
            return subprocess.check_output(['pbpaste'], text=True)
        else:
            import tkinter as tk
            root = tk.Tk()
            root.withdraw() # 창 숨기기
            text = root.clipboard_get()
            root.destroy()
            return text
    except Exception as e:
        print(f"[PY] 클립보드 읽기 실패: {e}")
        return ""

@eel.expose
def get_youtube_info(url):
    info = fetch_youtube_info(url)
    # 다운로드 폴더에서 이미 받은 적이 있는 파일인지 확인
    if info.get("status") in ["success", "requires_download"]:
        video_id = info.get("video_id")
        if video_id:
            global YT_DL_DIR
            if os.path.exists(YT_DL_DIR):
                for f in os.listdir(YT_DL_DIR):
                    if f.startswith("._"): continue # macOS 숨김 파일 제외
                    if f"[{video_id}]" in f:
                        full_path = os.path.join(YT_DL_DIR, f)
                        # 파일 정보 및 프록시 존재 여부 추가 확인
                        file_info = fetch_file_info(full_path, PROXY_DIR)
                        if file_info.get("status") == "success":
                            info.update({
                                "local_path": full_path,
                                "path": full_path,
                                "proxy_path": file_info.get("proxy_path"),
                                "duration": file_info.get("duration"),
                                "width": file_info.get("width"),
                                "height": file_info.get("height"),
                                "fps": file_info.get("fps"),
                                "size": file_info.get("size"),
                                "status": "success"
                            })
                            print(f"[Backend] 기존 다운로드 파일 및 정보 발견: {full_path} (Proxy: {file_info.get('proxy_path')})")
                        else:
                            info["local_path"] = full_path
                            info["status"] = "success"
                        break
    return info

@eel.expose
def download_youtube_video(url):
    """유튜브 영상을 로컬로 다운로드합니다."""
    print(f"[Backend] download_youtube_video 호출됨: {url}")
    global YT_DL_DIR
    def progress_callback(progress):
        eel.update_youtube_download_progress(progress)
    
    try:
        result = fetch_youtube_download(url, YT_DL_DIR, progress_callback)
        print(f"[Backend] download_youtube_video 결과: {result.get('status')}")
        return result
    except Exception as e:
        print(f"[Backend] download_youtube_video 오류: {e}")
        return {"status": "error", "message": str(e)}

@eel.expose
def get_save_directory():
    return app_config.get("save_dir", DEFAULT_SAVE_DIR)

@eel.expose
def select_save_directory():
    global _webview_window
    selected_dir = fetch_save_dir(_webview_window)
    if selected_dir:
        app_config["save_dir"] = selected_dir
        save_config(app_config)
        return selected_dir
    return None

@eel.btl.route('/local_file/<filepath:path>')
def server_local_file(filepath):
    import mimetypes
    from urllib.parse import unquote
    
    if '.webm' not in mimetypes.types_map:
        mimetypes.add_type('video/webm', '.webm')

    filepath = unquote(filepath)
    # print(f"[Server] Requesting local file: {filepath}")
    
    if platform.system() == 'Windows':
        if filepath.startswith('/') and (len(filepath) >= 3 and filepath[1:3] == ':/' or filepath[1:3] == ':\\'):
            filepath = filepath.lstrip('/')
        filepath = filepath.replace('\\', '/')
    else:
        if not filepath.startswith('/'):
            filepath = '/' + filepath
    
    # print(f"[Server] Resolved path: {filepath}")
    if not os.path.exists(filepath):
        print(f"[Server] File NOT found: {filepath}")
        return bottle.HTTPError(404, "File not found")

    root_dir = os.path.dirname(filepath)
    file_name = os.path.basename(filepath)
    
    mime_type, _ = mimetypes.guess_type(filepath)
    if not mime_type:
        mime_type = 'video/webm' if filepath.lower().endswith('.webm') else 'video/mp4'
        
    # print(f"[Server] Serving file: {file_name} from {root_dir} (Mime: {mime_type})")
    response = bottle.static_file(file_name, root=root_dir, mimetype=mime_type)
    response.set_header('Accept-Ranges', 'bytes')
    response.set_header('Access-Control-Allow-Origin', '*')
    
    return response

@eel.btl.route('/yt_proxy')
def youtube_proxy_stream():
    import subprocess
    import imageio_ffmpeg
    
    video_url = bottle.request.query.v
    audio_url = bottle.request.query.a
    ss = bottle.request.query.ss or "0"
    
    if not video_url:
        return bottle.HTTPError(400, "Missing video URL")
        
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    
    # -ss를 입력 파일 앞에 두어 매우 빠른 시킹 구현 (Fast Seek)
    cmd = [ffmpeg_exe, "-ss", str(ss), "-i", video_url]
    
    if audio_path_val := audio_url:
        cmd.extend(["-ss", str(ss), "-i", audio_path_val])
        cmd.extend([
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "128k",
            "-strict", "experimental"
        ])
    else:
        cmd.extend(["-c:v", "copy"])
        
    # matroska는 스트리밍에 적합하며 다양한 코덱을 copy로 담을 수 있음
    cmd.extend(["-f", "matroska", "-"])
    
    print(f"[Backend Proxy] 시킹 시작점: {ss}초")
    
    # stdout=PIPE, stderr=DEVNULL (로그가 많으면 파이프가 막힐 수 있으므로 주의)
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    
    def generate():
        try:
            while True:
                chunk = process.stdout.read(1024 * 64)
                if not chunk:
                    break
                yield chunk
        except Exception as e:
            print(f"[Backend Proxy] 스트리밍 중단: {e}")
        finally:
            if process.poll() is None:
                process.kill()
                # print("[Backend Proxy] FFmpeg 프로세스 종료됨")
                
    response = bottle.HTTPResponse(generate(), content_type='video/x-matroska')
    response.set_header('Access-Control-Allow-Origin', '*')
    response.set_header('Cache-Control', 'no-cache')
    # 브라우저가 시킹 가능한 스트림으로 인식하게 하기 위해 (실제 구현은 ss 파라미터로 처리)
    response.set_header('Accept-Ranges', 'none') 
    return response

@eel.expose
def pick_videos():
    global _webview_window
    return fetch_videos(_webview_window)

@eel.expose
def get_file_info(path):
    return fetch_file_info(path, PROXY_DIR)

@eel.expose
def request_proxy(path, file_id):
    return start_proxy_generation(path, file_id, PROXY_DIR, eel.update_proxy_progress, eel.proxy_completed)

@eel.expose
def cancel_proxy(file_id):
    return stop_proxy_generation(file_id)

@eel.expose
def open_downloads_folder():
    save_dir = app_config.get("save_dir", DEFAULT_SAVE_DIR)
    return open_folder(save_dir)

@eel.expose
def open_file_location(path):
    return fetch_file_location(path)

def get_dir_size(path):
    total = 0
    try:
        if os.path.exists(path):
            for entry in os.scandir(path):
                if entry.is_file():
                    total += entry.stat().st_size
                elif entry.is_dir():
                    total += get_dir_size(entry.path)
    except Exception:
        pass
    return total

@eel.expose
def get_cache_info():
    proxy_size = get_dir_size(PROXY_DIR)
    yt_size = get_dir_size(YT_DL_DIR)
    return {
        "proxy_size": proxy_size,
        "yt_size": yt_size,
        "total_size": proxy_size + yt_size
    }

@eel.expose
def clear_proxy_cache():
    try:
        if os.path.exists(PROXY_DIR):
            shutil.rmtree(PROXY_DIR)
            os.makedirs(PROXY_DIR, exist_ok=True)
        return {"status": "success", "new_size": 0}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def clear_youtube_cache():
    try:
        if os.path.exists(YT_DL_DIR):
            shutil.rmtree(YT_DL_DIR)
            os.makedirs(YT_DL_DIR, exist_ok=True)
        return {"status": "success", "new_size": 0}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def check_app_update():
    return check_for_updates(VERSION)

@eel.expose
def start_app_update(download_url):
    def progress_callback(percent):
        eel.update_app_download_progress(percent)
    
    def run_update():
        res = download_update(download_url, progress_callback)
        if res.get("status") == "success":
            launch_updater_and_exit(res["zip_path"], res["root_dir"])
            
    threading.Thread(target=run_update, daemon=True).start()
    return {"status": "processing"}

@eel.expose
def request_conversion(input_path, file_id, output_name, start_time, end_time, fps, resolution, num_colors=256, use_dither=False, loop_playback=True, crop_params=None, audio_path=None, speed=1.0, format_type='gif', include_audio=True, optimization_method='none', lossy_level=30, eliminate_local_palette=True, reduce_colors=256):
    save_dir = app_config.get("save_dir", DEFAULT_SAVE_DIR)
    return start_conversion(
        input_path, file_id, output_name, start_time, end_time, fps, resolution, 
        save_dir, num_colors, use_dither, loop_playback, crop_params,
        eel.update_conversion_status, eel.conversion_completed, eel.sleep, audio_path, speed, format_type, include_audio,
        optimization_method, lossy_level, eliminate_local_palette, reduce_colors
    )

@eel.expose
def convert_to_gif(input_path, output_name, start_time, end_time, fps, resolution, num_colors=256, use_dither=False, loop_playback=True):
    return {"status": "error", "message": "Async required. Use request_conversion."}

@eel.expose
def resize_window(delta_w, delta_h):
    global _webview_window
    
    # 1. macOS / pywebview implementation
    if _webview_window:
        try:
            if delta_w > 0:
                # Expand to the left: Move left AND resize wider
                _webview_window.move(_webview_window.x - delta_w, _webview_window.y)
                _webview_window.resize(_webview_window.width + delta_w, _webview_window.height)
            else:
                # Shrink from the left: Resize narrower AND move right
                _webview_window.resize(_webview_window.width + delta_w, _webview_window.height)
                _webview_window.move(_webview_window.x - delta_w, _webview_window.y)
            return True
        except Exception as e:
            print(f"[PY] Resize failed (macOS): {e}")
            return False
            
    # 2. Windows implementation (ctypes)
    if platform.system() == 'Windows':
        try:
            import ctypes
            from ctypes import wintypes
            
            user32 = ctypes.windll.user32
            # Find the window by its title specified in eel.start
            hwnd = user32.FindWindowW(None, "GIF Converter")
            if not hwnd:
                # Try partial match or fallback
                return False
                
            rect = wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            
            curr_x = rect.left
            curr_y = rect.top
            curr_w = rect.right - rect.left
            curr_h = rect.bottom - rect.top
            
            # Move and Resize simultaneously to keep right edge fixed
            # new_x = current_x - delta_w
            # new_w = current_w + delta_w
            user32.MoveWindow(hwnd, curr_x - delta_w, curr_y, curr_w + delta_w, curr_h, True)
            return True
        except Exception as e:
            print(f"[PY] Resize failed (Windows): {e}")
            return False
            
    return False

@eel.expose
def debug_log(message):
    print(f"[JS-LOG] {message}")

if __name__ == '__main__':
    print("--- 프로그램 시작 중 (Standalone App 모드) ---")
    
    # 1. 이전 세션의 고아 프로세스 정리
    kill_orphaned_ffmpegs()
    
    current_os = platform.system()

    try:
        if current_os == 'Windows':
            eel.start('index.html', 
                      size=(1280, 960), 
                      port=8889, 
                      mode='edge', 
                      cmdline_args=[
                          '--disable-http-cache',
                          '--window-name="GIF Converter"'
                      ])
        elif current_os == 'Darwin':
            import webview
            from webview.dom import DOMEventHandler

            def start_eel():
                eel.start('index.html', mode=None, port=8889, host='127.0.0.1')
            
            t = threading.Thread(target=start_eel, daemon=True)
            t.start()
            
            time.sleep(1)
            window = webview.create_window('GIF Converter', 'http://127.0.0.1:8889', width=1280, height=960, zoomable=False)
            _webview_window = window 
            
            def on_drop(e):
                try:
                    files = e.get('dataTransfer', {}).get('files', [])
                    paths = [f.get('pywebviewFullPath') for f in files if f.get('pywebviewFullPath')]
                    if paths:
                        eel.handle_dropped_files_from_python(paths)
                except Exception as ex:
                    print(f"드롭 처리 중 오류: {ex}")

            def init_logic(win):
                win.dom.document.events.dragover += DOMEventHandler(None, prevent_default=True)
                win.dom.document.events.drop += DOMEventHandler(on_drop, prevent_default=True)
            
            webview.start(init_logic, window, debug=False)
            
            # 창이 닫힌 후 모든 프로세스 정리
            cleanup_processes()
        else:
            eel.start('index.html', size=(1280, 960), port=8889, mode='default')
            
    except Exception as e:
        print(f"창 실행 실패: {e}")
        try:
            eel.start('index.html', size=(1280, 960), port=8889, mode='default')
        except: pass
    
    # 프로그램 종료 전 최종 정리
    cleanup_processes()
