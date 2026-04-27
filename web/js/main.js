document.addEventListener('DOMContentLoaded', async () => {
    // 0. Global Initialization
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // 배경 우클릭 시 기존에 열려있던 커스텀 메뉴가 있다면 닫기
        const ctxMenu = document.getElementById('custom-context-menu');
        if (ctxMenu) ctxMenu.classList.add('hidden');
    });

    // 1. Initialize State
    window.currentOS = await eel.get_os_info()();
    document.body.classList.add('fonts-loaded'); // For Material Symbols flash fix
    
    // 2. Initialize UI Components
    initCustomDropdowns();
    initSettingsModal();
    initYouTubeModal();
    initCropLogic();
    initShortcuts();
    initTimelineEvents();
    initVolumeControls();
    initPlayerEvents();
    
    // 3. Initial Configuration Fetch
    const saveDir = await eel.get_save_directory()();
    const savePathEl = document.getElementById('current-save-path');
    if (savePathEl) savePathEl.textContent = saveDir;

    // 4. File Input Listeners
    const uploadInput = document.getElementById('video-upload');
    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const paths = Array.from(files).map(f => f.path || f.name);
                processFilePaths(paths);
            }
        });
    }

    const addBtn = document.getElementById('add-video-btn');
    const addBtnCompact = document.getElementById('add-video-btn-compact');
    const handlePickVideos = async () => {
        const paths = await eel.pick_videos()();
        if (paths && paths.length > 0) processFilePaths(paths);
    };
    if (addBtn) addBtn.addEventListener('click', handlePickVideos);
    if (addBtnCompact) addBtnCompact.addEventListener('click', handlePickVideos);

    // 5. YouTube Submit

    // 6. Conversion
    const convertBtn = document.getElementById('convert-btn');
    if (convertBtn) convertBtn.addEventListener('click', startConversionWorkflow);

    // 6-1. 대기열 추가 (구간 추가)
    const addSegmentBtn = document.getElementById('add-segment-btn');
    if (addSegmentBtn) addSegmentBtn.addEventListener('click', addNewSegment);
    
    // 7. Bulk Select
    const selectAllLib = document.getElementById('select-all-lib');
    if (selectAllLib) {
        selectAllLib.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.lib-checkbox').forEach(cb => {
                cb.checked = checked;
            });
            updateBatchButtonState();
        });
    }

    // 9. Sync/Toggles
    const batchSyncToggle = document.getElementById('batch-sync-toggle');
    if (batchSyncToggle) {
        batchSyncToggle.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            window.selectedFileObj.isBatchSync = !window.selectedFileObj.isBatchSync;
            updateToggleUI(batchSyncToggle, window.selectedFileObj.isBatchSync);
        });
    }

    const loopToggle = document.getElementById('loop-toggle');
    if (loopToggle) {
        loopToggle.addEventListener('click', () => {
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.loopPlayback = !seg.loopPlayback;
            updateToggleUI(loopToggle, seg.loopPlayback);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.loopPlayback = seg.loopPlayback);
            }
            syncUIToFile(window.selectedFileObj); // Ensure all UI reflects change
        });
    }

    const ditherToggle = document.getElementById('dither-toggle');
    if (ditherToggle) {
        ditherToggle.addEventListener('click', () => {
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.useDither = !seg.useDither;
            updateToggleUI(ditherToggle, seg.useDither);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.useDither = seg.useDither);
            }
            syncUIToFile(window.selectedFileObj); // Ensure all UI reflects change
        });
    }

    // 10. Dropdown Change Events
    const resDropdown = document.getElementById('res-dropdown');
    if (resDropdown) {
        resDropdown.addEventListener('change', (e) => {
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.resolution = e.detail.value;
            syncUIToFile(window.selectedFileObj);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => {
                    s.resolution = seg.resolution;
                    s.customWidth = seg.customWidth;
                    s.customHeight = seg.customHeight;
                    s.aspectRatioLock = seg.aspectRatioLock;
                });
            }
        });
    }

    const colorDropdown = document.getElementById('colors-dropdown');
    if (colorDropdown) {
        colorDropdown.addEventListener('change', (e) => {
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.numColors = parseInt(e.detail.value);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.numColors = seg.numColors);
            }
        });
    }

    const fpsSlider = document.getElementById('fps-slider');
    if (fpsSlider) {
        fpsSlider.addEventListener('input', (e) => {
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.fps = parseInt(e.target.value);
            document.getElementById('fps-display').textContent = `${seg.fps} FPS`;
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.fps = seg.fps);
            }
        });
    }

    // Custom Resolution Inputs
    const customW = document.getElementById('custom-width');
    const customH = document.getElementById('custom-height');
    const lockBtn = document.getElementById('aspect-ratio-lock');
    let lastEditedDimension = 'w'; // Track which one was last touched

    if (customW && customH && lockBtn) {
        const updateRatio = (changed) => {
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg || !window.selectedFileObj) return;
            
            lastEditedDimension = changed; // Record last touch
            const isLocked = lockBtn.dataset.active === 'true';
            
            // Calculate ratio based on crop if active, otherwise use original video ratio
            let ratio;
            if (window.isCropMode && window.cropBoxState) {
                const cropPixelW = window.selectedFileObj.width * (window.cropBoxState.w / 100);
                const cropPixelH = window.selectedFileObj.height * (window.cropBoxState.h / 100);
                ratio = cropPixelW / cropPixelH;
            } else {
                ratio = window.selectedFileObj.width / window.selectedFileObj.height;
            }

            if (changed === 'w') {
                seg.customWidth = parseInt(customW.value);
                if (isLocked) {
                    seg.customHeight = Math.round(seg.customWidth / ratio);
                    customH.value = seg.customHeight;
                }
            } else {
                seg.customHeight = parseInt(customH.value);
                if (isLocked) {
                    seg.customWidth = Math.round(seg.customHeight * ratio);
                    customW.value = seg.customWidth;
                }
            }

            // Batch Sync custom dimensions
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => {
                    s.customWidth = seg.customWidth;
                    s.customHeight = seg.customHeight;
                    s.aspectRatioLock = seg.aspectRatioLock;
                });
            }
        };

        customW.addEventListener('input', () => updateRatio('w'));
        customH.addEventListener('input', () => updateRatio('h'));
        
        lockBtn.addEventListener('click', () => {
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            
            const newState = lockBtn.dataset.active !== 'true';
            lockBtn.dataset.active = newState ? 'true' : 'false';
            seg.aspectRatioLock = newState;
            
            // Update UI
            const icon = lockBtn.querySelector('.material-symbols-outlined');
            if (newState) {
                if (icon) icon.textContent = 'link';
                lockBtn.classList.add('text-indigo-600');
                lockBtn.classList.remove('text-slate-300');
                // Sync immediately using the LAST edited dimension as anchor
                updateRatio(lastEditedDimension);
            } else {
                if (icon) icon.textContent = 'link_off';
                lockBtn.classList.remove('text-indigo-600');
                lockBtn.classList.add('text-slate-300');
            }
        });
    }
    
    // Add filmstrip generation call
    const mainPlayer = document.getElementById('main-player');
    mainPlayer.addEventListener('loadedmetadata', () => {
        if (window.selectedFileObj) generateFilmstrip(window.selectedFileObj);
    });
});

