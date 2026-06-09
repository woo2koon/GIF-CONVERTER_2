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
    initTooltips();
    
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
    
    // 8. Bulk Delete Action
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async () => {
            const checkedBoxes = document.querySelectorAll('.lib-checkbox:checked');
            if (checkedBoxes.length === 0) return;

            const confirmed = await showCustomConfirm({
                title: "일괄 제거",
                message: `선택한 <b>${checkedBoxes.length}개</b>의 파일을 목록에서 제거하시겠습니까?<br><b class="text-indigo-600">원본 파일은 안전하게 보관됩니다.</b>`,
                okText: "모두 제거",
                okColor: "rose",
                icon: "delete_sweep"
            });

            if (!confirmed) return;

            // 역순으로 지워야 인덱스 꼬임이 없음
            const indicesToRemove = Array.from(checkedBoxes)
                .map(cb => parseInt(cb.dataset.index))
                .sort((a, b) => b - a);

            indicesToRemove.forEach(idx => {
                const fileObj = window.uploadedFiles[idx];
                if (fileObj) {
                    if (window.eel && typeof eel.cancel_proxy === 'function') {
                        eel.cancel_proxy(fileObj.id)();
                    }
                    window.uploadedFiles.splice(idx, 1);
                    const item = document.querySelector(`[data-id="${fileObj.id}"]`);
                    if (item) item.remove();
                }
            });

            document.querySelectorAll('.lib-checkbox').forEach((cb, i) => {
                cb.dataset.index = i;
            });

            if (!window.uploadedFiles.includes(window.selectedFileObj)) {
                selectVideo(window.uploadedFiles.length > 0 ? window.uploadedFiles[0] : null);
            }

            if (selectAllLib) selectAllLib.checked = false;
            updateBatchButtonState();
            updateLibraryEmptyState();
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
            if (!window.selectedFileObj) return;
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

    const audioToggle = document.getElementById('audio-toggle');
    if (audioToggle) {
        audioToggle.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.includeAudio = !seg.includeAudio;
            updateToggleUI(audioToggle, seg.includeAudio);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.includeAudio = seg.includeAudio);
            }
            syncUIToFile(window.selectedFileObj);
        });
    }

    const ditherToggle = document.getElementById('dither-toggle');
    if (ditherToggle) {
        ditherToggle.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
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
    const formatDropdown = document.getElementById('format-dropdown');
    if (formatDropdown) {
        formatDropdown.addEventListener('change', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.format = e.detail.value;
            
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.format = seg.format);
            }
            syncUIToFile(window.selectedFileObj);

        });
    }

    const resDropdown = document.getElementById('res-dropdown');
    if (resDropdown) {
        resDropdown.addEventListener('change', (e) => {
            if (!window.selectedFileObj) return;
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

    // [신규] Gifsicle Optimization dropdown & slider event listeners
    const gifsicleEnableToggle = document.getElementById('gifsicle-enable-toggle');
    if (gifsicleEnableToggle) {
        gifsicleEnableToggle.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            const enable = (gifsicleEnableToggle.getAttribute('data-active') !== 'true');
            if (enable) {
                // Enable optimization: default to 'lossy' if currently 'none'
                seg.optimizationMethod = (seg.optimizationMethod && seg.optimizationMethod !== 'none') ? seg.optimizationMethod : 'lossy';
            } else {
                // Disable optimization
                seg.optimizationMethod = 'none';
            }
            updateToggleUI(gifsicleEnableToggle, enable);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.optimizationMethod = seg.optimizationMethod);
            }
            syncUIToFile(window.selectedFileObj);
        });
    }

    const optMethodDropdown = document.getElementById('opt-method-dropdown');
    if (optMethodDropdown) {
        optMethodDropdown.addEventListener('change', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.optimizationMethod = e.detail.value;
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.optimizationMethod = seg.optimizationMethod);
            }
            syncUIToFile(window.selectedFileObj);
        });
    }

    const lossyLevelSlider = document.getElementById('lossy-level-slider');
    if (lossyLevelSlider) {
        lossyLevelSlider.addEventListener('input', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.lossyLevel = parseInt(e.target.value);
            document.getElementById('lossy-level-display').textContent = seg.lossyLevel;
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.lossyLevel = seg.lossyLevel);
            }
        });
    }

    const localPaletteToggle = document.getElementById('eliminate-local-palette-toggle');
    if (localPaletteToggle) {
        localPaletteToggle.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.eliminateLocalPalette = (localPaletteToggle.getAttribute('data-active') !== 'true');
            updateToggleUI(localPaletteToggle, seg.eliminateLocalPalette);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.eliminateLocalPalette = seg.eliminateLocalPalette);
            }
            syncUIToFile(window.selectedFileObj);
        });
    }

    const reduceColorsInput = document.getElementById('reduce-colors-input');
    if (reduceColorsInput) {
        reduceColorsInput.addEventListener('input', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.reduceColors = parseInt(e.target.value) || 256;
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.reduceColors = seg.reduceColors);
            }
        });
    }

    const colorDropdown = document.getElementById('colors-dropdown');
    if (colorDropdown) {
        colorDropdown.addEventListener('change', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            
            // Extract only numbers (e.g., "256" from "256색 (고화질)")
            const match = String(e.detail.value).match(/\d+/);
            seg.numColors = match ? parseInt(match[0]) : 256;
            
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.numColors = seg.numColors);
            }
            
            syncUIToFile(window.selectedFileObj);

        });
    }

    const fpsDropdown = document.getElementById('fps-dropdown');
    if (fpsDropdown) {
        fpsDropdown.addEventListener('change', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.fps = parseInt(e.detail.value);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.fps = seg.fps);
            }
            syncUIToFile(window.selectedFileObj);

        });
    }

    const fpsSlider = document.getElementById('fps-slider');
    if (fpsSlider) {
        fpsSlider.addEventListener('input', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.fps = parseInt(e.target.value);
            document.getElementById('fps-display').textContent = `${seg.fps} FPS`;
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.fps = seg.fps);
            }

        });
    }

    const speedSlider = document.getElementById('speed-slider');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.speed = parseFloat(e.target.value);
            document.getElementById('speed-display').textContent = `${seg.speed.toFixed(1)}x`;
            
            // Sync to player
            const mainPlayer = document.getElementById('main-player');
            if (mainPlayer) mainPlayer.playbackRate = seg.speed;
            if (window.selectedFileObj.isYoutube && window.ytPlayer) {
                window.ytPlayer.setPlaybackRate(seg.speed);
            }

            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.speed = seg.speed);
            }
            syncUIToFile(window.selectedFileObj); // Update buttons
        });
    }

    document.querySelectorAll('.speed-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!window.selectedFileObj) return;
            const seg = getActiveSegment(window.selectedFileObj);
            if (!seg) return;
            seg.speed = parseFloat(btn.dataset.speed);
            if (window.selectedFileObj.isBatchSync) {
                window.selectedFileObj.segments.forEach(s => s.speed = seg.speed);
            }
            syncUIToFile(window.selectedFileObj);
        });
    });

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

    // 11. Keyframe Section Initialization (Simplified - Handled in keyframes.js)
    // Removed collapsible logic as it is now a dedicated panel

    // Add filmstrip generation call
    const mainPlayerEl = document.getElementById('main-player');
    if (mainPlayerEl) {
        mainPlayerEl.addEventListener('loadedmetadata', () => {
            if (window.selectedFileObj) generateFilmstrip(window.selectedFileObj);
        });
    }

    // Check for updates on startup
    setTimeout(checkUpdateOnStartup, 1500);
});

