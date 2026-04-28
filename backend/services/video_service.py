import os
import subprocess
import imageio_ffmpeg
import re
import hashlib
import threading
from backend.utils.process_manager import register_process

def get_file_info(path, proxy_dir):
    """Returns basic file info like name, size, and actual video FPS."""
    try:
        size = os.path.getsize(path)
        name = os.path.basename(path)
        
        duration = 0.0
        width = 1280
        height = 720
        fps = 30.0
        
        try:
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            cmd = [ffmpeg_exe, "-i", path]
            result = subprocess.run(cmd, stderr=subprocess.PIPE, text=True, errors='ignore')
            output = result.stderr
            
            dur_match = re.search(r"Duration:\s+(\d+):(\d+):(\d+\.\d+)", output)
            if dur_match:
                h, m, s = dur_match.groups()
                duration = int(h) * 3600 + int(m) * 60 + float(s)
            
            res_match = re.search(r",\s+(\d+)x(\d+)\s*[,\[]", output)
            if res_match:
                width = int(res_match.group(1))
                height = int(res_match.group(2))
                
            bitrate_match = re.search(r"bitrate:\s+(\d+)\s+kb/s", output)
            bitrate = int(bitrate_match.group(1)) if bitrate_match else 0
            
            fps_match = re.search(r'(\d+(?:\.\d+)?)\s+fps', output)
            if fps_match:
                fps = float(fps_match.group(1))
        except Exception as ffmpeg_err:
            bitrate = 0
            print(f"메타데이터 추출 실패: {ffmpeg_err}")

        # 기존 프록시 파일 존재 여부 확인
        proxy_path = None
        try:
            import unicodedata
            norm_path = os.path.normpath(path)
            # 유니코드 정규화 (NFC) - Mac NFD 이슈 해결
            norm_path = unicodedata.normalize('NFC', norm_path)
            file_stat = os.stat(path)
            fingerprint = f"{norm_path}_{file_stat.st_size}_{file_stat.st_mtime}"
            path_hash = hashlib.md5(fingerprint.encode('utf-8')).hexdigest()
            potential_proxy = os.path.join(proxy_dir, f"proxy_{path_hash}.mp4")
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
            "bitrate": bitrate,
            "proxy_path": proxy_path
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

active_proxy_processes = {}

def generate_proxy_worker(path, file_id, proxy_path, total_duration, ffmpeg_exe, progress_callback, complete_callback):
    """백그라운드에서 실제로 FFmpeg를 실행하는 워커입니다."""
    global active_proxy_processes
    try:
        cmd = [
            ffmpeg_exe, "-i", path,
            "-vf", "scale='min(1280,iw)':-2",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "32",
            "-c:a", "aac", "-b:a", "128k", "-y", proxy_path
        ]
        
        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, text=True, errors='ignore', universal_newlines=True)
        register_process(process)
        active_proxy_processes[file_id] = process
        
        for line in process.stderr:
            if "time=" in line and total_duration > 0:
                time_match = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", line)
                if time_match:
                    h, m, s = time_match.groups()
                    current_time = int(h) * 3600 + int(m) * 60 + float(s)
                    progress = min(99, int((current_time / total_duration) * 100))
                    progress_callback(file_id, progress)
        
        process.wait()
        if file_id in active_proxy_processes:
            del active_proxy_processes[file_id]

        if process.returncode == 0:
            progress_callback(file_id, 100)
            complete_callback(file_id, {"status": "success", "proxy_path": proxy_path})
        else:
            # -15는 보통 SIGTERM(강제 종료)에 의한 종료임
            if process.returncode == -15 or process.returncode == 15:
                print(f"[Backend] 프록시 생성 취소됨: {file_id}")
            else:
                complete_callback(file_id, {"status": "error", "message": "FFmpeg 변환 실패"})
            
    except Exception as e:
        if file_id in active_proxy_processes:
            del active_proxy_processes[file_id]
        complete_callback(file_id, {"status": "error", "message": str(e)})

def stop_proxy_generation(file_id):
    """특정 파일의 프록시 생성을 중단합니다."""
    global active_proxy_processes
    if file_id in active_proxy_processes:
        process = active_proxy_processes[file_id]
        print(f"[Backend] 프록시 생성 중단 요청: {file_id}")
        try:
            import signal
            import platform
            if platform.system() == 'Windows':
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(process.pid)], capture_output=True)
            else:
                os.kill(process.pid, signal.SIGTERM)
            
            if file_id in active_proxy_processes:
                del active_proxy_processes[file_id]
            return True
        except Exception as e:
            print(f"[Backend] 중단 실패: {e}")
            return False
    return False

def start_proxy_generation(path, file_id, proxy_dir, progress_callback, complete_callback):
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    
    try:
        import unicodedata
        norm_path = os.path.normpath(path)
        # 유니코드 정규화 (NFC) - Mac NFD 이슈 해결
        norm_path = unicodedata.normalize('NFC', norm_path)
        file_stat = os.stat(path)
        fingerprint = f"{norm_path}_{file_stat.st_size}_{file_stat.st_mtime}"
        path_hash = hashlib.md5(fingerprint.encode('utf-8')).hexdigest()
        proxy_path = os.path.join(proxy_dir, f"proxy_{path_hash}.mp4")
        
        if os.path.exists(proxy_path):
            return {"status": "success", "proxy_path": proxy_path}

        info = get_file_info(path, proxy_dir)
        total_duration = info.get('duration', 0)
        
        threading.Thread(
            target=generate_proxy_worker, 
            args=(path, file_id, proxy_path, total_duration, ffmpeg_exe, progress_callback, complete_callback), 
            daemon=True
        ).start()
        
        return {"status": "processing"}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}
