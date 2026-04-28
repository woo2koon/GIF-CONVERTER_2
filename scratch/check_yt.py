import yt_dlp
import json

ydl_opts = {
    'quiet': True,
    'noplaylist': True,
}

url = 'https://youtu.be/a14t9CkBRWI'
try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        result = {
            'title': info.get('title'),
            'allow_embed': info.get('allow_embed'),
            'age_limit': info.get('age_limit'),
            'availability': info.get('availability'),
            'formats_count': len(info.get('formats', [])),
            'uploader': info.get('uploader')
        }
        print(json.dumps(result, indent=2))
except Exception as e:
    print(f"Error: {e}")