function initSettingsModal() {
    const openBtn = document.getElementById('open-settings-btn');
    const closeBtn = document.getElementById('close-settings-btn');
    const modal = document.getElementById('settings-modal');
    const confirmBtn = document.getElementById('settings-confirm-btn');
    const changePathBtn = document.getElementById('change-save-path-btn');
    
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            refreshCacheInfo();
        });
    }
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

    const checkUpdateBtn = document.getElementById('check-update-btn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', async () => {
            if (window.latestUpdateUrl) {
                const confirmed = await showCustomConfirm({
                    title: "앱 업데이트 설치",
                    message: "최신 버전 다운로드 및 자동 설치를 시작하시겠습니까?<br><b class='text-indigo-600'>업데이트 시 현재 프로그램이 자동 재기동됩니다.</b>",
                    okText: "업데이트 시작",
                    okColor: "indigo",
                    icon: "system_update_alt"
                });
                if (confirmed) {
                    document.getElementById('app-update-overlay').classList.remove('hidden');
                    eel.start_app_update(window.latestUpdateUrl)();
                }
            } else {
                checkUpdateBtn.disabled = true;
                const origContent = checkUpdateBtn.innerHTML;
                checkUpdateBtn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">cached</span>확인 중...`;
                try {
                    const res = await eel.check_app_update()();
                    if (res && res.update_available) {
                        window.latestUpdateUrl = res.download_url;
                        const badge = document.getElementById('app-update-version-status');
                        if (badge) {
                            badge.textContent = `새 버전: v${res.latest_version}`;
                            badge.classList.remove('bg-slate-100', 'text-slate-500');
                            badge.classList.add('bg-indigo-100', 'text-indigo-600', 'font-black');
                        }
                        const msg = document.getElementById('app-update-msg');
                        if (msg) {
                            msg.innerHTML = `<span class="text-indigo-600 font-black">업데이트 가능 (v${res.latest_version})</span>`;
                        }
                        checkUpdateBtn.innerHTML = `<span class="material-symbols-outlined text-sm">system_update_alt</span>지금 업데이트 설치`;
                        checkUpdateBtn.classList.remove('bg-slate-50', 'text-slate-600');
                        checkUpdateBtn.classList.add('bg-indigo-600', 'text-white', 'hover:bg-indigo-700');
                        checkUpdateBtn.disabled = false;
                        showToast(`새버전 v${res.latest_version} 업데이트가 가능합니다!`);
                    } else {
                        const msg = document.getElementById('app-update-msg');
                        if (msg) msg.textContent = "현재 최신 버전을 사용하고 있습니다.";
                        checkUpdateBtn.innerHTML = origContent;
                        checkUpdateBtn.disabled = false;
                        showToast("현재 최신 버전을 사용하고 있습니다.");
                    }
                } catch(err) {
                    checkUpdateBtn.innerHTML = origContent;
                    checkUpdateBtn.disabled = false;
                    showToast("업데이트 조회 오류가 발생했습니다.");
                }
            }
        });
    }

    const refreshCacheInfo = async () => {
        const info = await eel.get_cache_info()();
        const formatSize = (bytes) => {
            if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };
        
        const totalEl = document.getElementById('total-cache-size');
        const proxyEl = document.getElementById('proxy-cache-size');
        const ytEl = document.getElementById('yt-cache-size');
        
        if (totalEl) totalEl.textContent = formatSize(info.total_size);
        if (proxyEl) proxyEl.textContent = formatSize(info.proxy_size);
        if (ytEl) ytEl.textContent = formatSize(info.yt_size);
    };

    const clearProxyBtn = document.getElementById('clear-proxy-btn');
    if (clearProxyBtn) {
        clearProxyBtn.addEventListener('click', async () => {
            const confirmed = await showCustomConfirm({
                title: "프록시 파일 삭제",
                message: "생성된 모든 미리보기 프록시 파일을 삭제하시겠습니까? <br><b class='text-rose-600'>원본 영상에는 영향을 주지 않습니다.</b>",
                okText: "파일 삭제",
                okColor: "rose",
                icon: "delete_sweep"
            });
            if (confirmed) {
                const res = await eel.clear_proxy_cache()();
                if (res.status === 'success') {
                    showToast('프록시 파일이 정리되었습니다.');
                    refreshCacheInfo();
                    window.uploadedFiles.forEach(f => { f.proxyPath = null; f.isProxying = false; });
                    document.querySelectorAll('.proxy-badge').forEach(b => b.classList.add('hidden'));
                    if (window.selectedFileObj) {
                        const badge = document.getElementById('proxy-badge');
                        if (badge) badge.classList.add('hidden');
                    }
                }
            }
        });
    }

    const clearYtBtn = document.getElementById('clear-yt-btn');
    if (clearYtBtn) {
        clearYtBtn.addEventListener('click', async () => {
            const confirmed = await showCustomConfirm({
                title: "유튜브 다운로드 삭제",
                message: "유튜브에서 직접 다운로드한 영상 파일들을 삭제하시겠습니까? <br><b class='text-rose-600'>라이브러리의 유튜브 항목이 재생되지 않을 수 있습니다.</b>",
                okText: "다운로드 삭제",
                okColor: "rose",
                icon: "download_for_offline"
            });
            if (confirmed) {
                const res = await eel.clear_youtube_cache()();
                if (res.status === 'success') {
                    showToast('유튜브 다운로드 파일이 정리되었습니다.');
                    refreshCacheInfo();
                }
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
        if (typeof showModal === 'function') {
            showModal('youtube-modal');
        } else {
            modal.classList.remove('pointer-events-none', 'opacity-0', 'hidden');
            modal.querySelector('.relative').classList.remove('scale-95');
        }
        const input = document.getElementById('youtube-url-input');
        if (input) { input.value = ''; input.focus(); }
    };
    const hide = () => {
        if (typeof hideModal === 'function') {
            hideModal('youtube-modal');
        } else {
            modal.classList.add('pointer-events-none', 'opacity-0');
            modal.querySelector('.relative').classList.add('scale-95');
        }
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

// App Update Functions
eel.expose(update_app_download_progress);
function update_app_download_progress(percent) {
    const overlay = document.getElementById('app-update-overlay');
    const bar = document.getElementById('app-update-bar');
    const text = document.getElementById('app-update-progress-text');
    
    if (overlay) overlay.classList.remove('hidden');
    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
    
    if (percent >= 100) {
        const statusLabel = document.querySelector('#app-update-overlay span.text-white');
        if (statusLabel) statusLabel.textContent = "다운로드 완료! 파일을 교체하고 재기동합니다...";
    }
}

async function checkUpdateOnStartup() {
    try {
        const res = await eel.check_app_update()();
        if (res && res.update_available) {
            const badge = document.getElementById('app-update-version-status');
            if (badge) {
                badge.textContent = `새 버전: v${res.latest_version}`;
                badge.classList.remove('bg-slate-100', 'text-slate-500');
                badge.classList.add('bg-indigo-100', 'text-indigo-600', 'font-black');
            }
            const msg = document.getElementById('app-update-msg');
            if (msg) {
                msg.innerHTML = `<span class="text-indigo-600 font-black">업데이트 가능 (v${res.latest_version})</span>`;
            }
            window.latestUpdateUrl = res.download_url;
            
            // Change check-update-btn to do update
            const btn = document.getElementById('check-update-btn');
            if (btn) {
                btn.innerHTML = `<span class="material-symbols-outlined text-sm">system_update_alt</span>지금 업데이트 설치`;
                btn.classList.remove('bg-slate-50', 'text-slate-600');
                btn.classList.add('bg-indigo-600', 'text-white', 'hover:bg-indigo-700');
            }

            // Show sidebar update card
            const updateCard = document.getElementById('sidebar-update-card');
            const updateVersionText = document.getElementById('sidebar-update-version-text');
            const updateInstallBtn = document.getElementById('sidebar-update-install-btn');
            const updateNotesBtn = document.getElementById('sidebar-update-notes-btn');
            
            if (updateCard) {
                updateCard.classList.remove('hidden');
                if (updateVersionText) {
                    updateVersionText.textContent = `최신 버전: v${res.latest_version}`;
                }
                if (updateInstallBtn) {
                    const newBtn = updateInstallBtn.cloneNode(true);
                    updateInstallBtn.parentNode.replaceChild(newBtn, updateInstallBtn);
                    newBtn.addEventListener('click', async () => {
                        const confirmed = await showCustomConfirm({
                            title: "앱 업데이트 설치",
                            message: "최신 버전 다운로드 및 자동 설치를 시작하시겠습니까?<br><b class='text-indigo-600'>업데이트 시 현재 프로그램이 자동 재기동됩니다.</b>",
                            okText: "업데이트 시작",
                            okColor: "indigo",
                            icon: "system_update_alt"
                        });
                        if (confirmed) {
                            document.getElementById('app-update-overlay').classList.remove('hidden');
                            eel.start_app_update(window.latestUpdateUrl)();
                        }
                    });
                }
                if (updateNotesBtn) {
                    // Populate release notes and bind modal click
                    updateNotesBtn.addEventListener('click', () => {
                        const verEl = document.getElementById('update-notes-version');
                        const contentEl = document.getElementById('update-notes-content');
                        if (verEl) verEl.textContent = `v${res.latest_version}`;
                        if (contentEl) contentEl.textContent = res.release_notes || "업데이트 상세 내용이 없습니다.";
                        showModal('update-notes-modal');
                    });
                }
            }
        }
    } catch(e) {
        console.error("Startup update check failed:", e);
    }
}

// Bind events for App Update Notes Modal
function initUpdateNotesModalEvents() {
    const modal = document.getElementById('update-notes-modal');
    const closeBtn = document.getElementById('close-update-notes-btn');
    const confirmBtn = document.getElementById('update-notes-confirm-btn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => hideModal('update-notes-modal'));
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => hideModal('update-notes-modal'));
    }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initUpdateNotesModalEvents();
});
