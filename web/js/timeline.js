function updateTrimUI() {
    if (!window.selectedFileObj || !window.selectedSegmentObj || window.selectedFileObj.duration === 0) return;

    const duration = window.selectedFileObj.duration;
    const startPct = (window.selectedSegmentObj.start / duration) * 100;
    const endPct = (window.selectedSegmentObj.end / duration) * 100;

    const isLocked = window.selectedFileObj.activeSegmentId && !window.isEditingSavedSegment;
    const handleLeft = document.getElementById('handle-left');
    const handleRight = document.getElementById('handle-right');
    
    // 불필요한 클래스 토글 방지
    if (handleLeft.classList.contains('handle-locked') !== isLocked) {
        handleLeft.classList.toggle('handle-locked', isLocked);
        handleRight.classList.toggle('handle-locked', isLocked);
    }

    // 값이 변했을 때만 스타일 업데이트 (깜빡임 방지 핵심)
    const newLeft = `${startPct}%`;
    const newRight = `${endPct}%`;
    if (handleLeft.style.left !== newLeft) handleLeft.style.left = newLeft;
    if (handleRight.style.left !== newRight) handleRight.style.left = newRight;

    const mLeft = document.getElementById('mask-left');
    const mRight = document.getElementById('mask-right');
    if (mLeft && mLeft.style.width !== newLeft) mLeft.style.width = newLeft;
    if (mRight && mRight.style.width !== `${100 - endPct}%`) mRight.style.width = `${100 - endPct}%`;

    const startStr = `시작: ${formatTime(window.selectedSegmentObj.start)}`;
    const endStr = `종료: ${formatTime(window.selectedSegmentObj.end)}`;
    const startDisp = document.getElementById('trim-start-display');
    const endDisp = document.getElementById('trim-end-display');
    
    if (startDisp && startDisp.textContent !== startStr) startDisp.textContent = startStr;
    if (endDisp && endDisp.textContent !== endStr) endDisp.textContent = endStr;

    const resetBtn = document.getElementById('trim-reset-btn');
    if (resetBtn) {
        if (window.selectedFileObj.activeSegmentId && window.isEditingSavedSegment) {
            if (resetBtn.textContent !== "수정 완료") {
                resetBtn.textContent = "수정 완료";
                resetBtn.classList.remove('bg-slate-200', 'hover:bg-slate-300');
                resetBtn.classList.add('bg-green-500', 'hover:bg-green-600', 'text-white');
            }
        } else {
            if (resetBtn.textContent !== "초기화") {
                resetBtn.textContent = "초기화";
                resetBtn.classList.add('bg-slate-200', 'hover:bg-slate-300');
                resetBtn.classList.remove('bg-green-500', 'hover:bg-green-600', 'text-white');
            }
        }
    }
}

function updatePlayheadUI(forceTime = null) {
    const mainPlayer = document.getElementById('main-player');
    const playhead = document.getElementById('playhead-handle');
    const currentTimeDisplay = document.getElementById('current-time-display');
    const playIcon = document.getElementById('play-icon');
    
    const duration = window.selectedFileObj.duration;
    let timeToUse = forceTime !== null ? forceTime : 0;
    
    if (forceTime === null) {
        if (window.selectedFileObj.isYoutube) {
            timeToUse = window.ytPlayer ? window.ytPlayer.getCurrentTime() : 0;
        } else {
            timeToUse = mainPlayer.currentTime;
        }
    }
    
    const currentPct = (timeToUse / duration) * 100;
    
    const newPos = `${currentPct}%`;
    if (playhead.style.left !== newPos) {
        playhead.style.left = newPos;
        playhead.style.transform = 'translateX(-50%)';
    }

    const timeStr = formatTime(timeToUse);
    if (currentTimeDisplay && currentTimeDisplay.textContent !== timeStr) {
        currentTimeDisplay.textContent = timeStr;
    }
    
    let isPaused;
    if (window.selectedFileObj.isYoutube) {
        isPaused = !window.ytPlayer || window.ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING;
    } else {
        isPaused = mainPlayer.paused;
    }
    const targetIcon = isPaused ? 'play_arrow' : 'pause';
    if (playIcon && playIcon.textContent !== targetIcon) {
        playIcon.textContent = targetIcon;
    }
}

function renderGhostMarkers() {
    const container = document.getElementById('ghost-markers-container');
    if (!container || !window.selectedFileObj) return;

    container.innerHTML = '';
    const duration = window.selectedFileObj.duration;
    if (!duration) return;

    window.selectedFileObj.segments.forEach(seg => {
        const marker = document.createElement('div');
        const startPct = (seg.start / duration) * 100;
        const widthPct = ((seg.end - seg.start) / duration) * 100;
        
        marker.className = `ghost-marker ${window.selectedFileObj.activeSegmentId === seg.id ? 'active' : ''}`;
        marker.style.left = `${startPct}%`;
        marker.style.width = `${widthPct}%`;
        
        container.appendChild(marker);
    });
}

