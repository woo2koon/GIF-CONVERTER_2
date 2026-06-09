import os
import subprocess
import imageio_ffmpeg
import tempfile
import hashlib
import threading
from backend.utils.process_manager import register_process

def generate_dynamic_crop_expression(keyframes, attr, base_val):
    """
    FFmpeg용 동적 보간 수식을 생성합니다.
    keyframes: [{'time': 0, 'x': 10, ...}, ...]
    attr: 'x', 'y', 'w', 'h' 중 하나
    base_val: 'iw' (가로) 또는 'ih' (세로)
    """
    if not keyframes or len(keyframes) < 2:
        val = keyframes[0].get(attr, 0) / 100.0 if keyframes else 0
        return f"{base_val}*{val:.4f}"

    # 시간 순 정렬 (이미 정렬되어 있을 것이지만 안전을 위해)
    keyframes = sorted(keyframes, key=lambda k: k['time'])
    
    # 마지막 지점부터 역순으로 if 문 중첩 생성
    # if(between(t, t1, t2), v1 + (v2-v1)*(t-t1)/(t2-t1), ...)
    expr = f"{base_val}*({keyframes[-1][attr]/100.0:.4f})" # 기본값 (마지막 키프레임 이후)
    
    for i in range(len(keyframes) - 2, -1, -1):
        k1 = keyframes[i]
        k2 = keyframes[i+1]
        t1, t2 = k1['time'], k2['time']
        v1, v2 = k1[attr] / 100.0, k2[attr] / 100.0
        
        if t2 - t1 <= 0: continue
        
        # 보간 수식: v1 + (v2-v1)*(t-t1)/(t2-t1)
        segment_expr = f"{v1:.4f} + ({v2-v1:.4f})*(t-{t1:.4f})/({t2-t1:.4f})"
        expr = f"if(between(t,{t1:.4f},{t2:.4f}),{base_val}*({segment_expr}),{expr})"
        
    # 첫 번째 키프레임 이전 처리
    first_val = keyframes[0][attr] / 100.0
    expr = f"if(lt(t,{keyframes[0]['time']:.4f}),{base_val}*({first_val:.4f}),{expr})"
    
    return expr

