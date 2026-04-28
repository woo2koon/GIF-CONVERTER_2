import yt_dlp
import time
import os
import imageio_ffmpeg

def get_youtube_info(url):
    """yt-dlp를 사용하여 유튜브 영상 정보를 추출합니다."""
    start_time = time.time()
    print(f"\n[Backend] YouTube 정보 추출 시도: {url}")
    
    # 공통 옵션
    common_opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'nocheckcertificate': True,
        'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'referer': 'https://www.youtube.com/',
    }

    ydl_opts = {
        **common_opts,
        'format': 'bestvideo+bestaudio/best',
        'skip_download': True,
        'youtube_include_dash_manifest': True,
        'youtube_include_hls_manifest': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                err_msg = str(e).lower()
                # 제한된 영상 감지 (연령 제한, 비공개, 지역 제한 등)
                if any(msg in err_msg for msg in ["age-restricted", "sign in", "private", "confirm your age"]):
                    print(f"[Backend] 제한된 영상 감지됨: {e}")
                    # 최소한의 정보라도 가져오기 위해 시도
                    basic_opts = {**common_opts, 'skip_download': True}
                    try:
                        with yt_dlp.YoutubeDL(basic_opts) as ydl_basic:
                            basic_info = ydl_basic.extract_info(url, download=False)
                            return {
                                "status": "requires_download",
                                "title": basic_info.get('title', 'Restricted Video'),
                                "thumbnail": basic_info.get('thumbnail'),
                                "duration": basic_info.get('duration'),
                                "message": "이 영상은 연령 제한 또는 유튜브 정책에 의해 직접 재생이 차단되었습니다. 계속하려면 영상을 다운로드해야 합니다."
                            }
                    except:
                        return {
                            "status": "requires_download",
                            "message": "이 영상은 유튜브 정책에 의해 접근이 제한되었습니다. 다운로드를 시도하시겠습니까?"
                        }
                raise e

            formats = info.get('formats', [])
            
            # HLS/Progressive/Video-only 포맷 분류 및 정렬
            hls_formats = [f for f in formats if (f.get('protocol', '').startswith('m3u8') or 'm3u8' in f.get('url', '')) and f.get('height')]
            hls_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
            
            prog_formats = [f for f in formats if f.get('ext') == 'mp4' and f.get('vcodec') != 'none' and f.get('acodec') != 'none' and f.get('height')]
            prog_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
            
            video_only_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('acodec') == 'none' and f.get('height')]
            video_only_formats.sort(key=lambda x: x.get('height', 0), reverse=True)

            audio_only_formats = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
            audio_only_formats.sort(key=lambda x: x.get('abr', 0), reverse=True)

            # 스트리밍 가능 여부 체크
            is_embeddable = info.get('allow_embed', True)
            
            if not is_embeddable or (not hls_formats and not prog_formats and not video_only_formats):
                msg = "이 영상은 유튜브 정책에 의해 외부 재생(Embedding)이 차단되었습니다." if not is_embeddable else "스트리밍 가능한 포맷을 찾을 수 없습니다."
                return {
                    "status": "requires_download",
                    "title": info.get('title'),
                    "thumbnail": info.get('thumbnail'),
                    "duration": info.get('duration'),
                    "message": f"{msg} 계속하려면 영상을 다운로드해야 합니다."
                }

            # 변환용 (최고 화질)
            best_video = video_only_formats[0] if video_only_formats else (prog_formats[0] if prog_formats else (hls_formats[0] if hls_formats else None))
            best_audio = audio_only_formats[0] if audio_only_formats else None
            
            video_url = best_video.get('url') if best_video else info.get('url')
            audio_url = best_audio.get('url') if best_audio else None

            # 재생용(미리보기) - 480p~720p Progressive 우선
            player_url = None
            play_format = None
            for f in prog_formats:
                if 480 <= f.get('height', 0) <= 720:
                    play_format = f
                    break
            
            proxy_video = None
            if play_format:
                player_url = play_format.get('url')
            else:
                # 합쳐진 파일이 없으면 480p 이하의 비디오 전용 포맷 중 하나를 프록시로 선택
                proxy_video = next((f for f in video_only_formats if f.get('height', 0) <= 480), None)
                player_url = proxy_video.get('url') if proxy_video else video_url

            print(f"[Backend] YouTube 정보 추출 성공 (소요시간: {time.time() - start_time:.2f}s)")
            
            return {
                "status": "success",
                "video_id": info.get('id'),
                "title": info.get('title'),
                "url": url,
                "duration": info.get('duration'),
                "width": best_video.get('width') if best_video else info.get('width'),
                "height": best_video.get('height') if best_video else info.get('height'),
                "fps": (best_video.get('fps') if best_video else None) or info.get('fps'),
                "thumbnail": info.get('thumbnail'),
                "stream_url": player_url,
                "video_url": video_url,
                "audio_url": audio_url,
                "author": info.get('uploader'),
                "preview_height": play_format.get('height') if play_format else None
            }
    except Exception as e:
        print(f"YouTube extraction error: {e}")
        return {"status": "error", "message": str(e)}

