import yt_dlp
import time

def get_youtube_info(url):
    """yt-dlp를 사용하여 유튜브 영상 정보를 추출합니다."""
    start_time = time.time()
    print(f"\n[Backend] YouTube 정보 추출 시도: {url}")
    
    ydl_opts = {
        'format': 'bestvideo+bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'skip_download': True,
        'youtube_include_dash_manifest': True,
        'youtube_include_hls_manifest': True,
        'nocheckcertificate': True,
        'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'referer': 'https://www.youtube.com/',
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = info.get('formats', [])
            
            # 1. HLS (m3u8) 포맷들 추출 및 화질순 정렬
            hls_formats = [f for f in formats if (f.get('protocol', '').startswith('m3u8') or 'm3u8' in f.get('url', '')) and f.get('height')]
            hls_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
            
            # 2. Progressive mp4 포맷들 (영상+소리 합쳐진 단일 파일)
            prog_formats = [f for f in formats if f.get('ext') == 'mp4' and f.get('vcodec') != 'none' and f.get('acodec') != 'none' and f.get('height')]
            prog_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
            
            # 3. 비디오 전용 포맷들 (고화질)
            video_only_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('acodec') == 'none' and f.get('height')]
            video_only_formats.sort(key=lambda x: x.get('height', 0), reverse=True)

            # 4. 오디오 전용 포맷
            audio_only_formats = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
            audio_only_formats.sort(key=lambda x: x.get('abr', 0), reverse=True)

            print(f"[Backend] 발견된 HLS: {[f'{f.get('height')}p' for f in hls_formats]}")
            print(f"[Backend] 발견된 Progressive: {[f'{f.get('height')}p' for f in prog_formats]}")
            print(f"[Backend] 발견된 Video-Only: {[f'{f.get('height')}p' for f in video_only_formats[:3]]}")

            # 변환용 (최고 화질 비디오 + 최고 음질 오디오)
            best_video = video_only_formats[0] if video_only_formats else (prog_formats[0] if prog_formats else (hls_formats[0] if hls_formats else None))
            best_audio = audio_only_formats[0] if audio_only_formats else None
            
            # 재생용 포맷 결정 (사용자 요청: 미리보기는 최대 480p~720p 정도로 제한하여 성능 확보)
            play_format = None
            
            # 1. 먼저 합쳐진 MP4(Progressive) 중 720p가 있는지 확인 (가장 빠름)
            for f in prog_formats:
                if f.get('height') == 720:
                    play_format = f
                    break
            
            # 2. 720p 합쳐진 파일이 없다면, 480p 합쳐진 파일이 있는지 확인
            if not play_format:
                for f in prog_formats:
                    if f.get('height') == 480:
                        play_format = f
                        break
            
            # 3. 합쳐진 파일이 고화질이 없는 경우, 프록시 사용 (단, 미리보기 성능을 위해 480p로 제한)
            proxy_video = None
            if not play_format or play_format.get('height', 0) < 480:
                # 480p 이하의 비디오 전용 포맷 중 가장 좋은 것 찾기
                for f in video_only_formats:
                    if f.get('height') <= 480:
                        proxy_video = f
                        break
                
                if proxy_video:
                    # 프록시용 정보 설정
                    video_url = proxy_video.get('url')
                    player_url = video_url # youtube.js에서 프록시 URL로 변환됨
                    print(f"[Backend] 미리보기 성능을 위해 480p 프록시 선택 ({proxy_video.get('format_id')})")
                elif not play_format and prog_formats:
                    play_format = prog_formats[0]
            
            if play_format:
                player_url = play_format.get('url')
                video_url = best_video.get('url') if best_video else player_url
                print(f"[Backend] 직접 재생 포맷 선택: {play_format.get('height')}p")
            elif not proxy_video:
                # 최후의 수단
                player_url = best_video.get('url') if best_video else info.get('url')
                video_url = player_url

            width = info.get('width', 1280)
            height = info.get('height', 720)
            fps = (best_video.get('fps') if best_video else None) or info.get('fps')
            
            # 오디오 URL 설정
            audio_url = best_audio.get('url') if best_audio else None

            if best_video:
                width = best_video.get('width') or width
                height = best_video.get('height') or height
                print(f"[Backend] 변환용 비디오 선택: {height}p ({best_video.get('format_id')})")
            
            print(f"[Backend] YouTube 정보 추출 성공 (소요시간: {time.time() - start_time:.2f}s)")
            
            return {
                "status": "success",
                "id": info.get('id'),
                "title": info.get('title'),
                "duration": info.get('duration'),
                "width": width,
                "height": height,
                "fps": fps,
                "thumbnail": info.get('thumbnail'),
                "stream_url": player_url,          # 재생용 (합쳐진 것 우선)
                "video_url": video_url,            # 변환용 (고화질 비디오)
                "audio_url": audio_url,            # 변환용 (오디오)
                "author": info.get('uploader'),
                "preview_height": play_format.get('height') if play_format else None
            }
    except Exception as e:
        print(f"YouTube extraction error: {e}")
        return {"status": "error", "message": str(e)}
