document.addEventListener('DOMContentLoaded', () => {
    const uploadInput = document.getElementById('video-upload');
    const addBtn = document.getElementById('add-video-btn');
    const libraryList = document.getElementById('library-list');
    const mainPlayer = document.getElementById('main-player');
    const placeholderMsg = document.getElementById('placeholder-msg');
    const convertBtn = document.getElementById('convert-btn');
    const statusMsg = document.getElementById('status-msg');

    const fpsSlider = document.getElementById('fps-slider');
    const fpsDisplay = document.getElementById('fps-display');
    const resSelect = document.getElementById('res-select');

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

    // Update FPS display
    fpsSlider.addEventListener('input', (e) => {
        fpsDisplay.textContent = `${e.target.value} FPS`;
    });

    const selectAllLib = document.getElementById('select-all-lib');
    selectAllLib.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.lib-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
        });
    });

    let uploadedFiles = [];

    // NATIVE FILE PICKER
    addBtn.addEventListener('click', async () => {
        statusMsg.textContent = "탐색기에서 파일을 선택해주세요...";
        const paths = await eel.pick_videos()();

        if (!paths || paths.length === 0) {
            statusMsg.textContent = "취소됨.";
            return;
        }

        for (const path of paths) {
            statusMsg.textContent = "파일 정보 가져오는 중...";
            const res = await eel.get_file_info(path)();

            if (res.status === 'success') {
                // 맥(Safari)의 강력한 보안 정책 때문에 http:// 로 띄운 창에서는 file:// 에 직접 접근이 차단됩니다.
                // 따라서 다시 파이썬 로컬 서버를 거치는 안전한 방식으로 되돌립니다.
                const cleanPath = res.path.startsWith('/') ? res.path.slice(1) : res.path;
                const objectUrl = `/local_file/${encodeURI(cleanPath)}`;

                const fileObj = {
                    name: res.name,
                    path: res.path,
                    objectUrl: objectUrl,
                    size: res.size,
                    fps: res.fps || 30.0, // 파이썬에서 추출한 원본 FPS 저장
                    trimStart: 0,
                    trimEnd: 0,
                    duration: 0,
                    filmstrip: [],
                    aspectRatio: 16 / 9
                };
                uploadedFiles.push(fileObj);
                addLibraryItem(fileObj);

                if (uploadedFiles.length === 1 || !selectedFileObj) {
                    selectVideo(fileObj);
                }
                statusMsg.textContent = "파일 추가됨.";
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
        selectedFileObj = fileObj;
        currentVideoPath = fileObj.path;
        currentVideoFileName = fileObj.name;

        document.getElementById('header-filename').textContent = fileObj.name;
        mainPlayer.classList.remove('hidden');
        placeholderMsg.classList.add('hidden');
        
        // 타임라인 영역 표시 (항상 보이게 했으므로 보장)
        const tArea = document.getElementById('timeline-area');
        if (tArea) tArea.classList.remove('hidden');

        mainPlayer.onloadedmetadata = () => {
            fileObj.duration = mainPlayer.duration;
            fileObj.aspectRatio = mainPlayer.videoWidth / mainPlayer.videoHeight;

            // 영상 정보 표시 (해상도, 형식, 러닝타임, 원본 FPS)
            const w = mainPlayer.videoWidth;
            const h = mainPlayer.videoHeight;
            
            // 러닝타임을 00m 00s 형식으로 변환 (소수점 제거)
            const totalSecsRounded = Math.round(fileObj.duration);
            const displayMins = Math.floor(totalSecsRounded / 60);
            const displaySecs = totalSecsRounded % 60;
            const durStr = `${displayMins.toString().padStart(2, '0')}m ${displaySecs.toString().padStart(2, '0')}s`;
            
            const ext = fileObj.name.split('.').pop().toUpperCase();
            const sourceFps = fileObj.fps ? fileObj.fps.toFixed(2) : "30.00";
            
            document.getElementById('header-resolution').textContent = `${w}x${h} • ${ext} • ${durStr} • ${sourceFps} FPS`;

            if (fileObj.trimEnd === 0) {
                fileObj.trimEnd = fileObj.duration;
            }
            videoDuration = fileObj.duration;
            totalTimeDisplay.textContent = formatTime(fileObj.duration);
            
            timelineTrack.style.width = "100%";

            updateTimelineUI();
            // generateFilmstrip(fileObj); // 썸네일 생성 기능 제거

        };

        mainPlayer.onerror = (e) => {
            console.error("Video loading error:", e);
            statusMsg.textContent = "비디오 로드 오류: 파일 경로를 확인해주세요.";
        };

        // 비디오 화면 클릭 시 재생/일시정지 토글
        mainPlayer.addEventListener('click', togglePlayPause);
        
        // 아이콘 즉각 반응을 위한 네이티브 이벤트 리스너 추가
        mainPlayer.addEventListener('play', () => {
            if (playIcon) playIcon.textContent = 'pause';
            // 비디오가 재생을 시작할 때 렌더 루프 강제 재가동 (rvfc 특성 대응)
            if ('requestVideoFrameCallback' in mainPlayer) {
                mainPlayer.requestVideoFrameCallback(updateUIFrame);
            }
        });

        mainPlayer.addEventListener('pause', () => {
            if (playIcon) playIcon.textContent = 'play_arrow';
        });

        // Safari needs explicit load() call sometimes
        mainPlayer.src = fileObj.objectUrl;
        mainPlayer.load();
    }

    // 재생/일시정지 통합 제어 함수 (반응성 최적화)
    function togglePlayPause() {
        if (!selectedFileObj) return;
        if (mainPlayer.paused) {
            mainPlayer.play().catch(err => console.error("Play error:", err));
        } else {
            mainPlayer.pause();
        }
        // UI 아이콘은 updateUIFrame 루프에서 자동으로 즉시 업데이트됨
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

    function updateTimelineUI() {
        if (!selectedFileObj || selectedFileObj.duration === 0) return;

        const duration = selectedFileObj.duration;
        const startPct = (selectedFileObj.trimStart / duration) * 100;
        const endPct = (selectedFileObj.trimEnd / duration) * 100;

        // 핸들 위치 (중앙 정렬)
        handleLeft.style.left = `${startPct}%`;
        handleLeft.style.transform = 'translateX(-50%)';
        handleRight.style.left = `${endPct}%`;
        handleRight.style.transform = 'translateX(-50%)';

        // 인아웃 구간 외부 마스크 (어둡게 처리)
        const mLeft = document.getElementById('mask-left');
        const mRight = document.getElementById('mask-right');
        if (mLeft) mLeft.style.width = `${startPct}%`;
        if (mRight) mRight.style.width = `${100 - endPct}%`;

        trimStartDisplay.textContent = `시작: ${formatTime(selectedFileObj.trimStart)}`;
        trimEndDisplay.textContent = `종료: ${formatTime(selectedFileObj.trimEnd)}`;
        
        const currentPct = (mainPlayer.currentTime / duration) * 100;
        playhead.style.left = `${currentPct}%`;

        // 타임코드 업데이트
        currentTimeDisplay.textContent = formatTime(mainPlayer.currentTime);
        
        // 재생 아이콘 상태 업데이트
        if (mainPlayer.paused) {
            playIcon.textContent = 'play_arrow';
        } else {
            playIcon.textContent = 'pause';
        }
    }

    document.addEventListener('keydown', (e) => {
        if (!selectedFileObj) return;
        const curTime = mainPlayer.currentTime;
        const duration = selectedFileObj.duration;
        const sourceFps = selectedFileObj.fps || 30;
        const frameTime = 1 / sourceFps; // 1프레임당 시간

        // Option(Alt) 조합키 처리
        if (e.altKey) {
            if (e.code === 'KeyI') {
                e.preventDefault();
                selectedFileObj.trimStart = 0;
                statusMsg.textContent = "시작점(IN) 초기화됨";
                updateTimelineUI();
            } else if (e.code === 'KeyO') {
                e.preventDefault();
                selectedFileObj.trimEnd = duration;
                statusMsg.textContent = "종료점(OUT) 초기화됨";
                updateTimelineUI();
            } else if (e.code === 'KeyX') {
                e.preventDefault();
                selectedFileObj.trimStart = 0;
                selectedFileObj.trimEnd = duration;
                statusMsg.textContent = "전체 구간 초기화됨";
                updateTimelineUI();
            }
            return;
        }

        // e.code를 사용하면 한글/영문 모드에 상관없이 작동하며,
        // preventDefault()를 통해 맥의 "뽁!" 소리를 방지합니다.
        if (e.code === 'KeyI') {
            e.preventDefault();
            selectedFileObj.trimStart = Math.min(curTime, selectedFileObj.trimEnd - 0.1);
            statusMsg.textContent = "시작점(IN) 설정됨";
            updateTimelineUI();
        } else if (e.code === 'KeyO') {
            e.preventDefault();
            selectedFileObj.trimEnd = Math.max(curTime, selectedFileObj.trimStart + 0.1);
            statusMsg.textContent = "종료점(OUT) 설정됨";
            updateTimelineUI();
        } else if (e.code === 'Space') {
            e.preventDefault();
            togglePlayPause();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            mainPlayer.pause();
            
            let jumpFrames = 1;
            if (e.metaKey && e.shiftKey) jumpFrames = 10; // Cmd + Shift
            else if (e.shiftKey) jumpFrames = 5;         // Shift
            
            mainPlayer.currentTime = Math.max(0, curTime - (frameTime * jumpFrames));
            updateTimelineUI(); 
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            mainPlayer.pause();
            
            let jumpFrames = 1;
            if (e.metaKey && e.shiftKey) jumpFrames = 10; // Cmd + Shift
            else if (e.shiftKey) jumpFrames = 5;         // Shift

            mainPlayer.currentTime = Math.min(duration, curTime + (frameTime * jumpFrames));
            updateTimelineUI();
        } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            mainPlayer.currentTime = selectedFileObj.trimStart; // 시작점(IN)으로 점프
            updateTimelineUI();
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            mainPlayer.currentTime = selectedFileObj.trimEnd; // 종료점(OUT)으로 점프
            updateTimelineUI();
        }
    });
    playPauseBtn.addEventListener('click', togglePlayPause);

    // 볼륨 조절 로직
    function updateVolumeSliderFill(val) {
        const percentage = val * 100;
        // 테마에 맞춘 파란색 계열(indigo-600: #4f46e5)로 배경 채우기
        volumeSlider.style.background = `linear-gradient(to right, #4f46e5 ${percentage}%, #e2e8f0 ${percentage}%)`;
    }

    volumeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        mainPlayer.volume = val;
        mainPlayer.muted = (val == 0);
        updateVolumeIcon();
        updateVolumeSliderFill(val);
    });

    muteBtn.addEventListener('click', () => {
        mainPlayer.muted = !mainPlayer.muted;
        if (!mainPlayer.muted && mainPlayer.volume === 0) {
            mainPlayer.volume = 0.5;
            volumeSlider.value = 0.5;
        }
        updateVolumeIcon();
        updateVolumeSliderFill(mainPlayer.muted ? 0 : mainPlayer.volume);
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
        mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - 0.033);
        updateTimelineUI();
    });

    stepForwardBtn.addEventListener('click', () => {
        if (!selectedFileObj) return;
        mainPlayer.pause();
        mainPlayer.currentTime = Math.min(selectedFileObj.duration, mainPlayer.currentTime + 0.033);
        updateTimelineUI();
    });


    // 실시간 스크러빙 및 트리밍 로직
    let isScrubbing = false;
    let isDraggingLeft = false;
    let isDraggingRight = false;

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

    document.addEventListener('mousemove', (e) => {
        if (!selectedFileObj) return;
        if (!isScrubbing && !isDraggingLeft && !isDraggingRight) return;

        const rect = timelineTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;
        const time = pct * selectedFileObj.duration;

        if (isScrubbing) {
            mainPlayer.currentTime = time;
            // 스크러빙 시 재생 바를 즉시 이동시켜 반응성을 높임
            playhead.style.left = `${pct * 100}%`;
        } else if (isDraggingLeft) {
            selectedFileObj.trimStart = Math.max(0, Math.min(time, selectedFileObj.trimEnd - 0.1));
            mainPlayer.currentTime = selectedFileObj.trimStart;
        } else if (isDraggingRight) {
            selectedFileObj.trimEnd = Math.min(selectedFileObj.duration, Math.max(time, selectedFileObj.trimStart + 0.1));
            mainPlayer.currentTime = selectedFileObj.trimEnd;
        }

        updateTimelineUI();
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
        mainPlayer.currentTime = pct * selectedFileObj.duration;
        
        // 클릭 즉시 UI 업데이트하여 반응성 극대화
        updateTimelineUI();
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

        const currentTime = mainPlayer.currentTime;
        const start = selectedFileObj.trimStart;
        const end = selectedFileObj.trimEnd;

        // 사파리 특성을 고려한 루프 로직
        if (currentTime < start - 0.3) {
            mainPlayer.currentTime = start;
        }

        if (currentTime >= end) {
            mainPlayer.currentTime = start;
            if (mainPlayer.paused) mainPlayer.play().catch(() => { });
        }
    });

    // 완벽한 프레임 동기화를 위한 렌더 루프
    // requestVideoFrameCallback을 지원하면 영상의 실제 프레임 시간에 맞춰 렌더링하고, 없으면 requestAnimationFrame 사용
    function updateUIFrame(now, metadata) {
        if (selectedFileObj && !isScrubbing && !isDraggingLeft && !isDraggingRight) {
            // metadata.mediaTime이 있으면 가장 정확한 비디오의 프레임 시간 사용
            const currentTime = metadata && metadata.mediaTime ? metadata.mediaTime : mainPlayer.currentTime;
            const duration = selectedFileObj.duration;
            if (duration > 0) {
                const pct = (currentTime / duration) * 100;
                playhead.style.left = `${pct}%`;
                currentTimeDisplay.textContent = formatTime(currentTime);
            }
        }
        
        if ('requestVideoFrameCallback' in mainPlayer) {
            mainPlayer.requestVideoFrameCallback(updateUIFrame);
        } else {
            requestAnimationFrame(updateUIFrame);
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
            <div class="flex gap-3">
                <div class="flex items-center">
                    <input type="checkbox" class="lib-checkbox w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" data-index="${index}" />
                </div>
            <!-- Modern Timeline Scrubber -->
            <div id="timeline-container" class="w-full mt-8 px-4 hidden">
                <div class="relative h-6 bg-[#333] rounded-sm select-none cursor-pointer" id="timeline-track">
                    <!-- Selected Range Highlight -->
                    <div id="trim-range" class="absolute h-full bg-white/10 border-x border-white/30 z-10"></div>
                    
                    <!-- Handles -->
                    <div id="handle-left" class="absolute h-full w-2 bg-white cursor-ew-resize z-20"></div>
                    <div id="handle-right" class="absolute h-full w-2 bg-white cursor-ew-resize z-20"></div>
                    
                    <!-- Playhead (The white line with top indicator) -->
                    <div id="playhead" class="absolute h-full w-[2px] bg-white z-30 pointer-events-none">
                        <div class="absolute -top-1 -left-[5px] w-3 h-3 bg-white rotate-45"></div>
                    </div>
                </div>
            </div>
          <div class="flex flex-col justify-center overflow-hidden">
                    <span class="truncate font-semibold text-on-surface">${fileObj.name}</span>
                    <span class="text-xs text-slate-500">${sizeMb} MB</span>
                </div>
            </div>
        `;

        const checkbox = itemDiv.querySelector('.lib-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        itemDiv.addEventListener('click', () => {
            selectVideo(fileObj);
        });
        libraryList.appendChild(itemDiv);
    }

    convertBtn.addEventListener('click', async () => {
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

        const fps = fpsSlider.value;
        
        const resActive = document.querySelector('#res-dropdown .dropdown-item.active');
        const resolution = resActive ? resActive.textContent : "중간 (720p)";

        const colorsActive = document.querySelector('#colors-dropdown .dropdown-item.active');
        const numColors = colorsActive ? parseInt(colorsActive.dataset.value) : 256;
        const ditherToggle = document.getElementById('dither-toggle');
        const useDither = ditherToggle.dataset.active === 'true';
        const loopToggle = document.getElementById('loop-toggle');
        const loopPlayback = loopToggle.dataset.active === 'true';

        convertBtn.disabled = true;
        convertBtn.style.opacity = '0.5';

        let successCount = 0;

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const fileObj = selectedFiles[i];
                statusMsg.textContent = `변환 중... (${i + 1}/${selectedFiles.length}) : ${fileObj.name}`;

                let outName = "output_" + fileObj.name.replace(/\.[^/.]+$/, "") + ".gif";
                const start = fileObj.trimStart;
                const end = fileObj.trimEnd || 99999;

                const res = await eel.convert_to_gif(fileObj.path, outName, start, end, fps, resolution, numColors, useDither, loopPlayback)();

                if (res.status === 'success') {
                    successCount++;
                    statusMsg.textContent = `${fileObj.name} 완료! (outputs 폴더 확인)`;

                    const a = document.createElement('a');
                    a.href = res.data;
                    a.download = outName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    await new Promise(r => setTimeout(r, 500));
                } else {
                    console.error("오류: " + res.message);
                    alert(`오류 (${fileObj.name}): ` + res.message);
                }
            }
            statusMsg.textContent = `완료! 총 ${successCount}개 변환 완료.`;
        } catch (error) {
            statusMsg.textContent = "변환 실패: " + error;
        } finally {
            convertBtn.disabled = false;
            convertBtn.style.opacity = '1';
        }
    });
});
