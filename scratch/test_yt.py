import yt_dlp
import sys

url = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' # Google I/O 2023 in 10 minutes
ydl_opts = {
    'quiet': True,
    'no_warnings': True,
    'noplaylist': True,
    'skip_download': True,
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        print(f"SUCCESS: {info.get('title')}")
except Exception as e:
    print(f"FAILURE: {e}")
    sys.exit(1)
