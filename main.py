import eel
import os
import base64
import tkinter as tk
from tkinter import filedialog
import bottle

# Initialize Eel, pointing to the 'web' directory
eel.init('web')

# Add a route to serve local files directly to the browser
@eel.btl.route('/local_file/<filepath:path>')
def server_local_file(filepath):
    # filepath: "E:/Videos/test.mp4"
    # We need to correctly identify the drive and the path for bottle.static_file
    import bottle
    
    # On Windows, drive letters (C:, E:) are at the start
    if ':' in filepath:
        parts = filepath.split(':', 1)
        drive = parts[0] + ':'
        rest = parts[1].lstrip('/')
        response = bottle.static_file(rest, root=drive + '/')
    else:
        response = bottle.static_file(filepath, root='/')
        
    # Crucial for video seeking
    response.set_header('Accept-Ranges', 'bytes')
    return response

@eel.expose
def pick_videos():
    """Opens a native Windows file picker and returns absolute paths."""
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
    """Returns basic file info like name and size without copying."""
    try:
        return {
            "status": "success",
            "name": os.path.basename(path),
            "size": os.path.getsize(path),
            "path": path
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
        os.makedirs('outputs', exist_ok=True)
        output_path = os.path.join('outputs', output_name)
        palette_path = os.path.join('outputs', 'palette.png')
        
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        duration = float(end_time) - float(start_time)
        
        # Determine scale
        scale_filter = ""
        if "720" in resolution:
            scale_filter = "scale=-1:min(ih\\,720):flags=lanczos,"
        elif "480" in resolution:
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
    # Start the app
    eel.start('index.html', size=(1280, 800), mode='chrome')
