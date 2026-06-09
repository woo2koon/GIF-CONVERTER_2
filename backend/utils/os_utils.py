import os
import platform
import subprocess

def get_os_info():
    return platform.system()

def open_folder(path):
    """지정한 폴더를 엽니다."""
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)
        
    try:
        if platform.system() == 'Darwin':
            subprocess.run(['open', path])
        elif platform.system() == 'Windows':
            os.startfile(path)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def open_file_location(path):
    """파일이 있는 폴더를 열고 해당 파일을 선택 상태로 표시합니다."""
    try:
        if platform.system() == 'Windows':
            subprocess.run(['explorer', '/select,', os.path.normpath(path)])
        elif platform.system() == 'Darwin':
            subprocess.run(['open', '-R', path])
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def pick_videos(webview_window=None):
    """Opens a native file picker and returns absolute paths."""
    print(f"\n[Backend] pick_videos 호출됨 (OS: {platform.system()})")
    
    if platform.system() == 'Darwin':
        # 1. pywebview (Fastest & Native on Mac)
        if webview_window is not None:
            try:
                import webview
                print("[Backend] pywebview create_file_dialog 호출...")
                file_types = ('Video Files (*.mp4;*.mov;*.avi;*.mkv;*.wmv;*.webm)', 'All files (*.*)')
                result = webview_window.create_file_dialog(
                    webview.FileDialog.OPEN,
                    allow_multiple=True,
                    file_types=file_types
                )
                if result:
                    print(f"[Backend] pywebview 파일 선택 성공: {len(result)}개")
                    return list(result)
                else:
                    return [] # User cancelled
            except Exception as e:
                print(f"[Backend] pywebview 다이얼로그 실패: {e}")

        # 2. AppleScript (Fallback)
        script = '''
        tell current application
            activate
            set theFiles to choose file with prompt "비디오 파일을 선택하세요" of type {"public.movie", "org.webmproject.webm", "mp4", "mov", "avi", "mkv", "wmv"} with multiple selections allowed
            set out to ""
            repeat with aFile in theFiles
                set out to out & POSIX path of aFile & "\n"
            end repeat
        end tell
        out
        '''
        try:
            print("[Backend] AppleScript 호출 시도 (Fallback)...")
            process = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stdout, stderr = process.communicate()
            if process.returncode == 0 and stdout.strip():
                paths = stdout.strip().split('\n')
                print(f"[Backend] AppleScript 파일 선택 성공: {len(paths)}개")
                return paths
        except Exception as e:
            print(f"[Backend] AppleScript 실패: {e}")
        return []
    else:
        # Windows/Linux: tkinter (스레드 세이프 호출 보강)
        print("[Backend] Tkinter 호출 시도...")
        import queue
        import threading
        
        res_queue = queue.Queue()
        
        def ask_files():
            try:
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
                res_queue.put(list(files))
            except Exception as e:
                res_queue.put(e)
                
        t = threading.Thread(target=ask_files)
        t.start()
        t.join()
        
        res = res_queue.get()
        if isinstance(res, Exception):
            print(f"[Backend] Tkinter 스레드 에러: {res}")
            return []
        print(f"[Backend] 파일 선택 성공: {len(res)}개")
        return res

def select_save_directory(webview_window=None):
    """지정한 저장 폴더를 선택하는 다이얼로그를 띄웁니다."""
    print(f"\n[Backend] select_save_directory 호출됨 (OS: {platform.system()})")
    try:
        if platform.system() == 'Darwin':
            # 1. AppleScript (Proved to be more reliable on Mac for folder picking)
            print("[Backend] AppleScript folder picker 호출...")
            script = '''
            tell current application
                activate
                set theFolder to choose folder with prompt "저장 폴더를 선택하세요"
                POSIX path of theFolder
            end tell
            '''
            try:
                process = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                stdout, stderr = process.communicate()
                if process.returncode == 0:
                    selected_dir = stdout.strip()
                    print(f"[Backend] AppleScript 폴더 선택 성공: {selected_dir}")
                    return selected_dir
            except Exception as as_e:
                print(f"[Backend] AppleScript 폴더 다이얼로그 실패: {as_e}")

            # 2. pywebview (Fallback)
            if webview_window is not None:
                try:
                    import webview
                    print("[Backend] pywebview directory dialog 호출...")
                    result = webview_window.create_file_dialog(
                        webview.FileDialog.DIRECTORY
                    )
                    if result:
                        selected_dir = result[0] if isinstance(result, (list, tuple)) else result
                        print(f"[Backend] pywebview 폴더 선택 성공: {selected_dir}")
                        return selected_dir
                except Exception as e:
                    print(f"[Backend] pywebview 폴더 다이얼로그 실패: {e}")
        else:
            # Windows/Linux: tkinter (스레드 세이프 호출 보강)
            import queue
            import threading
            
            res_queue = queue.Queue()
            
            def ask_dir():
                try:
                    import tkinter as tk
                    from tkinter import filedialog
                    root = tk.Tk()
                    root.withdraw()
                    root.attributes("-topmost", True)
                    selected_dir = filedialog.askdirectory(title="저장 폴더를 선택하세요")
                    root.destroy()
                    res_queue.put(selected_dir)
                except Exception as e:
                    res_queue.put(e)
                    
            t = threading.Thread(target=ask_dir)
            t.start()
            t.join()
            
            selected_dir = res_queue.get()
            if isinstance(selected_dir, Exception):
                print(f"[Backend] Tkinter 스레드 에러: {selected_dir}")
                return None
            if selected_dir:
                return os.path.normpath(selected_dir)
    except Exception as e:
        print(f"Folder selection error: {e}")
    return None
