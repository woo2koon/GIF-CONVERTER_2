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
from backend.services.video_service import get_file_info as fetch_file_info, start_proxy_generation
from backend.services.converter_service import start_conversion
from backend.utils.os_utils import get_os_info as fetch_os_info, open_folder, open_file_location as fetch_file_location, pick_videos as fetch_videos, select_save_directory as fetch_save_dir
from backend.utils.process_manager import cleanup_processes, kill_orphaned_ffmpegs

VERSION = "1.4.0"

# pywebview 전역 참조
try:
    import webview
except ImportError:
    webview = None
_webview_window = None 

# 프록시 저장용 폴더 설정
PROXY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".proxies")
if not os.path.exists(PROXY_DIR):
    os.makedirs(PROXY_DIR, exist_ok=True)

# Initialize Eel
eel.init('web')

@eel.expose
def get_os_info():
    return fetch_os_info()

@eel.expose
def get_youtube_info(url):
    return fetch_youtube_info(url)

@eel.expose
def get_save_directory():
    return app_config.get("save_dir", DEFAULT_SAVE_DIR)

@eel.expose
def select_save_directory():
    selected_dir = fetch_save_dir()
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
def open_downloads_folder():
    save_dir = app_config.get("save_dir", DEFAULT_SAVE_DIR)
    return open_folder(save_dir)

@eel.expose
def open_file_location(path):
    return fetch_file_location(path)

@eel.expose
def clear_proxy_cache():
    try:
        if os.path.exists(PROXY_DIR):
            shutil.rmtree(PROXY_DIR)
            os.makedirs(PROXY_DIR, exist_ok=True)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@eel.expose
def request_conversion(input_path, file_id, output_name, start_time, end_time, fps, resolution, num_colors=256, use_dither=False, loop_playback=True, crop_params=None, audio_path=None):
    save_dir = app_config.get("save_dir", DEFAULT_SAVE_DIR)
    return start_conversion(
        input_path, file_id, output_name, start_time, end_time, fps, resolution, 
        save_dir, num_colors, use_dither, loop_playback, crop_params,
        eel.update_conversion_status, eel.conversion_completed, eel.sleep, audio_path
    )

@eel.expose
def convert_to_gif(input_path, output_name, start_time, end_time, fps, resolution, num_colors=256, use_dither=False, loop_playback=True):
    return {"status": "error", "message": "Async required. Use request_conversion."}

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
            import webview
            from webview.dom import DOMEventHandler

            def start_eel():
                eel.start('index.html', mode=None, port=8889, host='127.0.0.1')
            
            t = threading.Thread(target=start_eel, daemon=True)
            t.start()
            
            time.sleep(1)
            window = webview.create_window('GIF Converter', 'http://127.0.0.1:8889', width=1280, height=850)
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
            eel.start('index.html', size=(1280, 800), port=8889, mode='default')
            
    except Exception as e:
        print(f"창 실행 실패: {e}")
        try:
            eel.start('index.html', size=(1280, 800), port=8889, mode='default')
        except: pass
    
    # 프로그램 종료 전 최종 정리
    cleanup_processes()
