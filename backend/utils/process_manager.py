import subprocess
import os
import signal
import platform

_running_processes = []

def register_process(proc):
    """실행 중인 프로세스를 등록합니다."""
    _running_processes.append(proc)

def cleanup_processes():
    """등록된 모든 프로세스를 강제로 종료합니다."""
    global _running_processes
    if not _running_processes:
        return

    print(f"[ProcessManager] Cleaning up {len(_running_processes)} processes...")
    for proc in _running_processes:
        try:
            if proc.poll() is None:  # 아직 실행 중인 경우
                print(f"[ProcessManager] Terminating process {proc.pid}")
                if platform.system() == 'Windows':
                    # Windows에서는 taskkill을 사용하여 트리 전체를 종료하는 것이 안전함
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(proc.pid)], capture_output=True)
                else:
                    # Unix계열에서는 SIGTERM 후 안 되면 SIGKILL
                    os.kill(proc.pid, signal.SIGTERM)
                
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    print(f"[ProcessManager] Process {proc.pid} didn't stop, killing...")
                    if platform.system() != 'Windows':
                        os.kill(proc.pid, signal.SIGKILL)
        except Exception as e:
            print(f"[ProcessManager] Error terminating process: {e}")
    _running_processes = []

def kill_orphaned_ffmpegs():
    """앱 시작 시 시스템에 남아있는 고아 ffmpeg 프로세스들을 정리합니다."""
    print("[ProcessManager] Checking for orphaned ffmpeg processes...")
    try:
        current_os = platform.system()
        if current_os == 'Windows':
            subprocess.run(['taskkill', '/F', '/IM', 'ffmpeg.exe', '/T'], capture_output=True, text=True)
        elif current_os == 'Darwin' or current_os == 'Linux':
            # imageio_ffmpeg가 사용하는 특정 바이너리 패턴 위주로 종료
            subprocess.run(['pkill', '-f', 'ffmpeg-macos'], capture_output=True, text=True)
            subprocess.run(['pkill', '-f', 'ffmpeg-linux'], capture_output=True, text=True)
    except Exception as e:
        print(f"[ProcessManager] Orphaned cleanup failed: {e}")
