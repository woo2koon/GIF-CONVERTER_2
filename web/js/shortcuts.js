function initShortcuts() {
    console.log("[JS] Custom shortcuts initialized");
    
    document.addEventListener('keydown', (e) => {
        // 입력창에 포커스가 있을 때는 단축키 작동 방지
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

        const mainPlayer = document.getElementById('main-player');
        if (!mainPlayer || !window.selectedFileObj) return;

        const isMac = window.currentOS === 'Darwin';
        const cmdCtrl = isMac ? e.metaKey : e.ctrlKey;
        const altOpt = e.altKey;
        const shift = e.shiftKey;
        const fps = window.selectedFileObj.fps || 30;
        const frameTime = 1 / fps;

        const isYT = window.selectedFileObj.isYoutube;
        const currentTime = isYT ? (window.ytPlayer ? window.ytPlayer.getCurrentTime() : 0) : mainPlayer.currentTime;
        const duration = window.selectedFileObj.duration;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;

            case 'ArrowLeft':
                e.preventDefault();
                let prevStep = frameTime;
                if (cmdCtrl && shift) prevStep = frameTime * 10;
                else if (shift) prevStep = frameTime * 5;
                
                const prevTarget = Math.max(0, currentTime - prevStep);
                if (isYT) window.ytPlayer.seekTo(prevTarget, true);
                else mainPlayer.currentTime = prevTarget;
                updatePlayheadUI();
                break;

            case 'ArrowRight':
                e.preventDefault();
                let nextStep = frameTime;
                if (cmdCtrl && shift) nextStep = frameTime * 10;
                else if (shift) nextStep = frameTime * 5;
                
                const nextTarget = Math.min(duration, currentTime + nextStep);
                if (isYT) window.ytPlayer.seekTo(nextTarget, true);
                else mainPlayer.currentTime = nextTarget;
                updatePlayheadUI();
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (window.selectedSegmentObj) {
                    if (isYT) window.ytPlayer.seekTo(window.selectedSegmentObj.start, true);
                    else mainPlayer.currentTime = window.selectedSegmentObj.start;
                    updatePlayheadUI();
                }
                break;

            case 'ArrowDown':
                e.preventDefault();
                if (window.selectedSegmentObj) {
                    if (isYT) window.ytPlayer.seekTo(window.selectedSegmentObj.end, true);
                    else mainPlayer.currentTime = window.selectedSegmentObj.end;
                    updatePlayheadUI();
                }
                break;

            case 'KeyI':
                e.preventDefault();
                if (!window.selectedSegmentObj) return;
                if (window.selectedFileObj && window.selectedFileObj.activeSegmentId && !window.isEditingSavedSegment) {
                    updateStatus("수정 버튼을 눌러야 구간을 변경할 수 있습니다.");
                    setTimeout(() => updateStatus(""), 2000);
                    return;
                }
                if (altOpt) {
                    window.selectedSegmentObj.start = 0;
                } else {
                    window.selectedSegmentObj.start = currentTime;
                    if (window.selectedSegmentObj.start >= window.selectedSegmentObj.end) {
                        window.selectedSegmentObj.end = Math.min(duration, window.selectedSegmentObj.start + 0.1);
                    }
                }
                updateTrimUI();
                break;

            case 'KeyO':
                e.preventDefault();
                if (!window.selectedSegmentObj) return;
                if (window.selectedFileObj && window.selectedFileObj.activeSegmentId && !window.isEditingSavedSegment) {
                    updateStatus("수정 버튼을 눌러야 구간을 변경할 수 있습니다.");
                    setTimeout(() => updateStatus(""), 2000);
                    return;
                }
                if (altOpt) {
                    window.selectedSegmentObj.end = duration;
                } else {
                    window.selectedSegmentObj.end = currentTime;
                    if (window.selectedSegmentObj.end <= window.selectedSegmentObj.start) {
                        window.selectedSegmentObj.start = Math.max(0, window.selectedSegmentObj.end - 0.1);
                    }
                }
                updateTrimUI();
                break;

            case 'KeyX':
                if (altOpt) {
                    e.preventDefault();
                    if (!window.selectedSegmentObj) return;
                    if (window.selectedFileObj && window.selectedFileObj.activeSegmentId && !window.isEditingSavedSegment) {
                        updateStatus("수정 버튼을 눌러야 구간을 변경할 수 있습니다.");
                        setTimeout(() => updateStatus(""), 2000);
                        return;
                    }
                    window.selectedSegmentObj.start = 0;
                    window.selectedSegmentObj.end = duration;
                    updateTrimUI();
                }
                break;

            case 'Equal': // '+' key
            case 'NumpadAdd':
                if (altOpt) {
                    e.preventDefault();
                    const currentZoom = window.timelineZoom || 1;
                    const newZoom = Math.min(10, currentZoom + 1);
                    if (typeof window.updateTimelineZoom === 'function') {
                        window.updateTimelineZoom(newZoom);
                    }
                }
                break;

            case 'Minus': // '-' key
            case 'NumpadSubtract':
                if (altOpt) {
                    e.preventDefault();
                    const currentZoom = window.timelineZoom || 1;
                    const newZoom = Math.max(1, currentZoom - 1);
                    if (typeof window.updateTimelineZoom === 'function') {
                        window.updateTimelineZoom(newZoom);
                    }
                }
                break;

            case 'Digit0': // '0' key to reset zoom
            case 'Numpad0':
                if (altOpt) {
                    e.preventDefault();
                    if (typeof window.updateTimelineZoom === 'function') {
                        window.updateTimelineZoom(1);
                    }
                }
                break;

            case 'KeyD':
            case 'Backspace':
            case 'Delete':
                // Cmd/Ctrl이나 Alt가 눌리지 않았을 때만 삭제 작동 (실수 방지)
                if (!cmdCtrl && !altOpt && window.selectedFileObj.activeSegmentId) {
                    deleteSegment(window.selectedFileObj.activeSegmentId);
                }
                break;
        }
    });
    
    // Ctrl + 마우스 휠 브라우저 줌 방지
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
        }
    }, { passive: false });
}