function updateTimelineUI(forceTime = null) {
    // 1. 가벼운 UI 업데이트 (재생바, 현재 시각, 트리밍 핸들)
    updateTrimUI();
    updatePlayheadUI(forceTime);
}

function fullUpdateTimelineUI(forceTime = null) {
    // 2. 무거운 UI 업데이트 (목록 렌더링, 고스트 마커 등)
    updateTimelineUI(forceTime);
    if (window.selectedFileObj) {
        // library.js에 정의된 renderSegments 호출
        if (typeof renderSegments === 'function') {
            renderSegments(window.selectedFileObj);
        }
        renderGhostMarkers();
    }
}

function initTimelineEvents() {
    const timelineTrack = document.getElementById('timeline-track');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    const zoomSlider = document.getElementById('timeline-zoom-slider');
    const mainPlayer = document.getElementById('main-player');
    const handleLeft = document.getElementById('handle-left');
    const handleRight = document.getElementById('handle-right');
    const playhead = document.getElementById('playhead-handle');

    // 타임라인 확대/축소 로직
    if (zoomSlider && timelineTrack && scrollContainer) {
        zoomSlider.addEventListener('input', (e) => {
            const zoom = parseFloat(e.target.value);
            updateTimelineZoom(zoom);
        });

        // 슬라이더 조작 후 포커스 해제 (스페이스바 등 단축키 먹통 방지)
        zoomSlider.addEventListener('change', (e) => {
            e.target.blur();
        });
    }

    let isScrubbing = false;
    let isDraggingLeft = false;
    let isDraggingRight = false;
    let scrubAnimationFrame = null;

    timelineTrack.addEventListener('mousedown', (e) => {
        if (!window.selectedFileObj) return;
        
        const isLocked = window.selectedFileObj.activeSegmentId && !window.isEditingSavedSegment;
        const hLeft = e.target.closest('#handle-left');
        const hRight = e.target.closest('#handle-right');
        const hPlayhead = e.target.closest('#playhead-handle');

        if (hLeft) {
            if (isLocked) {
                updateStatus("수정 버튼을 눌러야 구간을 변경할 수 있습니다.");
                setTimeout(() => updateStatus(""), 2000);
                return;
            }
            isDraggingLeft = true;
            playhead.style.opacity = "0.4";
        } else if (hRight) {
            if (isLocked) {
                updateStatus("수정 버튼을 눌러야 구간을 변경할 수 있습니다.");
                setTimeout(() => updateStatus(""), 2000);
                return;
            }
            isDraggingRight = true;
            playhead.style.opacity = "0.4";
        } else {
            isScrubbing = true;
            seekToPosition(e);
        }
        mainPlayer.pause();
    });

    document.addEventListener('mousemove', (e) => {
        if (!window.selectedFileObj) return;
        if (!isScrubbing && !isDraggingLeft && !isDraggingRight) return;

        const rect = timelineTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;
        const fps = window.selectedFileObj.fps || 24;
        let time = pct * window.selectedFileObj.duration;
        time = Math.round(time * fps) / fps;
        
        if (isScrubbing) {
            updatePlayheadUI(time);
        } else if (isDraggingLeft && window.selectedSegmentObj) {
            window.selectedSegmentObj.start = Math.min(time, window.selectedSegmentObj.end - 0.1);
            updateTrimUI();
            updatePlayheadUI(window.selectedSegmentObj.start);
        } else if (isDraggingRight && window.selectedSegmentObj) {
            window.selectedSegmentObj.end = Math.max(time, window.selectedSegmentObj.start + 0.1);
            updateTrimUI();
            updatePlayheadUI(window.selectedSegmentObj.end);
        }
        
        if (isDraggingLeft || isDraggingRight) {
            updateSizeEstimate();
        }

        if (!scrubAnimationFrame) {
            scrubAnimationFrame = requestAnimationFrame(() => {
                if (window.selectedFileObj.isYoutube) {
                    window.ytPlayer.seekTo(time, true);
                } else {
                    if (isScrubbing) mainPlayer.currentTime = time;
                    else if (isDraggingLeft && window.selectedSegmentObj) mainPlayer.currentTime = window.selectedSegmentObj.start;
                    else if (isDraggingRight && window.selectedSegmentObj) mainPlayer.currentTime = window.selectedSegmentObj.end;
                }
                scrubAnimationFrame = null;
            });
        }
    });

    document.addEventListener('mouseup', () => {
        if (isScrubbing || isDraggingLeft || isDraggingRight) {
            if (window.selectedFileObj && window.selectedFileObj.isYoutube) {
                const mainPlayer = document.getElementById('main-player');
                const timeToSeek = isDraggingLeft ? window.selectedSegmentObj.start : 
                                  (isDraggingRight ? window.selectedSegmentObj.end : 0);
                
                if (timeToSeek > 0 || isDraggingLeft || isDraggingRight) {
                    window.ytPlayer.seekTo(timeToSeek, true);
                }
            }

            if (window.selectedFileObj) {
                renderSegments(window.selectedFileObj);
                renderGhostMarkers();
            }
            playhead.style.opacity = "1.0";
        }
        isScrubbing = false;
        isDraggingLeft = false;
        isDraggingRight = false;
    });

    let lastSeekTime = 0;
    function seekToPosition(e) {
        if (!window.selectedFileObj) return;

        const rect = timelineTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;
        
        const duration = window.selectedFileObj.duration;
        const fps = window.selectedFileObj.fps || 24;
        let targetTime = pct * duration;
        targetTime = Math.round(targetTime * fps) / fps;

        // UI 업데이트는 rAF를 통해 즉시 수행 (반응성 최우선)
        requestAnimationFrame(() => {
            updatePlayheadUI(targetTime);
        });
        
        // 실제 비디오 탐색은 약간의 쓰로틀링을 적용 (원활한 스트리밍 유지)
        const now = performance.now();
        if (now - lastSeekTime > 32) { // 약 30fps 정도로 제한
            if (window.selectedFileObj.isYoutube && window.ytPlayer) {
                window.ytPlayer.seekTo(targetTime, true);
            } else {
                mainPlayer.currentTime = targetTime;
            }
            lastSeekTime = now;
        }
    }

    const resetBtn = document.getElementById('trim-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            
            // 1. 수정 모드인 경우 -> 완료 처리
            if (window.selectedFileObj.activeSegmentId && window.isEditingSavedSegment) {
                window.isEditingSavedSegment = false;
                updateStatus("수정이 완료되었습니다.");
            } else {
                // 2. 일반 모드인 경우 -> 전체 구간으로 초기화
                window.selectedFileObj.activeSegmentId = null;
                const seg = getActiveSegment(window.selectedFileObj);
                if (seg) {
                    seg.start = 0;
                    seg.end = window.selectedFileObj.duration;
                }
                updateStatus("타임라인이 전체 구간으로 초기화되었습니다.");
            }
            
            // UI 갱신
            selectVideo(window.selectedFileObj);
            if (typeof renderSegments === 'function') {
                renderSegments(window.selectedFileObj);
            }
            setTimeout(() => updateStatus(""), 2000);
        });
    }
}

