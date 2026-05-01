/**
 * Keyframe Management for Dynamic Cropping
 */

function initKeyframeUI() {
    const addBtn = document.getElementById('add-keyframe-btn');
    if (addBtn) addBtn.addEventListener('click', addCurrentKeyframe);

    const panelAddBtn = document.getElementById('panel-add-kf-btn');
    if (panelAddBtn) panelAddBtn.addEventListener('click', addCurrentKeyframe);

    const toggleBtn = document.getElementById('toggle-kf-panel-btn');
    if (toggleBtn) toggleBtn.addEventListener('click', () => toggleKeyframePanel());

    const closeBtn = document.getElementById('close-kf-panel-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleKeyframePanel(false));

    // Start a loop to update crop preview during playback based on keyframes
    updateKeyframePreviewLoop();
}

async function toggleKeyframePanel(force) {
    const panel = document.getElementById('keyframe-panel');
    const toggleBtn = document.getElementById('toggle-kf-panel-btn');
    if (!panel) return;

    const isCurrentlyActive = panel.classList.contains('active');
    const targetActive = (typeof force === 'boolean') ? force : !isCurrentlyActive;
    
    if (isCurrentlyActive === targetActive) return;

    const deltaW = 320;
    const kfMarkersContainer = document.getElementById('kf-timeline-markers');

    if (targetActive) {
        // Opening
        panel.classList.add('active');
        if (toggleBtn) toggleBtn.classList.add('bg-rose-50', 'border-rose-400', 'text-rose-700');
        if (kfMarkersContainer) kfMarkersContainer.classList.remove('hidden');
        
        // Ensure markers are rendered when panel opens
        updateTimelineKeyframeMarkers();

        // Try to resize window
        try {
            const success = await eel.resize_window(deltaW, 0)();
            if (!success) {
                // JS Fallback
                window.resizeBy(deltaW, 0);
            }
        } catch (e) {
            window.resizeBy(deltaW, 0);
        }
    } else {
        // Closing
        panel.classList.remove('active');
        if (toggleBtn) toggleBtn.classList.remove('bg-rose-50', 'border-rose-400', 'text-rose-700');
        if (kfMarkersContainer) kfMarkersContainer.classList.add('hidden');
        
        // Try to resize window
        try {
            const success = await eel.resize_window(-deltaW, 0)();
            if (!success) {
                // JS Fallback
                window.resizeBy(-deltaW, 0);
            }
        } catch (e) {
            window.resizeBy(-deltaW, 0);
        }
    }
    
    // Trigger a resize event to refresh crop overlay positioning
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 50);
}

function updateTimelineKeyframeMarkers() {
    const container = document.getElementById('kf-timeline-markers');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Fix: Use getActiveSegment consistently instead of activeSegmentIndex
    const seg = getActiveSegment(window.selectedFileObj);
    if (!seg || !seg.keyframes || seg.keyframes.length === 0) return;
    
    // Improved duration detection
    let duration = window.playerDuration;
    if (!duration || duration <= 0) {
        const player = document.getElementById('main-player');
        if (player && player.duration && isFinite(player.duration)) {
            duration = player.duration;
        }
    }
    if (!duration || !isFinite(duration)) duration = 1;
    
    seg.keyframes.forEach(kf => {
        const marker = document.createElement('div');
        marker.className = 'kf-marker';
        const posPercent = (kf.time / duration) * 100;
        marker.style.left = `${posPercent}%`;
        marker.title = `키프레임: ${formatTime(kf.time)}`;
        
        marker.onclick = (e) => {
            e.stopPropagation();
            seekToKeyframe(kf);
        };
        
        container.appendChild(marker);
    });
}

function addCurrentKeyframe() {
    const seg = getActiveSegment(window.selectedFileObj);
    if (!seg) return;

    const video = document.getElementById('main-player');
    const fps = (window.selectedFileObj && window.selectedFileObj.fps) ? window.selectedFileObj.fps : 30;
    
    const snappedTime = Math.round(video.currentTime * fps) / fps;

    if (!seg.keyframes) seg.keyframes = [];

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
        seg.keyframes.sort((a, b) => a.time - b.time);
        showToast("키프레임이 추가되었습니다.");
    }

    updateKeyframeListUI();
}

