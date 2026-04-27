import os
import subprocess
import imageio_ffmpeg
import tempfile
import hashlib
import threading
from backend.utils.process_manager import register_process

def conversion_worker(file_id, input_path, output_path, start_time, end_time, fps, resolution, num_colors, use_dither, loop_playback, ffmpeg_exe, crop_params, status_callback, complete_callback, sleep_callback, audio_path=None):
    """실제로 FFmpeg 2-pass 인코딩을 수행하며 진행률을 보고합니다."""
    try:
        temp_dir = tempfile.gettempdir()
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
        res_str = str(resolution)
        
        if res_str == "original":
            scale_filter = ""
        elif ":" in res_str:
            # "width:height" format from Custom Resolution
            scale_filter = f"scale={res_str}:flags=lanczos,"
        elif "720" in res_str:
            scale_filter = "scale=w=-1:h='min(ih,720)':flags=lanczos,"
        elif "480" in res_str:
            scale_filter = "scale=w=-1:h='min(ih,480)':flags=lanczos,"
        
        print(f"[Conversion] Requested Resolution: {resolution}")
        print(f"[Conversion] Applied Scale Filter: {scale_filter}")
            
        base_filters = crop_filter + scale_filter
        dither_method = "sierra2_4a" if use_dither else "none"
        
        # --- Pass 1: Palette Generation ---
        status_callback(file_id, "팔레트 생성 중...", 5)
        sleep_callback(0.01)
        # 명시적으로 [0:v] 라벨을 사용하여 첫 번째 입력 영상에 필터 적용
        filters_pass1 = f"[0:v]{base_filters}fps={fps},palettegen=max_colors={num_colors}:stats_mode=diff"
        
        cmd1 = [ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(duration), "-i", input_path]
        # 팔레트 생성에는 오디오가 필요 없음
        cmd1.extend(["-vf", filters_pass1, palette_path])
        
        print(f"[Conversion] Pass 1 Command: {' '.join(cmd1)}")
        result1 = subprocess.run(cmd1, capture_output=True, text=True, errors='ignore')
        if result1.returncode != 0:
            print(f"[Conversion] Pass 1 Failed: {result1.stderr}")
            raise Exception(f"팔레트 생성 실패: {result1.stderr}")
        
        # --- Pass 2: GIF Encoding ---
        status_callback(file_id, "인코딩 중...", 15)
        sleep_callback(0.01)
        loop_val = "0" if loop_playback else "-1"
        
        # 입력 인덱스: 0=비디오, 1=오디오(있을 경우), 마지막=팔레트
        palette_input_index = 2 if audio_path else 1
        filters_pass2 = f"[0:v]{base_filters}fps={fps}[x];[x][{palette_input_index}:v]paletteuse=dither={dither_method}"
        
        cmd2 = [ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(duration), "-i", input_path]
        if audio_path:
            cmd2.extend(["-ss", str(start_time), "-t", str(duration), "-i", audio_path])
        cmd2.extend([
            "-i", palette_path,
            "-filter_complex", filters_pass2,
            "-loop", loop_val, 
            "-progress", "pipe:1", output_path
        ])
        
        print(f"[Conversion] Pass 2 Command: {' '.join(cmd2)}")
        process = subprocess.Popen(cmd2, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='ignore', universal_newlines=True)
        register_process(process)
        
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
                        status_callback(file_id, f"인코딩 중... {int(raw_progress)}%", mapped_progress)
                        sleep_callback(0.01)
                except:
                    pass
        
        process.wait()
        
        if os.path.exists(palette_path):
            os.remove(palette_path)
            
        if process.returncode == 0:
            complete_callback(file_id, {"status": "success", "path": output_path})
        else:
            complete_callback(file_id, {"status": "error", "message": "FFmpeg 인코딩 실패"})
            
    except Exception as e:
        complete_callback(file_id, {"status": "error", "message": str(e)})

def start_conversion(input_path, file_id, output_name, start_time, end_time, fps, resolution, save_dir, num_colors, use_dither, loop_playback, crop_params, status_callback, complete_callback, sleep_callback, audio_path=None):
    try:
        if not os.path.exists(save_dir):
            os.makedirs(save_dir, exist_ok=True)
        
        base_name, extension = os.path.splitext(output_name)
        output_path = os.path.join(save_dir, output_name)
        
        counter = 1
        while os.path.exists(output_path):
            output_path = os.path.join(save_dir, f"{base_name} ({counter}){extension}")
            counter += 1

        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        
        threading.Thread(
            target=conversion_worker, 
            args=(file_id, input_path, output_path, start_time, end_time, fps, resolution, num_colors, use_dither, loop_playback, ffmpeg_exe, crop_params, status_callback, complete_callback, sleep_callback, audio_path),
            daemon=True
        ).start()
        
        return {"status": "processing", "output_path": output_path}
    except Exception as e:
        return {"status": "error", "message": str(e)}