function addNewSegment() {
    if (!window.selectedFileObj || !window.selectedSegmentObj) return;
    
    const currentSeg = window.selectedSegmentObj;
    const newSeg = {
        id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        start: currentSeg.start,
        end: currentSeg.end,
        fps: currentSeg.fps,
        speed: currentSeg.speed || 1.0,
        resolution: currentSeg.resolution,
        numColors: currentSeg.numColors,
        useDither: currentSeg.useDither,
        loopPlayback: currentSeg.loopPlayback,
        aspectRatioLock: currentSeg.aspectRatioLock,
        customWidth: currentSeg.customWidth,
        customHeight: currentSeg.customHeight,
        crop: window.isCropMode ? { ...window.cropBoxState } : null,
        status: 'idle',
        progress: 0
    };

    window.selectedFileObj.segments.push(newSeg);
    window.selectedFileObj.activeSegmentId = null; 
    window.isEditingSavedSegment = false;
    if (window.selectedFileObj.draft) {
        window.selectedFileObj.draft.start = 0;
        window.selectedFileObj.draft.end = window.selectedFileObj.duration;
    }
    
    selectVideo(window.selectedFileObj);
    fullUpdateTimelineUI();
    
    updateStatus("새로운 구간이 대기열에 추가되었습니다.");
    setTimeout(() => updateStatus(""), 2000);
}

window.updateTimelineZoom = function(zoom) {
    const timelineTrack = document.getElementById('timeline-track');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    const zoomSlider = document.getElementById('timeline-zoom-slider');
    const mainPlayer = document.getElementById('main-player');
    
    if (!timelineTrack || !scrollContainer) return;
    
    window.timelineZoom = zoom;
    if (zoomSlider) zoomSlider.value = zoom;
    
    // 1배율일 때는 스크롤 원천 차단
    if (zoom === 1) {
        scrollContainer.style.overflowX = 'hidden';
        timelineTrack.style.width = '100%';
        scrollContainer.scrollLeft = 0;
    } else {
        scrollContainer.style.overflowX = 'auto';
        timelineTrack.style.width = `${zoom * 100}%`;
        
        // 확대 시 현재 재생 지점이 중앙에 오도록 스크롤 조정
        if (window.selectedFileObj) {
            const duration = window.selectedFileObj.duration || 1;
            const currentTime = window.selectedFileObj.isYoutube ? 
                (window.ytPlayer ? window.ytPlayer.getCurrentTime() : 0) : 
                (mainPlayer ? mainPlayer.currentTime : 0);
            const playheadPct = currentTime / duration;
            
            requestAnimationFrame(() => {
                const trackWidth = timelineTrack.offsetWidth;
                const containerWidth = scrollContainer.offsetWidth;
                const scrollLeft = (trackWidth * playheadPct) - (containerWidth / 2);
                scrollContainer.scrollLeft = scrollLeft;
            });
        }
    }
};
