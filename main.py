import eel
import os
import base64
import tkinter as tk
from tkinter import filedialog
import bottle

# Initialize Eel, pointing to the 'web' directory
eel.init('web')

@eel.btl.route('/local_file/<filepath:path>')
def server_local_file(filepath):
    import os
    import platform
    import mimetypes
    import base64
    from urllib.parse import unquote

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
        mime_type = 'video/mp4'
        
    response = bottle.static_file(file_name, root=root_dir, mimetype=mime_type)
    response.set_header('Accept-Ranges', 'bytes')
    response.set_header('Access-Control-Allow-Origin', '*')
    
    return response

@eel.expose
def pick_videos():
    """Opens a native file picker and returns absolute paths. Uses AppleScript on Mac to avoid hangs."""
    import platform
    import subprocess
    
    if platform.system() == 'Darwin': # macOS
        script = '''
        set theFiles to choose file with prompt "비디오 파일 선택" of type {"mp4", "mov", "avi", "mkv", "wmv", "webm"} with multiple selections allowed
        set out to ""
        repeat with aFile in theFiles
            set out to out & POSIX path of aFile & "\n"
        end repeat
        return out
        '''
        try:
            output = subprocess.check_output(['osascript', '-e', script]).decode('utf-8').strip()
            if not output:
                return []
            return output.split('\n')
        except Exception:
            return []
    else:
        # Windows/Linux: use tkinter
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        
        files = filedialog.askopenfilenames(
            title="비디오 파일 선택",
            filetypes=[("Video files", "*.mp4 *.mov *.avi *.mkv *.wmv *.webm")]
        )
        
        root.destroy()
        return list(files)

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

        return {
            "status": "success",
            "name": name,
            "size": size,
            "path": path,
            "duration": duration,
            "width": width,
            "height": height,
            "fps": fps
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

import subprocess
import imageio_ffmpeg

@eel.expose
def convert_to_gif(input_path, output_name, start_time, end_time, fps, resolution, num_colors=256, use_dither=False, loop_playback=True):
    """
    Converts a segment of MP4 to GIF using FFmpeg 2-pass method for Adobe-level quality.
    """
    try:
        # 사용자의 시스템 다운로드 폴더 경로 가져오기
        downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
        
        # 파일 중복 확인 및 이름 자동 변경 (예: 파일명 (1).gif)
        base_name, extension = os.path.splitext(output_name)
        output_path = os.path.join(downloads_path, output_name)
        
        counter = 1
        while os.path.exists(output_path):
            output_path = os.path.join(downloads_path, f"{base_name} ({counter}){extension}")
            counter += 1
            
        # 임시 작업용 팔레트 파일 경로 (시스템 임시 폴더 사용)
        import tempfile
        temp_dir = tempfile.gettempdir()
        palette_path = os.path.join(temp_dir, 'gif_palette_tmp.png')
        
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        duration = float(end_time) - float(start_time)
        
        # Determine scale
        scale_filter = ""
        if ":" in str(resolution):
            # Custom resolution like "1280:720"
            scale_filter = f"scale={resolution}:flags=lanczos,"
        elif "720" in str(resolution):
            scale_filter = "scale=-1:min(ih\\,720):flags=lanczos,"
        elif "480" in str(resolution):
            scale_filter = "scale=-1:min(ih\\,480):flags=lanczos,"
            
        # Determine dither
        dither_method = "sierra2_4a" if use_dither else "none"
        
        # Pass 1: Generate optimal palette
        filters_pass1 = f"{scale_filter}fps={int(fps)},palettegen=max_colors={num_colors}:stats_mode=diff"
        cmd1 = [
            ffmpeg_exe, "-y",
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", input_path,
            "-vf", filters_pass1,
            palette_path
        ]
        subprocess.run(cmd1, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Pass 2: Generate GIF using the palette
        loop_val = "0" if loop_playback else "-1"
        filters_pass2 = f"{scale_filter}fps={int(fps)}[x];[x][1:v]paletteuse=dither={dither_method}"
        cmd2 = [
            ffmpeg_exe, "-y",
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", input_path,
            "-i", palette_path,
            "-filter_complex", filters_pass2,
            "-loop", loop_val,
            output_path
        ]
        subprocess.run(cmd2, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        # Clean up palette
        if os.path.exists(palette_path):
            os.remove(palette_path)
            
        # Read the generated GIF and return as base64
        with open(output_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
        # Open the Downloads folder automatically to show the result
        try:
            if platform.system() == 'Darwin':
                subprocess.run(['open', downloads_path])
            elif platform.system() == 'Windows':
                os.startfile(downloads_path)
        except:
            pass

        return {
            "status": "success", 
            "path": output_path, 
            "data": f"data:image/gif;base64,{encoded_string}"
        }
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": f"FFmpeg Error: {e.stderr.decode('utf-8', errors='ignore')}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

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
        if current_os == 'Darwin':
            # 맥: pywebview 네이티브 엔진 사용 - 크롬 아이콘 방지 및 사파리 코덱 활용
            # 맥에서는 pywebview가 독(Dock) 아이콘 관리와 MP4 재생에 가장 탁월합니다.
            import webview
            import threading
            import time

            def start_eel():
                eel.start('index.html', mode=None, port=8889, host='127.0.0.1')
            
            t = threading.Thread(target=start_eel, daemon=True)
            t.start()
            
            time.sleep(1) # 서버 시작 대기
            webview.create_window('GIF Converter', 'http://127.0.0.1:8889', width=1280, height=850)
            webview.start()
        else:
            # 기타 (리눅스 등)
            eel.start('index.html', size=(1280, 800), port=8889, mode='default')
            
    except Exception as e:
        print(f"창 실행 실패: {e}")
        eel.start('index.html', size=(1280, 800), port=8889, mode='default')
