function formatTime(seconds) {
    if (isNaN(seconds) || seconds === undefined || seconds === null) seconds = 0;
    
    // 우측 슬라이더와 무관하게, 영상 원본의 진짜 프레임 레이트 사용
    const sourceFps = window.selectedFileObj && window.selectedFileObj.fps ? window.selectedFileObj.fps : 30.0;
    
    const fpsRound = Math.round(sourceFps);
    const totalFrames = Math.round(seconds * sourceFps);
    
    const mins = Math.floor(totalFrames / (fpsRound * 60));
    const secs = Math.floor((totalFrames / fpsRound) % 60);
    const frames = totalFrames % fpsRound;
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

/**
 * 파일명에 사용하기 적합한 타임태그 문자열을 반환합니다. (예: 01m23s)
 */
function formatTimeForFilename(seconds) {
    if (isNaN(seconds) || seconds === undefined || seconds === null) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}m${s.toString().padStart(2, '0')}s`;
}

function updateStatus(text) {
    const statusMsg = document.getElementById('status-msg');
    const statusBar = document.getElementById('status-bar');
    if (!statusMsg || !statusBar) return;

    if (!text || text === "대기 중...") {
        statusBar.classList.add('opacity-0', 'scale-95');
        statusBar.classList.remove('opacity-100', 'scale-100');
    } else {
        statusMsg.textContent = text;
        statusBar.classList.remove('opacity-0', 'scale-95');
        statusBar.classList.add('opacity-100', 'scale-100');
    }
}

function updateToggleUI(toggle, active) {
    if (!toggle) return;
    toggle.dataset.active = active ? 'true' : 'false';
    const circle = toggle.children[0];
    if (active) {
        toggle.classList.add('bg-primary');
        toggle.classList.remove('bg-slate-300');
        if (circle) circle.classList.add('translate-x-5');
    } else {
        toggle.classList.remove('bg-primary');
        toggle.classList.add('bg-slate-300');
        if (circle) circle.classList.remove('translate-x-5');
    }
}

function getActiveSegment(fileObj) {
    if (!fileObj) return null;
    if (fileObj.activeSegmentId) {
        return fileObj.segments.find(s => s.id === fileObj.activeSegmentId) || fileObj.draft;
    }
    return fileObj.draft;
}

function getCurrentEffectiveRatio() {
    if (window.isCropMode && window.cropBoxState && window.selectedFileObj) {
        const croppedW = window.selectedFileObj.width * (window.cropBoxState.w / 100);
        const croppedH = window.selectedFileObj.height * (window.cropBoxState.h / 100);
        return croppedW / croppedH;
    }
    if (window.selectedFileObj) {
        return window.selectedFileObj.width / window.selectedFileObj.height;
    }
    return 16 / 9;
}

/**
 * 전역 토스트 알림을 띄웁니다.
 */
function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 transition-all duration-300 opacity-0 translate-y-4 pointer-events-auto border border-white/10';
    
    toast.innerHTML = `
        <span class="material-symbols-outlined text-rose-400 text-[20px]">error</span>
        <span class="text-sm font-bold tracking-tight">${message}</span>
    `;

    container.appendChild(toast);

    // 등장 애니메이션
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-4');
        toast.classList.add('opacity-100', 'translate-y-0');
    });

    // 자동 제거
    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', '-translate-y-4');
        setTimeout(() => toast.remove(), 500);
    }, duration);
}