def download_youtube_video(url, output_dir, progress_callback):
    """유튜브 영상을 최고 화질로 다운로드합니다."""
    print(f"[Backend] YouTube 다운로드 시작: {url}")
    
    def ydl_progress_hook(d):
        if d['status'] == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate')
            
            if total:
                progress = (downloaded / total) * 100
                # 터미널에도 진행률 출력 (사용자가 요청한 실시간 로그 일치 작업)
                if int(progress) % 5 == 0: # 너무 자주 찍히지 않게 5% 단위로 로그 출력
                    filename = os.path.basename(d.get('filename', 'video'))
                    print(f"[Backend] Downloading: {progress:.1f}% of {total/(1024*1024):.1f}MB ({filename})")
                
                progress_callback(float(progress))
            else:
                # 바이트 정보를 알 수 없는 경우 기존 방식 유지
                p_str = d.get('_percent_str', '0%').replace('%', '').strip()
                try:
                    p_val = float(p_str)
                    progress_callback(p_val)
                except:
                    pass
        elif d['status'] == 'finished':
            print(f"[Backend] Download phase finished: {os.path.basename(d.get('filename', ''))}")
            progress_callback(100.0)

    def ydl_postprocessor_hook(d):
        if d['status'] == 'started' and d['postprocessor'] == 'MoveFiles':
            print(f"[Backend] Finalizing files...")
        if d['status'] == 'started' and d['postprocessor'] == 'FFmpegMerger':
            print(f"[Backend] Merging video and audio streams...")
            # 병합 시작 시 100%에 가까운 값을 보내거나 특수 신호를 보낼 수 있음
            progress_callback(99.9)

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    ydl_opts = {
        'format': 'bestvideo+bestaudio/best',
        'outtmpl': f'{output_dir}/[%(title)s] [%(id)s].%(ext)s',
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'progress_hooks': [ydl_progress_hook],
        'postprocessor_hooks': [ydl_postprocessor_hook],
        'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'ffmpeg_location': ffmpeg_exe,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            file_path = ydl.prepare_filename(info)
            # 합쳐진 파일이 있을 경우 .mkv나 .mp4로 저장됨
            if not os.path.exists(file_path):
                # 확장자가 변경되었을 가능성 (예: mkv로 합쳐짐)
                base_path = os.path.splitext(file_path)[0]
                for ext in ['.mp4', '.mkv', '.webm']:
                    if os.path.exists(base_path + ext):
                        file_path = base_path + ext
                        break
            
            return {
                "status": "success",
                "path": file_path,
                "title": info.get('title'),
                "duration": info.get('duration')
            }
    except Exception as e:
        print(f"YouTube download error: {e}")
        return {"status": "error", "message": str(e)}