function initSettingsModal() {
    const openBtn = document.getElementById('open-settings-btn');
    const closeBtn = document.getElementById('close-settings-btn');
    const modal = document.getElementById('settings-modal');
    const confirmBtn = document.getElementById('settings-confirm-btn');
    const changePathBtn = document.getElementById('change-save-path-btn');
    
    if (openBtn) openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    if (confirmBtn) confirmBtn.addEventListener('click', () => modal.classList.add('hidden'));
    
    if (changePathBtn) {
        changePathBtn.addEventListener('click', async () => {
            const newDir = await eel.select_save_directory()();
            if (newDir) {
                document.getElementById('current-save-path').textContent = newDir;
            }
        });
    }
}

function initYouTubeModal() {
    const openBtn = document.getElementById('add-youtube-btn');
    const openBtnCompact = document.getElementById('add-youtube-btn-compact');
    const closeBtn = document.getElementById('youtube-cancel-btn');
    const modal = document.getElementById('youtube-modal');
    
    const show = () => {
        modal.classList.remove('pointer-events-none', 'opacity-0', 'hidden');
        modal.querySelector('.relative').classList.remove('scale-95');
        const input = document.getElementById('youtube-url-input');
        if (input) { input.value = ''; input.focus(); }
    };
    const hide = () => {
        modal.classList.add('pointer-events-none', 'opacity-0');
        modal.querySelector('.relative').classList.add('scale-95');
    };
    
    if (openBtn) openBtn.addEventListener('click', show);
    if (openBtnCompact) openBtnCompact.addEventListener('click', show);
    if (closeBtn) closeBtn.addEventListener('click', hide);

    const confirmBtn = document.getElementById('youtube-confirm-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleYoutubeUrl);
    }

    const input = document.getElementById('youtube-url-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleYoutubeUrl();
            }
        });
    }
}

// Handle window resize to keep crop overlay in sync with video content
window.addEventListener('resize', () => {
    if (window.updateCropOverlaySize) {
        window.updateCropOverlaySize();
    }
});