function updateKeyframeListUI() {
    const seg = getActiveSegment(window.selectedFileObj);
    
    // Update Large List (Dedicated Panel)
    const largeContainer = document.getElementById('kf-panel-list');
    const largeEmptyMsg = document.getElementById('kf-panel-empty-msg');

    if (!seg || !seg.keyframes || seg.keyframes.length === 0) {
        if (largeContainer) largeContainer.classList.add('hidden');
        if (largeEmptyMsg) largeEmptyMsg.classList.remove('hidden');
        return;
    }

    if (largeContainer) {
        largeContainer.classList.remove('hidden');
        largeEmptyMsg.classList.add('hidden');
        largeContainer.innerHTML = '';
    }

    const vidW = (window.selectedFileObj && window.selectedFileObj.width) ? window.selectedFileObj.width : 1;
    const vidH = (window.selectedFileObj && window.selectedFileObj.height) ? window.selectedFileObj.height : 1;

    seg.keyframes.forEach((kf, idx) => {
        // Calculate absolute pixels
        const absX = Math.round((kf.x / 100) * vidW);
        const absY = Math.round((kf.y / 100) * vidH);
        const absW = Math.round((kf.w / 100) * vidW);
        const absH = Math.round((kf.h / 100) * vidH);

        // Render Large Card (Compact & Premium Design)
        if (largeContainer) {
            const largeCard = document.createElement('div');
            largeCard.className = "kf-card bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between group cursor-pointer hover:bg-slate-50/50";
            largeCard.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <div class="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg font-mono text-[11px] font-black border border-rose-100/50 shrink-0">
                        ${formatTime(kf.time)}
                    </div>
                    <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                            <span class="material-symbols-outlined text-[12px] opacity-40">location_on</span>
                            <span class="truncate">${absX}, ${absY} <span class="text-[8px] font-normal opacity-50">px</span></span>
                        </div>
                        <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span class="material-symbols-outlined text-[12px] opacity-40">aspect_ratio</span>
                            <span class="truncate">${absW} × ${absH} <span class="text-[8px] font-normal opacity-50">px</span></span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button class="goto-kf-btn p-1.5 text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all" title="이 시점으로 이동">
                        <span class="material-symbols-outlined text-[18px]">play_arrow</span>
                    </button>
                    <button class="del-kf-btn p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all" title="삭제">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            `;
            largeCard.onclick = () => seekToKeyframe(kf);
            largeCard.querySelector('.goto-kf-btn').onclick = (e) => { e.stopPropagation(); seekToKeyframe(kf); };
            largeCard.querySelector('.del-kf-btn').onclick = (e) => { e.stopPropagation(); deleteKeyframe(idx); };
            largeContainer.appendChild(largeCard);
        }
    });

    // Also update timeline markers
    updateTimelineKeyframeMarkers();
}

function seekToKeyframe(kf) {
    const time = kf.time + 0.001;
    if (window.selectedFileObj && window.selectedFileObj.isYoutube && window.ytPlayer) {
        window.ytPlayer.seekTo(time, true);
    } else {
        const video = document.getElementById('main-player');
        video.currentTime = time;
    }
    
    window.cropBoxState = { x: kf.x, y: kf.y, w: kf.w, h: kf.h };
    updateCropUI();
    if (typeof updatePlayheadUI === 'function') {
        updatePlayheadUI(kf.time);
    }
}

function deleteKeyframe(idx) {
    const seg = getActiveSegment(window.selectedFileObj);
    if (seg && seg.keyframes) {
        seg.keyframes.splice(idx, 1);
        updateKeyframeListUI();
    }
}

function updateKeyframePreviewLoop() {
    const video = document.getElementById('main-player');
    
    const loop = () => {
        if (!video.paused && window.isCropMode && window.selectedFileObj) {
            const seg = getActiveSegment(window.selectedFileObj);
            if (seg && seg.keyframes && seg.keyframes.length >= 2) {
                const currentTime = video.currentTime;
                
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
                    const alpha = elapsed / duration;

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

function onSegmentChanged() {
    updateKeyframeListUI();
}

window.addEventListener('DOMContentLoaded', () => {
    initKeyframeUI();
});

function updateAutoKeyframe() {
    const seg = getActiveSegment(window.selectedFileObj);
    if (!seg || !seg.keyframes || seg.keyframes.length === 0) return;
    
    const fps = (window.selectedFileObj && window.selectedFileObj.fps) ? window.selectedFileObj.fps : 30;
    
    let currentTime;
    if (window.selectedFileObj.isYoutube) {
        currentTime = window.ytPlayer ? window.ytPlayer.getCurrentTime() : 0;
    } else {
        currentTime = document.getElementById('main-player').currentTime;
    }
    
    const snappedTime = Math.round(currentTime * fps) / fps;
    const existingIdx = seg.keyframes.findIndex(kf => Math.abs(kf.time - snappedTime) < (1 / (fps * 2)));
    
    const newKeyframe = {
        time: snappedTime,
        ...window.cropBoxState
    };
    
    if (existingIdx !== -1) {
        seg.keyframes[existingIdx] = newKeyframe;
    } else {
        seg.keyframes.push(newKeyframe);
        seg.keyframes.sort((a, b) => a.time - b.time);
    }
    
    // UI 업데이트 최적화 (드래그 시 성능 유지)
    if (!window._autoKeyframeRaf) {
        window._autoKeyframeRaf = requestAnimationFrame(() => {
            updateKeyframeListUI();
            window._autoKeyframeRaf = null;
        });
    }
}