def conversion_worker(file_id, input_path, output_path, start_time, end_time, fps, resolution, num_colors, use_dither, loop_playback, ffmpeg_exe, crop_params, status_callback, complete_callback, sleep_callback, audio_path=None, speed=1.0, format_type='gif', include_audio=True, optimization_method='none', lossy_level=30, eliminate_local_palette=True, reduce_colors=256):
    """실제로 FFmpeg 2-pass 인코딩을 수행하며 진행률을 보고합니다."""
    try:
        temp_dir = tempfile.gettempdir()
        palette_hash = hashlib.md5(f"{file_id}_{start_time}_{end_time}".encode()).hexdigest()
        palette_path = os.path.join(temp_dir, f'palette_{palette_hash}.png')
        
        input_duration = float(end_time) - float(start_time)
        output_duration = input_duration / float(speed)
        
        # 해상도 필터 설정 (동적 크롭 대응)
        crop_filter = ""
        if crop_params and isinstance(crop_params, dict):
            keyframes = crop_params.get('keyframes', [])
            
            # 키프레임 데이터가 있으면 동적 크롭 필터 생성
            if keyframes and len(keyframes) > 1:
                # FFmpeg -ss 옵션 이후에 필터가 적용되므로 시간을 상대시간으로 변환해야 함
                rel_keyframes = []
                for kf in keyframes:
                    rel_kf = kf.copy()
                    rel_kf['time'] = max(0, kf['time'] - start_time)
                    rel_keyframes.append(rel_kf)
                
                expr_w = generate_dynamic_crop_expression(rel_keyframes, 'w', 'iw')
                expr_h = generate_dynamic_crop_expression(rel_keyframes, 'h', 'ih')
                expr_x = generate_dynamic_crop_expression(rel_keyframes, 'x', 'iw')
                expr_y = generate_dynamic_crop_expression(rel_keyframes, 'y', 'ih')
                
                # eval=frame 옵션 없이도 x, y 수식에 t가 포함되면 자동으로 매 프레임 계산됩니다.
                crop_filter = f"crop=w='{expr_w}':h='{expr_h}':x='{expr_x}':y='{expr_y}',"
            else:
                # 기존 정적 크롭
                cw, ch = crop_params.get('w', 100) / 100.0, crop_params.get('h', 100) / 100.0
                cx, cy = crop_params.get('x', 0) / 100.0, crop_params.get('y', 0) / 100.0
                crop_filter = f"crop=iw*{cw:.4f}:ih*{ch:.4f}:iw*{cx:.4f}:ih*{cy:.4f},"

        scale_filter = ""
        res_str = str(resolution)
        
        if res_str == "original":
            scale_filter = ""
        elif ":" in res_str:
            scale_filter = f"scale={res_str}:flags=lanczos,"
        elif "720" in res_str:
            scale_filter = "scale=w=-1:h='min(ih,720)':flags=lanczos,"
        elif "480" in res_str:
            scale_filter = "scale=w=-1:h='min(ih,480)':flags=lanczos,"
        
        speed_filter = ""
        if float(speed) != 1.0:
            speed_filter = f"setpts=(1/{speed})*PTS,"
            
        base_filters = crop_filter + scale_filter + speed_filter
        dither_method = "sierra2_4a" if use_dither else "none"
        
        if format_type == 'gif':
            # --- Pass 1: Palette Generation ---
            status_callback(file_id, "팔레트 생성 중...", 5)
            sleep_callback(0.01)
            filters_pass1 = f"[0:v]{base_filters}fps={fps},palettegen=max_colors={num_colors}:stats_mode=diff"
            
            cmd1 = [ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(input_duration), "-i", input_path]
            cmd1.extend(["-vf", filters_pass1, palette_path])
            
            result1 = subprocess.run(cmd1, capture_output=True, text=True, errors='ignore')
            if result1.returncode != 0:
                raise Exception(f"팔레트 생성 실패: {result1.stderr}")
            
            # --- Pass 2: GIF Encoding ---
            status_callback(file_id, "GIF 인코딩 중...", 15)
            sleep_callback(0.01)
            loop_val = "0" if loop_playback else "-1"
            
            palette_input_index = 2 if audio_path else 1
            filters_pass2 = f"[0:v]{base_filters}fps={fps}[x];[x][{palette_input_index}:v]paletteuse=dither={dither_method}"
            
            cmd2 = [ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(input_duration), "-i", input_path]
            if audio_path:
                cmd2.extend(["-ss", str(start_time), "-t", str(input_duration), "-i", audio_path])
            cmd2.extend([
                "-i", palette_path,
                "-filter_complex", filters_pass2,
                "-loop", loop_val, 
                "-progress", "pipe:1", output_path
            ])
            
        elif format_type == 'mp4':
            status_callback(file_id, "MP4 인코딩 중...", 10)
            sleep_callback(0.01)
            
            # FPS가 0이면 원본 유지
            if int(fps) > 0:
                video_filter = f"{base_filters}fps={fps}"
            else:
                video_filter = base_filters
                
            if video_filter.endswith(","): video_filter = video_filter[:-1]
                
            cmd2 = [ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(input_duration), "-i", input_path]
            
            if include_audio and audio_path:
                cmd2.extend(["-ss", str(start_time), "-t", str(input_duration), "-i", audio_path])
                cmd2.extend(["-map", "0:v:0", "-map", "1:a:0"])
            elif include_audio:
                cmd2.extend(["-map", "0:v:0", "-map", "0:a:0?"])
            else:
                cmd2.extend(["-map", "0:v:0"])
                
            cmd2.extend([
                "-vf", video_filter,
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-pix_fmt", "yuv420p"
            ])
            
            if include_audio:
                cmd2.extend(["-c:a", "aac", "-b:a", "128k"])
                
            cmd2.extend(["-progress", "pipe:1", output_path])
            
        elif format_type == 'webp':
            status_callback(file_id, "WebP 인코딩 중...", 10)
            sleep_callback(0.01)
            
            loop_val = "0" if loop_playback else "1"
            
            # FPS가 0이면 원본 유지
            if int(fps) > 0:
                video_filter = f"{base_filters}fps={fps}"
            else:
                video_filter = base_filters
                
            if video_filter.endswith(","): video_filter = video_filter[:-1]
                
            cmd2 = [ffmpeg_exe, "-y", "-ss", str(start_time), "-t", str(input_duration), "-i", input_path]
            cmd2.extend([
                "-vf", video_filter,
                "-c:v", "libwebp",
                "-lossless", "0",
                "-qscale", "80",
                "-loop", loop_val,
                "-progress", "pipe:1", output_path
            ])
        
        process = subprocess.Popen(
            cmd2, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=True, 
            encoding='utf-8', 
            errors='replace', 
            universal_newlines=True
        )
        register_process(process)
        
        last_lines = []
        while True:
            line = process.stdout.readline()
            if not line: break
            last_lines.append(line.strip())
            if len(last_lines) > 10: last_lines.pop(0)
            if "out_time_us=" in line:
                try:
                    time_us = int(line.split('=')[1])
                    current_time = time_us / 1000000.0
                    if output_duration > 0:
                        raw_progress = min(100, (current_time / output_duration) * 100)
                        mapped_progress = min(100, int(15 + (raw_progress * 0.85)))
                        status_callback(file_id, f"인코딩 중... {int(raw_progress)}%", mapped_progress)
                        sleep_callback(0.01)
                except: pass
        
        process.wait()
        if os.path.exists(palette_path): os.remove(palette_path)
            
        if process.returncode == 0:
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                # --- Post Processing: Gifsicle Optimization ---
                if format_type == 'gif' and optimization_method != 'none':
                    status_callback(file_id, "Gifsicle 최적화 적용 중...", 95)
                    sleep_callback(0.01)
                    
                    # Locate gifsicle binary
                    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                    gifsicle_exe = os.path.join(backend_dir, 'bin', 'gifsicle.exe')
                    if not os.path.exists(gifsicle_exe):
                        gifsicle_exe = 'gifsicle' # fallback to system path
                        
                    # Prepare Gifsicle commands
                    gifsicle_cmd = [gifsicle_exe]
                    
                    # 1. Unoptimize if coalesce is selected
                    if optimization_method == 'coalesce':
                        gifsicle_cmd.append('--unoptimize')
                    else:
                        # Optimization Level: -O2 (transparency) or -O3
                        gifsicle_cmd.append('-O3')
                        
                    # 2. Lossy parameter
                    if optimization_method == 'lossy':
                        # ezgif level 15 usually maps to --lossy=30. Let's pass the level directly
                        gifsicle_cmd.append(f'--lossy={lossy_level}')
                        
                    # 3. Colors Reduction
                    if reduce_colors < 256:
                        gifsicle_cmd.extend(['--colors', str(reduce_colors)])
                        
                    # 4. Eliminate Local Palettes
                    # Note: Gifsicle automatically optimizes out local color tables during -O3/colors optimization.
                    # No specific command-line flag exists.
                        
                    # Target files
                    temp_opt_path = output_path + '.opt.gif'
                    gifsicle_cmd.extend([output_path, '-o', temp_opt_path])
                    
                    try:
                        opt_result = subprocess.run(gifsicle_cmd, capture_output=True, text=True, errors='ignore')
                        if opt_result.returncode == 0 and os.path.exists(temp_opt_path) and os.path.getsize(temp_opt_path) > 0:
                            # Replace original file with optimized one
                            os.replace(temp_opt_path, output_path)
                            print(f"[Backend Gifsicle] Optimized GIF successfully: {output_path}")
                        else:
                            print(f"[Backend Gifsicle] Gifsicle failed: {opt_result.stderr}. Using original FFmpeg output.")
                            if os.path.exists(temp_opt_path): os.remove(temp_opt_path)
                    except Exception as g_err:
                        print(f"[Backend Gifsicle] Error running Gifsicle: {g_err}. Using original FFmpeg output.")
                        if os.path.exists(temp_opt_path): os.remove(temp_opt_path)
                
                complete_callback(file_id, {"status": "success", "path": output_path})
            else:
                complete_callback(file_id, {"status": "error", "message": "파일 생성 실패"})
        else:
            error_msg = "\n".join(last_lines)
            complete_callback(file_id, {"status": "error", "message": f"FFmpeg 에러: {error_msg}"})
            
    except Exception as e:
        complete_callback(file_id, {"status": "error", "message": str(e)})

def start_conversion(input_path, file_id, output_name, start_time, end_time, fps, resolution, save_dir, num_colors, use_dither, loop_playback, crop_params, status_callback, complete_callback, sleep_callback, audio_path=None, speed=1.0, format_type='gif', include_audio=True, optimization_method='none', lossy_level=30, eliminate_local_palette=True, reduce_colors=256):
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
            args=(file_id, input_path, output_path, start_time, end_time, fps, resolution, num_colors, use_dither, loop_playback, ffmpeg_exe, crop_params, status_callback, complete_callback, sleep_callback, audio_path, speed, format_type, include_audio, optimization_method, lossy_level, eliminate_local_palette, reduce_colors),
            daemon=True
        ).start()
        
        return {"status": "processing", "output_path": output_path}
    except Exception as e:
        return {"status": "error", "message": str(e)}
