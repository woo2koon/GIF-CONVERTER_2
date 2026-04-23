document.addEventListener('DOMContentLoaded', () => {
    const uploadInput = document.getElementById('video-upload');
    const addBtn = document.getElementById('add-video-btn');
    const libraryList = document.getElementById('library-list');
    const mainPlayer = document.getElementById('main-player');
    const placeholderMsg = document.getElementById('placeholder-msg');
    const convertBtn = document.getElementById('convert-btn');
    const statusMsg = document.getElementById('status-msg');
    const statusBar = document.getElementById('status-bar');

    function updateStatus(text) {
        if (!text || text === "대기 중...") {
            statusBar.classList.add('opacity-0', 'scale-95');
            statusBar.classList.remove('opacity-100', 'scale-100');
        } else {
            statusMsg.textContent = text;
            statusBar.classList.remove('opacity-0', 'scale-95');
            statusBar.classList.add('opacity-100', 'scale-100');
        }
    }

    const fpsSlider = document.getElementById('fps-slider');
    const fpsDisplay = document.getElementById('fps-display');
    const resSelect = document.getElementById('res-select');
    const colorsDropdown = document.getElementById('colors-dropdown');
    const colorsSelected = document.getElementById('colors-selected');
    const loopToggle = document.getElementById('loop-toggle');
    const ditherToggle = document.getElementById('dither-toggle');
    const convertSplitBtn = document.getElementById('convert-split-btn');
    const batchMenu = document.getElementById('batch-menu');
    const batchConvertOverrideBtn = document.getElementById('batch-convert-override-btn');

    // Timeline Elements
    const timelineArea = document.getElementById('timeline-area');
    const timelineContainer = document.getElementById('timeline-container');
    const timelineTrack = document.getElementById('timeline-track');
    const timelineSelection = document.getElementById('timeline-selection');
    const handleLeft = document.getElementById('handle-left');
    const handleRight = document.getElementById('handle-right');
    const playhead = document.getElementById('playhead');
    const trimStartDisplay = document.getElementById('trim-start-display');
    const trimEndDisplay = document.getElementById('trim-end-display');
    const filmstripContainer = document.getElementById('filmstrip-container');

    const resetBtn = document.getElementById('trim-reset-btn');

    // Custom Player Controls
    const playPauseBtn = document.getElementById('play-pause-btn');
    const playIcon = document.getElementById('play-icon');
    const stepBackBtn = document.getElementById('step-back-btn');
    const stepForwardBtn = document.getElementById('step-forward-btn');
    const currentTimeDisplay = document.getElementById('current-time-display');
    const totalTimeDisplay = document.getElementById('total-time-display');
    
    // Volume Elements
    const volumeSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');
    const volumeIcon = document.getElementById('volume-icon');
    let lastVolume = 0.8;
    let currentVideoPath = null;
    let currentVideoFileName = null;
    let videoDuration = 0;
    let selectedFileObj = null;

    // --- Custom Dropdown Logic ---
    function initCustomDropdowns() {
        const dropdowns = document.querySelectorAll('.custom-dropdown');
        
        dropdowns.forEach(dropdown => {
            const trigger = dropdown.querySelector('.dropdown-trigger');
            const menu = dropdown.querySelector('.dropdown-menu');
            const items = dropdown.querySelectorAll('.dropdown-item');
            const selectedSpan = trigger.querySelector('span:first-child');
            
            // Toggle menu
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other dropdowns
                document.querySelectorAll('.dropdown-menu').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
            });
            
            // Item selection
            items.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = item.dataset.value;
                    selectedSpan.textContent = item.textContent;
                    
                    // Update active state
                    items.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    
                    menu.classList.remove('show');
                    
                    // Custom Logic for specific dropdowns if needed
                    dropdown.dispatchEvent(new CustomEvent('change', { detail: { value } }));
                });
            });
        });
        
        // Close on outside click
        document.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
        });
    }

    initCustomDropdowns();

    const resDropdown = document.getElementById('res-dropdown');
    const customResContainer = document.getElementById('custom-res-container');
    const customWidthInput = document.getElementById('custom-width');
    const customHeightInput = document.getElementById('custom-height');
    const aspectRatioLock = document.getElementById('aspect-ratio-lock');

    resDropdown.addEventListener('change', (e) => {
        const val = e.detail.value;
        if (selectedFileObj) selectedFileObj.resolution = val;
        
        if (val === "직접 설정") {
            customResContainer.classList.remove('hidden');
            if (selectedFileObj) {
                customWidthInput.value = selectedFileObj.customWidth || selectedFileObj.width;
                customHeightInput.value = selectedFileObj.customHeight || selectedFileObj.height;
            }
        } else {
            customResContainer.classList.add('hidden');
        }
    });

    customWidthInput.addEventListener('input', () => {
        const val = parseInt(customWidthInput.value);
        if (selectedFileObj) selectedFileObj.customWidth = val;
        
        if (aspectRatioLock.checked && selectedFileObj) {
            const ratio = selectedFileObj.width / selectedFileObj.height;
            customHeightInput.value = Math.round(val / ratio);
            selectedFileObj.customHeight = parseInt(customHeightInput.value);
        }
    });

    customHeightInput.addEventListener('input', () => {
        const val = parseInt(customHeightInput.value);
        if (selectedFileObj) selectedFileObj.customHeight = val;
        
        if (aspectRatioLock.checked && selectedFileObj) {
            const ratio = selectedFileObj.width / selectedFileObj.height;
            customWidthInput.value = Math.round(val * ratio);
            selectedFileObj.customWidth = parseInt(customWidthInput.value);
        }
    });

    aspectRatioLock.addEventListener('change', () => {
        if (selectedFileObj) selectedFileObj.aspectRatioLock = aspectRatioLock.checked;
    });

    colorsDropdown.addEventListener('change', (e) => {
        if (selectedFileObj) selectedFileObj.numColors = parseInt(e.detail.value);
    });

    // Update FPS display
    fpsSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        fpsDisplay.textContent = `${val} FPS`;
        if (selectedFileObj) selectedFileObj.fps = val;
    });

    function updateToggleUI(toggle, active) {
        toggle.dataset.active = active ? 'true' : 'false';
        const circle = toggle.children[0];
        if (active) {
            toggle.classList.add('bg-primary');
            toggle.classList.remove('bg-slate-300');
            circle.classList.add('translate-x-5');
        } else {
            toggle.classList.remove('bg-primary');
            toggle.classList.add('bg-slate-300');
            circle.classList.remove('translate-x-5');
        }
    }

    loopToggle.addEventListener('click', () => {
        const active = loopToggle.dataset.active !== 'true';
        updateToggleUI(loopToggle, active);
        if (selectedFileObj) selectedFileObj.loopPlayback = active;
    });

    ditherToggle.addEventListener('click', () => {
        const active = ditherToggle.dataset.active !== 'true';
        updateToggleUI(ditherToggle, active);
        if (selectedFileObj) selectedFileObj.useDither = active;
    });

    function updateBatchButtonState() {
        const checkedCount = document.querySelectorAll('.lib-checkbox:checked').length;
        const isBatch = checkedCount >= 2;
        const splitPart = document.getElementById('split-part');
        const convertBtn = document.getElementById('convert-btn');
        
        if (isBatch) {
            splitPart.classList.remove('hidden');
            splitPart.classList.add('flex');
            convertBtn.classList.remove('rounded-xl');
            convertBtn.classList.add('rounded-l-xl');
        } else {
            splitPart.classList.add('hidden');
            splitPart.classList.remove('flex');
            convertBtn.classList.add('rounded-xl');
            convertBtn.classList.remove('rounded-l-xl');
            batchMenu.classList.add('hidden');
        }
    }

    const selectAllLib = document.getElementById('select-all-lib');
    selectAllLib.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.lib-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateBatchButtonState();
    });

    // Split Button logic
    convertSplitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const checkedCount = document.querySelectorAll('.lib-checkbox:checked').length;
        if (checkedCount < 2) return;
        batchMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        batchMenu.classList.add('hidden');
    });

    batchConvertOverrideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        batchMenu.classList.add('hidden');
        runConversion(true);
    });

    let uploadedFiles = [];

    // NATIVE FILE PICKER
    addBtn.addEventListener('click', async () => {
        const paths = await eel.pick_videos()();

        if (!paths || paths.length === 0) {
            return;
        }

        for (const path of paths) {
            const res = await eel.get_file_info(path)();

            if (res.status === 'success') {
                // 맥(Safari)의 강력한 보안 정책 때문에 http:// 로 띄운 창에서는 file:// 에 직접 접근이 차단됩니다.
                // 따라서 다시 파이썬 로컬 서버를 거치는 안전한 방식으로 되돌립니다.
                const cleanPath = res.path.startsWith('/') ? res.path.slice(1) : res.path;
                const normalizedPath = cleanPath.replace(/\\/g, '/');
                const safePath = normalizedPath.split('/').map(encodeURIComponent).join('/');
                const objectUrl = `/local_file/${safePath}`;

                const fileObj = {
                    name: res.name,
                    path: res.path,
                    objectUrl: objectUrl,
                    size: res.size,
                    fps: parseInt(fpsSlider.value) || 24,
                    duration: res.duration || 0,
                    width: res.width || 1280,
                    height: res.height || 720,
                    trimStart: 0,
                    trimEnd: res.duration || 0,
                    currentTime: 0,
                    filmstrip: [],
                    aspectRatio: res.width / res.height || 16 / 9,
                    // Current UI settings as defaults for this new file
                    resolution: document.querySelector('#res-dropdown .dropdown-item.active').dataset.value || "중간 (720p)",
                    numColors: parseInt(document.querySelector('#colors-dropdown .dropdown-item.active').dataset.value) || 256,
                    useDither: ditherToggle.dataset.active === 'true',
                    loopPlayback: loopToggle.dataset.active === 'true',
                    aspectRatioLock: aspectRatioLock.checked,
                    customWidth: parseInt(customWidthInput.value) || res.width,
                    customHeight: parseInt(customHeightInput.value) || res.height
                };
                uploadedFiles.push(fileObj);
                addLibraryItem(fileObj);

                if (uploadedFiles.length === 1 || !selectedFileObj) {
                    selectVideo(fileObj);
                }
            } else {
                statusMsg.textContent = "오류: " + res.message;
            }
        }
    });

    async function generateFilmstrip(fileObj) {
        if (fileObj.filmstrip && fileObj.filmstrip.length > 0) {
            displayFilmstrip(fileObj);
            return;
        }

        filmstripContainer.innerHTML = '<div class="text-[10px] p-2 text-white/30">고해상도 프레임 추출 중...</div>';

        const video = document.createElement('video');
        video.src = fileObj.objectUrl;
        video.muted = true;

        try {
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = resolve;
                video.onerror = reject;
            });

            fileObj.aspectRatio = video.videoWidth / video.videoHeight;
            const duration = video.duration;

            // Pool of 100 frames for smooth adaptive scaling
            const numThumbnails = 100;
            const interval = duration / numThumbnails;
            const thumbnails = [];

            for (let i = 0; i < numThumbnails; i++) {
                video.currentTime = i * interval;
                await new Promise(r => video.onseeked = r);

                const canvas = document.createElement('canvas');
                canvas.height = 100;
                canvas.width = 100 * fileObj.aspectRatio;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                thumbnails.push(canvas.toDataURL('image/jpeg', 0.4));

                // Small delay to prevent overwhelming the server on some systems
                if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));

                // Show partial results
                if (i % 25 === 0 && i > 0) {
                    fileObj.filmstrip = thumbnails;
                    displayFilmstrip(fileObj);
                }
            }

            fileObj.filmstrip = thumbnails;
            displayFilmstrip(fileObj);
        } catch (err) {
            filmstripContainer.innerHTML = '';
        }
    }

    // ADAPTIVE DISPLAY: Show more/less frames based on zoomLevel
    function displayFilmstrip(fileObj) {
        if (!fileObj || !fileObj.filmstrip || fileObj.filmstrip.length === 0) return;

        filmstripContainer.innerHTML = '';
        const allThumbs = fileObj.filmstrip;
        const totalGenerated = allThumbs.length;

        // Base: 12 frames at 1x zoom. Add more as we zoom.
        let targetCount = Math.floor(12 + (zoomLevel - 1) * 8);
        targetCount = Math.min(targetCount, totalGenerated);

        const step = Math.max(1, Math.floor(totalGenerated / targetCount));

        for (let i = 0; i < totalGenerated; i += step) {
            const img = document.createElement('img');
            img.src = allThumbs[i];
            img.className = "h-full object-cover min-w-0 flex-1 border-r border-black/10";
            filmstripContainer.appendChild(img);
            if (filmstripContainer.children.length >= targetCount) break;
        }
    }

    function selectVideo(fileObj) {
        if (currentVideoPath === fileObj.path && !mainPlayer.error) return;

        // 상태 초기화
        selectedFileObj = fileObj;
        currentVideoPath = fileObj.path;
        currentVideoFileName = fileObj.name;
        
        document.getElementById('header-filename').textContent = fileObj.name;
        document.getElementById('header-resolution').textContent = "로딩 중...";
        
        // 이전 리소스 해제 (로딩 오류 방지 핵심)
        mainPlayer.pause();
        mainPlayer.src = "";
        mainPlayer.load();

        // 새 소스 로드
        setTimeout(() => {
            const timestamp = Date.now();
            mainPlayer.src = `${fileObj.objectUrl}?t=${timestamp}`;
            mainPlayer.load();
            
            mainPlayer.classList.remove('hidden');
            placeholderMsg.classList.add('hidden');
            const tArea = document.getElementById('timeline-area');
            if (tArea) tArea.classList.remove('hidden');
            
            syncUIToFile(fileObj);
        }, 50);
    }

    function syncUIToFile(fileObj) {
        if (!fileObj) return;

        // 1. FPS
        fpsSlider.value = fileObj.fps || 24;
        fpsDisplay.textContent = `${fpsSlider.value} FPS`;

        // 2. Resolution Dropdown
        const resValue = fileObj.resolution || "중간 (720p)";
        const resItems = document.querySelectorAll('#res-dropdown .dropdown-item');
        resItems.forEach(item => {
            if (item.dataset.value === resValue) {
                resItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.getElementById('res-selected').textContent = item.textContent;
            }
        });
        
        if (resValue === "직접 설정") {
            customWidthInput.value = fileObj.customWidth || fileObj.width;
            customHeightInput.value = fileObj.customHeight || fileObj.height;
            aspectRatioLock.checked = fileObj.aspectRatioLock !== undefined ? fileObj.aspectRatioLock : true;
            customResContainer.classList.remove('hidden');
        } else {
            customResContainer.classList.add('hidden');
        }

        // 3. Color Depth Dropdown
        const colorValue = fileObj.numColors || 256;
        const colorItems = document.querySelectorAll('#colors-dropdown .dropdown-item');
        colorItems.forEach(item => {
            if (parseInt(item.dataset.value) === colorValue) {
                colorItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                colorsSelected.textContent = item.textContent;
            }
        });

        // 4. Toggles
        updateToggleUI(loopToggle, fileObj.loopPlayback !== undefined ? fileObj.loopPlayback : true);
        updateToggleUI(ditherToggle, fileObj.useDither !== undefined ? fileObj.useDither : false);
    }

    mainPlayer.addEventListener('click', togglePlayPause);
    
    mainPlayer.addEventListener('play', () => {
        if (playIcon) playIcon.textContent = 'pause';
        if ('requestVideoFrameCallback' in mainPlayer) {
            mainPlayer.requestVideoFrameCallback(updateUIFrame);
        }
    });

    mainPlayer.addEventListener('pause', () => {
        if (playIcon) playIcon.textContent = 'play_arrow';
    });

    mainPlayer.onloadedmetadata = () => {
        if (!selectedFileObj) return;
        
        // 백엔드에서 온 정확한 정보를 우선 사용
        videoDuration = selectedFileObj.duration || mainPlayer.duration;
        selectedFileObj.duration = videoDuration;

        const w = mainPlayer.videoWidth || selectedFileObj.width;
        const h = mainPlayer.videoHeight || selectedFileObj.height;
        const durStr = formatTime(videoDuration);
        const ext = selectedFileObj.name.split('.').pop().toUpperCase();
        
        document.getElementById('header-resolution').textContent = 
            `${w}x${h} • ${ext} • ${durStr} • ${selectedFileObj.fps.toFixed(2)} FPS`;

        if (selectedFileObj.trimEnd === 0) {
            selectedFileObj.trimEnd = videoDuration;
        }
        
        totalTimeDisplay.textContent = formatTime(videoDuration);
        timelineTrack.style.width = "100%";
        updateTimelineUI();
    };

    function togglePlayPause() {
        if (!selectedFileObj) return;
        if (mainPlayer.paused) {
            mainPlayer.play().catch(err => console.error("Play error:", err));
        } else {
            mainPlayer.pause();
        }
    }

    function formatTime(seconds) {
        // 우측 슬라이더와 무관하게, 영상 원본의 진짜 프레임 레이트 사용 (없으면 30)
        const sourceFps = selectedFileObj && selectedFileObj.fps ? selectedFileObj.fps : 30.0;
        
        // 전체 프레임 수를 먼저 계산하여 부동소수점 오차 완벽 방지
        const fpsRound = Math.round(sourceFps);
        const totalFrames = Math.round(seconds * sourceFps);
        
        const mins = Math.floor(totalFrames / (fpsRound * 60));
        const secs = Math.floor((totalFrames / fpsRound) % 60);
        const frames = totalFrames % fpsRound;
        
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }

    // 트림 구간(시작/종료) UI만 업데이트 (자주 발생하지 않음)
    function updateTrimUI() {
        if (!selectedFileObj || selectedFileObj.duration === 0) return;

        const duration = selectedFileObj.duration;
        const startPct = (selectedFileObj.trimStart / duration) * 100;
        const endPct = (selectedFileObj.trimEnd / duration) * 100;

        handleLeft.style.left = `${startPct}%`;
        handleLeft.style.transform = 'translateX(-50%)';
        handleRight.style.left = `${endPct}%`;
        handleRight.style.transform = 'translateX(-50%)';

        const mLeft = document.getElementById('mask-left');
        const mRight = document.getElementById('mask-right');
        if (mLeft) mLeft.style.width = `${startPct}%`;
        if (mRight) mRight.style.width = `${100 - endPct}%`;

        trimStartDisplay.textContent = `시작: ${formatTime(selectedFileObj.trimStart)}`;
        trimEndDisplay.textContent = `종료: ${formatTime(selectedFileObj.trimEnd)}`;
    }

    // 재생 바 및 타임코드 전용 업데이트 (매 프레임 발생 - 고성능 필요)
    function updatePlayheadUI(forceTime = null) {
        if (!selectedFileObj || selectedFileObj.duration === 0) return;
        
        const duration = selectedFileObj.duration;
        const timeToUse = forceTime !== null ? forceTime : mainPlayer.currentTime;
        const currentPct = (timeToUse / duration);
        
        const rect = timelineTrack.getBoundingClientRect();
        playhead.style.transform = `translateX(${currentPct * rect.width}px)`;

        const timeStr = formatTime(timeToUse);
        if (currentTimeDisplay.textContent !== timeStr) {
            currentTimeDisplay.textContent = timeStr;
        }
        
        const targetIcon = mainPlayer.paused ? 'play_arrow' : 'pause';
        if (playIcon.textContent !== targetIcon) {
            playIcon.textContent = targetIcon;
        }
    }

    // 전체 UI 업데이트 (하위 호환성용)
    function updateTimelineUI(forceTime = null) {
        updateTrimUI();
        updatePlayheadUI(forceTime);
    }

    playPauseBtn.addEventListener('click', togglePlayPause);

    // 포커스 가로채기 방지 (버튼/슬라이더 클릭 후 포커스 해제)
    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.type === 'range') {
            // 약간의 지연을 주어 클릭 이벤트는 발생하게 하고 포커스만 제거
            setTimeout(() => {
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
            }, 100);
        }
    });

    // Keyboard Shortcuts (Unified)
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (!selectedFileObj) return;

        const isAlt = e.altKey;
        const key = e.key.toLowerCase();

        // Alt Combinations (Reset)
        if (isAlt) {
            if (key === 'i') {
                e.preventDefault();
                selectedFileObj.trimStart = 0;
                updateTimelineUI();
            } else if (key === 'o') {
                e.preventDefault();
                selectedFileObj.trimEnd = selectedFileObj.duration;
                updateTimelineUI();
            } else if (key === 'x') {
                e.preventDefault();
                selectedFileObj.trimStart = 0;
                selectedFileObj.trimEnd = selectedFileObj.duration;
                updateTimelineUI();
            }
            return;
        }

        switch (e.key) {
            case ' ':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'i':
            case 'I':
                selectedFileObj.trimStart = mainPlayer.currentTime;
                if (selectedFileObj.trimStart >= selectedFileObj.trimEnd) {
                    selectedFileObj.trimEnd = Math.min(selectedFileObj.duration, selectedFileObj.trimStart + 0.1);
                }
                updateTimelineUI();
                break;
            case 'o':
            case 'O':
                selectedFileObj.trimEnd = mainPlayer.currentTime;
                if (selectedFileObj.trimEnd <= selectedFileObj.trimStart) {
                    selectedFileObj.trimStart = Math.max(0, selectedFileObj.trimEnd - 0.1);
                }
                updateTimelineUI();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                mainPlayer.pause();
                const fps = selectedFileObj.fps || 30;
                let jumpBack = 1 / fps; // 1 frame
                if (e.shiftKey && (e.ctrlKey || e.metaKey)) jumpBack = 10 / fps; // 10 frames
                else if (e.shiftKey) jumpBack = 5 / fps; // 5 frames
                
                mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - jumpBack);
                updateTimelineUI();
                break;
            case 'ArrowRight':
                e.preventDefault();
                mainPlayer.pause();
                const fpsR = selectedFileObj.fps || 30;
                let jumpForward = 1 / fpsR; // 1 frame
                if (e.shiftKey && (e.ctrlKey || e.metaKey)) jumpForward = 10 / fpsR; // 10 frames
                else if (e.shiftKey) jumpForward = 5 / fpsR; // 5 frames

                mainPlayer.currentTime = Math.min(selectedFileObj.duration, mainPlayer.currentTime + jumpForward);
                updateTimelineUI();
                break;
            case 'ArrowUp':
                e.preventDefault();
                mainPlayer.currentTime = selectedFileObj.trimStart;
                updateTimelineUI();
                break;
            case 'ArrowDown':
                e.preventDefault();
                mainPlayer.currentTime = selectedFileObj.trimEnd;
                updateTimelineUI();
                break;
        }
    });

    // 볼륨 조절 로직
    function updateVolumeSliderFill(val) {
        const percentage = val * 100;
        // 테마에 맞춘 파란색 계열(indigo-600: #4f46e5)로 배경 채우기
        volumeSlider.style.background = `linear-gradient(to right, #4f46e5 ${percentage}%, #e2e8f0 ${percentage}%)`;
    }

    volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        mainPlayer.volume = val;
        mainPlayer.muted = (val === 0);
        if (val > 0) lastVolume = val;
        updateVolumeIcon();
        updateVolumeSliderFill(val);
    });

    muteBtn.addEventListener('click', () => {
        mainPlayer.muted = !mainPlayer.muted;
        
        if (mainPlayer.muted) {
            volumeSlider.value = 0;
        } else {
            // 음소거 해제 시 이전 볼륨으로 복구 (이전 볼륨이 0이었으면 0.5로)
            if (lastVolume === 0) lastVolume = 0.5;
            mainPlayer.volume = lastVolume;
            volumeSlider.value = lastVolume;
        }
        
        updateVolumeIcon();
        updateVolumeSliderFill(volumeSlider.value);
    });

    function updateVolumeIcon() {
        if (mainPlayer.muted || mainPlayer.volume === 0) {
            volumeIcon.textContent = 'volume_off';
            volumeIcon.style.color = '#ef4444'; // Red for muted
        } else {
            volumeIcon.textContent = 'volume_up';
            volumeIcon.style.color = '';
        }
    }
    
    // 초기 볼륨 배경색 세팅
    updateVolumeSliderFill(volumeSlider.value);

    stepBackBtn.addEventListener('click', () => {
        if (!selectedFileObj) return;
        mainPlayer.pause();
        const fps = selectedFileObj.fps || 30;
        mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - (1 / fps));
        updateTimelineUI();
    });

    stepForwardBtn.addEventListener('click', () => {
        if (!selectedFileObj) return;
        mainPlayer.pause();
        const fps = selectedFileObj.fps || 30;
        mainPlayer.currentTime = Math.min(selectedFileObj.duration, mainPlayer.currentTime + (1 / fps));
        updateTimelineUI();
    });


    // 실시간 스크러빙 및 트리밍 로직
    let isScrubbing = false;
    let isDraggingLeft = false;
    let isDraggingRight = false;
    let lastTargetTime = -1; // 마지막으로 강제 이동한 목표 시간
    let seekLockTimeout = null; // 이동 중 루프 차단 타이머

    timelineTrack.addEventListener('mousedown', (e) => {
        if (e.target === handleLeft) {
            isDraggingLeft = true;
        } else if (e.target === handleRight) {
            isDraggingRight = true;
        } else {
            isScrubbing = true;
            seekToPosition(e);
        }
        mainPlayer.pause();
    });

    let scrubAnimationFrame = null;

    document.addEventListener('mousemove', (e) => {
        if (!selectedFileObj) return;
        if (!isScrubbing && !isDraggingLeft && !isDraggingRight) return;

        const rect = timelineTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;
        const time = pct * selectedFileObj.duration;
        
        lastTargetTime = time; // 목표 시간 기록
        if (seekLockTimeout) clearTimeout(seekLockTimeout);
        seekLockTimeout = setTimeout(() => { lastTargetTime = -1; }, 500);

        // UI는 즉시 업데이트 (반응성 최우선)
        if (isScrubbing) {
            updatePlayheadUI(time);
        } else if (isDraggingLeft) {
            selectedFileObj.trimStart = Math.min(time, selectedFileObj.trimEnd - 0.1);
            updateTrimUI();
            updatePlayheadUI(selectedFileObj.trimStart);
        } else if (isDraggingRight) {
            selectedFileObj.trimEnd = Math.max(time, selectedFileObj.trimStart + 0.1);
            updateTrimUI();
            updatePlayheadUI(selectedFileObj.trimEnd);
        }

        // 비디오 탐색은 rAF를 통해 최적화된 속도로 수행
        if (!scrubAnimationFrame) {
            scrubAnimationFrame = requestAnimationFrame(() => {
                if (isScrubbing) {
                    mainPlayer.currentTime = lastTargetTime;
                } else if (isDraggingLeft) {
                    mainPlayer.currentTime = selectedFileObj.trimStart;
                } else if (isDraggingRight) {
                    mainPlayer.currentTime = selectedFileObj.trimEnd;
                }
                scrubAnimationFrame = null;
            });
        }
    });

    document.addEventListener('mouseup', () => {
        isScrubbing = false;
        isDraggingLeft = false;
        isDraggingRight = false;
    });

    function seekToPosition(e) {
        if (!selectedFileObj) return;
        const rect = timelineTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;
        const targetTime = pct * selectedFileObj.duration;
        
        // 목표 시간 기록 및 잠금
        lastTargetTime = targetTime;
        if (seekLockTimeout) clearTimeout(seekLockTimeout);
        seekLockTimeout = setTimeout(() => { lastTargetTime = -1; }, 500);

        // 클릭 즉시 UI 업데이트하여 반응성 극대화
        updatePlayheadUI(targetTime);
        mainPlayer.currentTime = targetTime;
    }

    resetBtn.addEventListener('click', () => {
        if (!selectedFileObj) return;
        selectedFileObj.trimStart = 0;
        selectedFileObj.trimEnd = selectedFileObj.duration;
        updateTimelineUI();
    });

    mainPlayer.addEventListener('timeupdate', () => {
        // 드래그 중이거나 스크러빙 중일 때는 루프 로직을 실행하지 않음
        if (!selectedFileObj || isDraggingLeft || isDraggingRight || isScrubbing) return;
        
        // 사용자가 일시정지 상태에서 타임라인을 탐색할 때는 루프 로직(강제 튕김)을 차단
        if (mainPlayer.paused) return;

        const currentTime = mainPlayer.currentTime;
        const start = selectedFileObj.trimStart;
        const end = selectedFileObj.trimEnd;

        // 사파리 특성을 고려한 루프 로직 (재생 중에만 작동)
        if (currentTime < start - 0.3) {
            mainPlayer.currentTime = start;
        }

        if (currentTime >= end) {
            mainPlayer.currentTime = start;
            mainPlayer.play().catch(() => { });
        }
    });

    function updateUIFrame(now, metadata) {
        if (selectedFileObj && !isScrubbing && !isDraggingLeft && !isDraggingRight) {
            const currentTime = metadata && metadata.mediaTime ? metadata.mediaTime : mainPlayer.currentTime;
            updatePlayheadUI(currentTime);
        }
        
        if ('requestVideoFrameCallback' in mainPlayer && !mainPlayer.paused) {
            mainPlayer.requestVideoFrameCallback(updateUIFrame);
        }
    }
    
    // 루프 시작
    if ('requestVideoFrameCallback' in mainPlayer) {
        mainPlayer.requestVideoFrameCallback(updateUIFrame);
    } else {
        requestAnimationFrame(updateUIFrame);
    }

    function addLibraryItem(fileObj) {
        const sizeMb = (fileObj.size / (1024 * 1024)).toFixed(1);
        const itemDiv = document.createElement('div');
        itemDiv.className = "bg-white text-indigo-600 shadow-sm rounded-lg p-3 cursor-pointer group transition-all duration-200 ease-in-out border border-indigo-200 hover:border-indigo-400";

        const index = uploadedFiles.indexOf(fileObj);

        itemDiv.innerHTML = `
            <div class="flex gap-3 items-center">
                <div class="flex items-center">
                    <input type="checkbox" class="lib-checkbox w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" data-index="${index}" />
                </div>
                <div class="flex-1 flex flex-col justify-center overflow-hidden">
                    <span class="truncate font-semibold text-on-surface">${fileObj.name}</span>
                    <span class="text-xs text-slate-500">${sizeMb} MB</span>
                </div>
                <!-- Delete Button (Visible on Hover) -->
                <button class="delete-file-btn opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all outline-none">
                    <span class="material-symbols-outlined text-xl">delete</span>
                </button>
            </div>
        `;

        const checkbox = itemDiv.querySelector('.lib-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            updateBatchButtonState();
        });

        const deleteBtn = itemDiv.querySelector('.delete-file-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 1. 데이터 배열에서 제거
            const idx = uploadedFiles.indexOf(fileObj);
            if (idx > -1) {
                uploadedFiles.splice(idx, 1);
            }

            // 2. DOM에서 제거
            itemDiv.remove();

            // 3. 인덱스 데이터 속성 재정렬 (체크박스 매칭 유지용)
            document.querySelectorAll('.lib-checkbox').forEach((cb, i) => {
                cb.dataset.index = i;
            });

            // 4. 삭제한 파일이 현재 선택된 파일인 경우 처리
            if (selectedFileObj === fileObj) {
                if (uploadedFiles.length > 0) {
                    selectVideo(uploadedFiles[0]);
                } else {
                    selectedFileObj = null;
                    currentVideoPath = null;
                    mainPlayer.pause();
                    mainPlayer.src = "";
                    mainPlayer.classList.add('hidden');
                    placeholderMsg.classList.remove('hidden');
                    document.getElementById('header-filename').textContent = "비디오를 선택하세요";
                    document.getElementById('header-resolution').textContent = "영상 정보가 여기에 표시됩니다";
                    
                    // 타임라인 숨기지 않고 초기화만 수행
                    trimStartDisplay.textContent = "시작: 00:00:00";
                    trimEndDisplay.textContent = "종료: 00:00:00";
                    currentTimeDisplay.textContent = "00:00:00";
                    document.getElementById('total-time-display').textContent = "00:00:00";
                    handleLeft.style.left = "0%";
                    handleRight.style.left = "100%";
                    playhead.style.transform = "translateX(0)";
                    const mLeft = document.getElementById('mask-left');
                    const mRight = document.getElementById('mask-right');
                    if (mLeft) mLeft.style.width = "0%";
                    if (mRight) mRight.style.width = "0%";
                }
            }
            
            updateBatchButtonState();
        });

        itemDiv.addEventListener('click', () => {
            selectVideo(fileObj);
        });
        libraryList.appendChild(itemDiv);
        updateBatchButtonState();
    }

    async function runConversion(useOverride = false) {
        const checkboxes = document.querySelectorAll('.lib-checkbox:checked');
        let selectedFiles = [];

        if (checkboxes.length > 0) {
            selectedFiles = Array.from(checkboxes).map(cb => uploadedFiles[parseInt(cb.dataset.index)]);
        } else if (selectedFileObj) {
            selectedFiles = [selectedFileObj];
        } else {
            alert("변환할 비디오를 선택하거나 체크해주세요.");
            return;
        }

        // Current UI values (for override mode)
        const uiFps = parseInt(fpsSlider.value);
        const resActive = document.querySelector('#res-dropdown .dropdown-item.active');
        let uiResolution = resActive ? resActive.dataset.value : "중간 (720p)";
        if (uiResolution === "직접 설정") {
            uiResolution = `${customWidthInput.value}:${customHeightInput.value}`;
        }
        const colorsActive = document.querySelector('#colors-dropdown .dropdown-item.active');
        const uiNumColors = colorsActive ? parseInt(colorsActive.dataset.value) : 256;
        const uiUseDither = ditherToggle.dataset.active === 'true';
        const uiLoopPlayback = loopToggle.dataset.active === 'true';

        convertBtn.disabled = true;
        convertBtn.style.opacity = '0.5';
        convertSplitBtn.disabled = true;

        let successCount = 0;

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const fileObj = selectedFiles[i];
                updateStatus(`변환 중... (${i + 1}/${selectedFiles.length}) : ${fileObj.name}`);

                let outName = "output_" + fileObj.name.replace(/\.[^/.]+$/, "") + ".gif";
                const start = fileObj.trimStart;
                const end = fileObj.trimEnd || 99999;
                
                let fps, resolution, numColors, useDither, loopPlayback;

                if (useOverride) {
                    fps = uiFps;
                    resolution = uiResolution;
                    numColors = uiNumColors;
                    useDither = uiUseDither;
                    loopPlayback = uiLoopPlayback;
                } else {
                    fps = fileObj.fps || 24;
                    resolution = fileObj.resolution || "중간 (720p)";
                    if (resolution === "직접 설정") {
                        const w = fileObj.customWidth || fileObj.width;
                        const h = fileObj.customHeight || fileObj.height;
                        resolution = `${w}:${h}`;
                    }
                    numColors = fileObj.numColors || 256;
                    useDither = fileObj.useDither || false;
                    loopPlayback = fileObj.loopPlayback !== undefined ? fileObj.loopPlayback : true;
                }

                const res = await eel.convert_to_gif(fileObj.path, outName, start, end, fps, resolution, numColors, useDither, loopPlayback)();

                if (res.status === 'success') {
                    successCount++;
                    updateStatus(`${fileObj.name} 완료!`);
                    await new Promise(r => setTimeout(r, 300));
                } else {
                    console.error("오류: " + res.message);
                }
            }
            updateStatus(`완료! 총 ${successCount}개 변환 완료.`);
            setTimeout(() => updateStatus(""), 4000);
        } catch (error) {
            updateStatus("변환 실패: " + error);
        } finally {
            convertBtn.disabled = false;
            convertBtn.style.opacity = '1';
            convertSplitBtn.disabled = false;
            updateBatchButtonState();
        }
    }

    convertBtn.addEventListener('click', () => runConversion(false));
});
