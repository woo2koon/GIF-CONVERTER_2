/**
 * Keyframe Management for Dynamic Cropping
 */

function initKeyframeUI() {
    const addBtn = document.getElementById('add-keyframe-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addCurrentKeyframe);
    }

    // Start a loop to update crop preview during playback based on keyframes
    updateKeyframePreviewLoop();
}

function addCurrentKeyframe() {
    const seg = getActiveSegment(window.selectedFileObj);
    if (!seg) return;

    const video = document.getElementById('main-player');
    const fps = (window.selectedFileObj && window.selectedFileObj.fps) ? window.selectedFileObj.fps : 30;
    
    // 현재 시간을 정확한 프레임 위치로 스냅 (Math.round 사용)
    const snappedTime = Math.round(video.currentTime * fps) / fps;

    if (!seg.keyframes) seg.keyframes = [];

    // 스냅된 시간을 기준으로 동일 프레임 여부 확인
    const existingIdx = seg.keyframes.findIndex(kf => Math.abs(kf.time - snappedTime) < (1 / (fps * 2)));

    const newKeyframe = {
        time: snappedTime,
        ...window.cropBoxState
    };

    if (existingIdx !== -1) {
        seg.keyframes[existingIdx] = newKeyframe;
        showToast("키프레임이 업데이트되었습니다.");
    } else {
        seg.keyframes.push(newKeyframe);
        // Sort by time
        seg.keyframes.sort((a, b) => a.time - b.time);
        showToast("키프레임이 추가되었습니다.");
    }

    updateKeyframeListUI();
}

function updateKeyframeListUI() {
    const seg = getActiveSegment(window.selectedFileObj);
    const container = document.getElementById('keyframe-list');
    const emptyMsg = document.getElementById('keyframe-empty-msg');

    if (!seg || !seg.keyframes || seg.keyframes.length === 0) {
        container.classList.add('hidden');
        emptyMsg.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyMsg.classList.add('hidden');
    container.innerHTML = '';

    seg.keyframes.forEach((kf, idx) => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between bg-white p-2 rounded-lg border border-rose-100 shadow-sm text-[10px]";
        item.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="bg-rose-100 text-rose-600 font-bold px-1.5 py-0.5 rounded">${formatTime(kf.time)}</span>
                <span class="text-rose-400">X:${Math.round(kf.x)} Y:${Math.round(kf.y)} W:${Math.round(kf.w)}</span>
            </div>
            <div class="flex items-center gap-1">
                <button class="goto-kf-btn w-6 h-6 flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors" data-time="${kf.time}">
                    <span class="material-symbols-outlined text-[16px]">play_circle</span>
                </button>
                <button class="del-kf-btn w-6 h-6 flex items-center justify-center text-rose-300 hover:text-rose-500 transition-colors" data-idx="${idx}">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </div>
        `;
        
        // Go to time
        item.querySelector('.goto-kf-btn').onclick = (e) => {
            e.stopPropagation();
            const time = kf.time + 0.001;
            
            if (window.selectedFileObj && window.selectedFileObj.isYoutube && window.ytPlayer) {
                window.ytPlayer.seekTo(time, true);
            } else {
                const video = document.getElementById('main-player');
                video.currentTime = time;
            }
            
            // 크롭 영역 및 타임라인 UI 업데이트
            window.cropBoxState = { x: kf.x, y: kf.y, w: kf.w, h: kf.h };
            updateCropUI();
            if (typeof updatePlayheadUI === 'function') {
                updatePlayheadUI(kf.time);
            }
        };

        // Delete keyframe
        item.querySelector('.del-kf-btn').onclick = (e) => {
            e.stopPropagation();
            seg.keyframes.splice(idx, 1);
            updateKeyframeListUI();
        };

        container.appendChild(item);
    });
}

function updateKeyframePreviewLoop() {
    const video = document.getElementById('main-player');
    
    const loop = () => {
        if (!video.paused && window.isCropMode && window.selectedFileObj) {
            const seg = getActiveSegment(window.selectedFileObj);
            if (seg && seg.keyframes && seg.keyframes.length >= 2) {
                const currentTime = video.currentTime;
                
                // Find flanking keyframes
                let startKF = null;
                let endKF = null;

                for (let i = 0; i < seg.keyframes.length - 1; i++) {
                    if (currentTime >= seg.keyframes[i].time && currentTime <= seg.keyframes[i+1].time) {
                        startKF = seg.keyframes[i];
                        endKF = seg.keyframes[i+1];
                        break;
                    }
                }

                if (startKF && endKF) {
                    const duration = endKF.time - startKF.time;
                    const elapsed = currentTime - startKF.time;
                    const alpha = elapsed / duration; // 0 to 1

                    // Linear Interpolation
                    window.cropBoxState.x = startKF.x + (endKF.x - startKF.x) * alpha;
                    window.cropBoxState.y = startKF.y + (endKF.y - startKF.y) * alpha;
                    window.cropBoxState.w = startKF.w + (endKF.w - startKF.w) * alpha;
                    window.cropBoxState.h = startKF.h + (endKF.h - startKF.h) * alpha;

                    updateCropUI();
                }
            }
        }
        requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
}

// Ensure keyframe UI is updated when segment changes
function onSegmentChanged() {
    updateKeyframeListUI();
}

window.addEventListener('DOMContentLoaded', () => {
    initKeyframeUI();
});
