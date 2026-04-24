document.addEventListener('DOMContentLoaded', () => {
    // 폰트 로딩 감지 및 아이콘 노출 제어
    if (document.fonts) {
        document.fonts.ready.then(() => {
            document.body.classList.add('fonts-loaded');
        });
    } else {
        setTimeout(() => document.body.classList.add('fonts-loaded'), 1000);
    }

    const uploadInput = document.getElementById('video-upload');
    const addBtn = document.getElementById('add-video-btn');
    const addBtnCompact = document.getElementById('add-video-btn-compact');
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
    const addSegmentBtn = document.getElementById('add-segment-btn');

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
    let selectedSegmentObj = null; // 현재 선택된 구간
    let uploadedFiles = [];
    let isProcessingFiles = false;
    
    // 병렬 프록시 큐 관리자
    const proxyQueue = [];
    let activeProxyCount = 0;
    const MAX_CONCURRENT_PROXIES = 3; 
    
    // 병렬 변환(GIF 인코딩) 큐 관리자
    const conversionQueue = [];
    let activeConversionCount = 0;
    const MAX_CONCURRENT_CONVERSIONS = 2; 
    let totalBatchCount = 0; // 이번 배치 작업의 총 파일 수
    let completedBatchCount = 0; // 완료된 파일 수
    
    // 프록시 및 변환 완료 대기를 위한 Promise 관리
    const proxyResolvers = new Map();
    const conversionResolvers = new Map();

    // --- OS Detection & DnD Blocking ---
    let currentOS = 'Unknown';
    const dropOverlay = document.getElementById('drop-overlay');

    async function initOS() {
        try {
            currentOS = await eel.get_os_info()();
            console.log("Current OS detected:", currentOS);
            
            // Windows인 경우 드래그 앤 드롭 오버레이 비활성화
            if (currentOS === 'Windows') {
                if (dropOverlay) dropOverlay.remove(); // 아예 제거하여 혼동 방지
            } else {
                // Mac 등 타 OS에서는 드래그 앤 드롭 이벤트 활성화 및 텍스트 안내 추가
                initDragAndDrop();
                const subtext = document.getElementById('add-video-subtext');
                if (subtext) {
                    subtext.innerHTML = "이곳을 클릭하거나 파일을 끌어다 놓아<br>비디오를 추가하세요";
                }
            }
        } catch (e) {
            console.error("OS detection failed", e);
            initDragAndDrop(); // 폴백
        }
    }

    function updateLibraryEmptyState() {
        if (uploadedFiles.length === 0) {
            if (addBtn) addBtn.classList.remove('hidden');
            if (addBtnCompact) addBtnCompact.classList.add('hidden');
        } else {
            if (addBtn) addBtn.classList.add('hidden');
            if (addBtnCompact) addBtnCompact.classList.remove('hidden');
        }
    }

    function initDragAndDrop() {
        if (!dropOverlay) return;

        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropOverlay.classList.add('active');
        });

        window.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) {
                dropOverlay.classList.remove('active');
            }
        });

        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropOverlay.classList.remove('active');
            
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const paths = [];
                for (let i = 0; i < files.length; i++) {
                    const path = files[i].pywebviewFullPath || files[i].path;
                    if (path) paths.push(path);
                }
                if (paths.length > 0) processFilePaths(paths);
            }
        });
    }

    initOS();

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
        if (selectedSegmentObj) selectedSegmentObj.resolution = val;
        
        if (val === "직접 설정") {
            customResContainer.classList.remove('hidden');
            if (selectedSegmentObj) {
                customWidthInput.value = selectedSegmentObj.customWidth || selectedFileObj.width;
                customHeightInput.value = selectedSegmentObj.customHeight || selectedFileObj.height;
            }
        } else {
            customResContainer.classList.add('hidden');
        }
    });

    customWidthInput.addEventListener('input', () => {
        const val = parseInt(customWidthInput.value);
        if (selectedSegmentObj) selectedSegmentObj.customWidth = val;
        
        if (aspectRatioLock.checked && selectedFileObj && selectedSegmentObj) {
            const ratio = selectedFileObj.width / selectedFileObj.height;
            customHeightInput.value = Math.round(val / ratio);
            selectedSegmentObj.customHeight = parseInt(customHeightInput.value);
        }
    });

    customHeightInput.addEventListener('input', () => {
        const val = parseInt(customHeightInput.value);
        if (selectedSegmentObj) selectedSegmentObj.customHeight = val;
        
        if (aspectRatioLock.checked && selectedFileObj && selectedSegmentObj) {
            const ratio = selectedFileObj.width / selectedFileObj.height;
            customWidthInput.value = Math.round(val * ratio);
            selectedSegmentObj.customWidth = parseInt(customWidthInput.value);
        }
    });

    aspectRatioLock.addEventListener('change', () => {
        if (selectedSegmentObj) selectedSegmentObj.aspectRatioLock = aspectRatioLock.checked;
    });

    colorsDropdown.addEventListener('change', (e) => {
        if (selectedSegmentObj) selectedSegmentObj.numColors = parseInt(e.detail.value);
    });

    // Update FPS display
    fpsSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        fpsDisplay.textContent = `${val} FPS`;
        if (selectedSegmentObj) selectedSegmentObj.fps = val;
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
        if (selectedSegmentObj) selectedSegmentObj.loopPlayback = active;
    });

    ditherToggle.addEventListener('click', () => {
        const active = ditherToggle.dataset.active !== 'true';
        updateToggleUI(ditherToggle, active);
        if (selectedSegmentObj) selectedSegmentObj.useDither = active;
    });

    function updateBatchButtonState() {
        const checkedBoxes = document.querySelectorAll('.lib-checkbox:checked');
        const checkedCount = checkedBoxes.length;
        const isBatch = checkedCount >= 2;
        const splitPart = document.getElementById('split-part');
        const convertBtn = document.getElementById('convert-btn');
        
        // 일괄 변환 버튼 (메인 변환 영역)
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

        // 일괄 삭제 바 (사이드바 하단) - 2개 이상 선택 시에만 표시
        const bulkDeleteBar = document.getElementById('bulk-delete-bar');
        const bulkSelectCountText = document.getElementById('bulk-select-count');
        
        if (checkedCount >= 2) {
            bulkSelectCountText.textContent = `${checkedCount}개 선택됨`;
            bulkDeleteBar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
            bulkDeleteBar.classList.add('translate-y-0');
        } else {
            bulkDeleteBar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
            bulkDeleteBar.classList.remove('translate-y-0');
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


    async function processFilePaths(filePaths) {
        if (!filePaths || filePaths.length === 0 || isProcessingFiles) return;
        isProcessingFiles = true;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const totalFiles = filePaths.length;
        let processedCount = 0;

        for (const path of filePaths) {
            try {
                if (uploadedFiles.some(f => f.path === path)) continue;

                const res = await eel.get_file_info(path)();
                if (res.status === "error") continue;

                let initialUrl = `/local_file/${res.path.split('/').map(encodeURIComponent).join('/')}`;
                let proxyPath = res.proxy_path || null;
                
                if (proxyPath) {
                    const safeProxyPath = proxyPath.replace(/\\/g, '/');
                    initialUrl = `/local_file/${safeProxyPath.split('/').map(encodeURIComponent).join('/')}`;
                }

                const fileObj = {
                    id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: res.name,
                    path: res.path,
                    size: res.size,
                    duration: res.duration || 0,
                    width: res.width || 1280,
                    height: res.height || 720,
                    fps: res.fps || 24,
                    objectUrl: initialUrl,
                    proxyPath: proxyPath,
                    segments: [], // 구간 목록
                    activeSegmentId: null, // 현재 편집 중인 구간 ID
                    isProxying: false,
                    proxyStatusShown: false
                };

                // 기본 편집용 드래프트 생성 (목록에는 추가하지 않음)
                fileObj.draft = {
                    id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    start: 0,
                    end: res.duration || 0,
                    fps: res.fps || 24,
                    resolution: "중간 (720p)",
                    numColors: 256,
                    useDither: false,
                    loopPlayback: true,
                    aspectRatioLock: aspectRatioLock.checked,
                    customWidth: parseInt(customWidthInput.value) || res.width,
                    customHeight: parseInt(customHeightInput.value) || res.height,
                    status: 'idle',
                    progress: 0
                };
                fileObj.activeSegmentId = null; 

                uploadedFiles.push(fileObj);
                addLibraryItem(fileObj);

                if (isMac && res.name.toLowerCase().endsWith('.webm')) {
                    proxyQueue.push(fileObj);
                }

                processedCount++;
                updateStatus(`파일 로드 중... (${processedCount}/${totalFiles})`);
            } catch (err) {
                console.error("File load error:", err);
            }
        }

        processProxyQueue();
        isProcessingFiles = false;

        if (processedCount > 0) {
            updateLibraryEmptyState();
            updateStatus(`${processedCount}개의 파일을 불러왔습니다.`);
            setTimeout(() => updateStatus(""), 3000);
            if (!selectedFileObj && uploadedFiles.length > 0) {
                selectVideo(uploadedFiles[0]);
            }
        }
    }

    // 파일 선택 통합 처리 함수
    async function handlePickVideos() {
        console.log("Picking videos...");
        try {
            const paths = await eel.pick_videos()();
            console.log("Picked paths:", paths);
            if (paths && paths.length > 0) {
                processFilePaths(paths);
            }
        } catch (err) {
            console.error("Error picking videos via Eel:", err);
            // Fallback: Native file input
            if (uploadInput) uploadInput.click();
        }
    }

    // 파일 추가 버튼 (네이티브 선택창 사용)
    if (addBtn) {
        addBtn.addEventListener('click', handlePickVideos);
    }
    if (addBtnCompact) {
        addBtnCompact.addEventListener('click', handlePickVideos);
    }

    // 숨겨진 input[type=file] 변경 이벤트 처리 (Fallback용)
    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const paths = Array.from(files).map(f => f.path || f.name); // Browser security limits full path
                processFilePaths(paths);
            }
        });
    }

    // Python에서 진행률 업데이트 시 호출
    eel.expose(update_proxy_progress);
    function update_proxy_progress(file_id, progress) {
        const item = document.querySelector(`[data-id="${file_id}"]`);
        if (!item) return;
        
        const bar = item.querySelector('.proxy-progress-bar');
        const container = item.querySelector('.proxy-progress-container');
        const statusText = item.querySelector('.proxy-status-text');
        const metadata = item.querySelector('.file-metadata');
        
        if (container) container.classList.remove('hidden');
        if (bar) bar.style.width = `${progress}%`;
        
        // 프록시 생성 중에는 용량/포맷 정보를 숨겨 레이아웃 붕괴 방지
        if (progress < 100) {
            if (metadata) metadata.classList.add('hidden');
        }

        // 만약 현재 플레이어에 떠있는 파일이라면 중앙 오버레이도 업데이트
        const overlay = document.getElementById('proxy-overlay');
        const overlayProgress = document.getElementById('proxy-overlay-progress');
        if (selectedFileObj && selectedFileObj.id === file_id) {
            if (overlay) overlay.classList.remove('hidden');
            if (overlayProgress) overlayProgress.textContent = `${progress}%`;
        }

        if (statusText) {
            if (progress >= 100) {
                statusText.textContent = "변환 완료";
                if (metadata) metadata.classList.remove('hidden'); // 다시 노출
                // 프록시 배지 노출
                const badge = item.querySelector('.proxy-badge');
                if (badge) badge.classList.remove('hidden');
                
                setTimeout(() => {
                    if (container) container.classList.add('hidden');
                    statusText.textContent = "";
                    if (selectedFileObj && selectedFileObj.id === file_id && overlay) {
                        overlay.classList.add('hidden');
                    }
                }, 2000);
            } else {
                statusText.textContent = `프록시 생성 중... ${progress}%`;
            }
        }
    }

    // Python에서 변환 진행률 업데이트 시 호출
    eel.expose(update_conversion_status);
    function update_conversion_status(task_id, status, progress) {
        const [file_id, seg_id] = task_id.includes('@@') ? task_id.split('@@') : [task_id, null];
        
        const fileObj = uploadedFiles.find(f => f.id === file_id);
        if (!fileObj) return;

        const item = document.querySelector(`[data-id="${file_id}"]`);
        if (!item) return;
        
        if (seg_id) {
            const seg = fileObj.segments.find(s => s.id === seg_id);
            if (seg) {
                seg.status = 'encoding';
                seg.progress = progress;
                renderSegments(fileObj);
            }
        }

        const bar = item.querySelector('.conversion-progress-bar');
        const container = item.querySelector('.conversion-progress-container');
        const statusText = item.querySelector('.proxy-status-text'); 
        
        if (container) container.classList.remove('hidden');
        if (bar) bar.style.width = `${progress}%`;
        
        const metadata = item.querySelector('.file-metadata');
        if (metadata) metadata.classList.add('hidden');

        if (statusText) statusText.textContent = status;
        
        const currentNum = Math.min(totalBatchCount, completedBatchCount + activeConversionCount);
        updateStatus(`변환 중(${currentNum}/${totalBatchCount}): ${fileObj.name} (${progress}%)`);
    }

    // Python에서 프록시 변환 완료 시 호출 (복구)
    eel.expose(proxy_completed);
    function proxy_completed(file_id, result) {
        if (proxyResolvers.has(file_id)) {
            const resolver = proxyResolvers.get(file_id);
            proxyResolvers.delete(file_id);
            
            if (result.status === 'success') {
                const fileObj = uploadedFiles.find(f => f.id === file_id);
                if (fileObj) handleProxyReady(fileObj, result.proxy_path);
                resolver.resolve(result);
            } else {
                resolver.reject(new Error(result.message));
            }
        }
    }

    // Python에서 변환 완료 시 호출
    eel.expose(conversion_completed);
    function conversion_completed(task_id, result) {
        const [file_id, seg_id] = task_id.includes('@@') ? task_id.split('@@') : [task_id, null];
        
        if (conversionResolvers.has(task_id)) {
            const resolver = conversionResolvers.get(task_id);
            conversionResolvers.delete(task_id);
            resolver.resolve(result);
        }
        
        completedBatchCount++;
        
        const fileObj = uploadedFiles.find(f => f.id === file_id);
        const item = document.querySelector(`[data-id="${file_id}"]`);
        
        if (fileObj && seg_id) {
            const seg = fileObj.segments.find(s => s.id === seg_id);
            if (seg) {
                seg.status = result.status === 'success' ? 'completed' : 'error';
                seg.progress = 100;
                renderSegments(fileObj);
            }
        }

        if (item) {
            const statusText = item.querySelector('.proxy-status-text');
            if (result.status === 'success') {
                if (statusText) statusText.textContent = "완료";
                item.classList.add('border-green-400', 'bg-green-50');
                setTimeout(() => {
                    item.classList.remove('border-green-400', 'bg-green-50');
                    const metadata = item.querySelector('.file-metadata');
                    if (metadata) metadata.classList.remove('hidden');
                }, 3000);
            }
        }
    }

    function handleProxyReady(fileObj, proxyPath) {
        fileObj.isProxying = false;
        
        let safeProxyPath = proxyPath.replace(/\\/g, '/');
        if (safeProxyPath.startsWith('/')) safeProxyPath = safeProxyPath.substring(1);
        const newUrl = `/local_file/${safeProxyPath.split('/').map(encodeURIComponent).join('/')}`;
        
        fileObj.proxyPath = proxyPath;
        fileObj.objectUrl = newUrl;
        
        // 사이드바 목록의 프록시 배지 활성화
        const item = document.querySelector(`[data-id="${fileObj.id}"]`);
        if (item) {
            const badge = item.querySelector('.proxy-badge');
            if (badge) badge.classList.remove('hidden');
        }
        
        // 현재 선택된 파일이면 즉시 교체
        if (selectedFileObj && selectedFileObj.id === fileObj.id) {
            const timestamp = Date.now();
            mainPlayer.src = `${newUrl}?t=${timestamp}`;
            mainPlayer.load();
            
            mainPlayer.onloadeddata = () => {
                updateTimelineUI();
                document.getElementById('proxy-badge').classList.remove('hidden');
                if (!fileObj.proxyStatusShown) {
                    updateStatus("미리보기 준비 완료 (프록시)");
                    fileObj.proxyStatusShown = true;
                    setTimeout(() => updateStatus(""), 3000);
                }
            };
        }
    }

    async function startProxyConversion(fileObj) {
        if (fileObj.isProxying) return;
        fileObj.isProxying = true;
        
        // 시작 즉시 메타데이터 숨김 처리하여 깜빡임 방지
        const item = document.querySelector(`[data-id="${fileObj.id}"]`);
        if (item) {
            const metadata = item.querySelector('.file-metadata');
            if (metadata) metadata.classList.add('hidden');
            const container = item.querySelector('.proxy-progress-container');
            if (container) container.classList.remove('hidden');
        }

        const res = await eel.request_proxy(fileObj.path, fileObj.id)();
        
        if (res.status === 'success') {
            handleProxyReady(fileObj, res.proxy_path);
            return res;
        } else if (res.status === 'processing') {
            // 백그라운드 작업 완료를 기다리는 Promise 생성
            return new Promise((resolve, reject) => {
                proxyResolvers.set(fileObj.id, { resolve, reject });
            });
        } else {
            fileObj.isProxying = false;
            throw new Error(res.message);
        }
    }


    // Python에서 드래그 앤 드롭된 파일 경로를 보낼 때 호출되는 함수
    eel.expose(handle_dropped_files_from_python);
    function handle_dropped_files_from_python(paths) {
        processFilePaths(paths);
    }

    // 기존 중복 드래그 앤 드롭 로직 제거됨

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
    let isEditingSavedSegment = false; 

    function selectVideo(fileObj) {
        const isSameFile = (selectedFileObj && selectedFileObj.id === fileObj.id);
        
        // 상태 업데이트
        selectedFileObj = fileObj;
        selectedSegmentObj = getActiveSegment(fileObj);
        
        currentVideoPath = fileObj.path;
        currentVideoFileName = fileObj.name;
        
        document.getElementById('header-filename').textContent = fileObj.name;
        
        // 같은 파일인 경우 소스 로딩을 건너뛰고 UI 동기화 및 재생 시점만 조정합니다.
        if (isSameFile) {
            syncUIToFile(fileObj);
            updateTimelineUI();
            
            // 사용자가 선택한 세그먼트의 시작점으로 이동 (UX 개선)
            if (selectedSegmentObj) {
                mainPlayer.currentTime = selectedSegmentObj.start;
                updatePlayheadUI(selectedSegmentObj.start);
            }
            return;
        }

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
            
            mainPlayer.onloadeddata = () => {
                updateTimelineUI();
                
                // 로드 완료 후 선택된 세그먼트의 시작점으로 이동
                if (selectedSegmentObj) {
                    mainPlayer.currentTime = selectedSegmentObj.start;
                    updatePlayheadUI(selectedSegmentObj.start);
                }
                
                const activeSeg = getActiveSegment(fileObj);
                if (activeSeg) {
                    updateToggleUI(loopToggle, activeSeg.loopPlayback);
                    updateToggleUI(ditherToggle, activeSeg.useDither);
                    fpsSlider.value = activeSeg.fps;
                    fpsDisplay.textContent = `${activeSeg.fps} FPS`;
                }
                
                // 프록시 상태에 따른 오버레이 제어
                const overlay = document.getElementById('proxy-overlay');
                if (fileObj.isProxying) {
                    if (overlay) overlay.classList.remove('hidden');
                } else {
                    if (overlay) overlay.classList.add('hidden');
                }

                // 프록시 파일인 경우에만 상태 메시지 및 배지 표시
                if (fileObj.proxyPath) {
                    document.getElementById('proxy-badge').classList.remove('hidden');
                    if (!fileObj.proxyStatusShown) {
                        updateStatus("미리보기 준비 완료 (프록시)");
                        fileObj.proxyStatusShown = true;
                        setTimeout(() => updateStatus(""), 3000);
                    }
                } else {
                    document.getElementById('proxy-badge').classList.add('hidden');
                }
            };
            
            syncUIToFile(fileObj);
        }, 50);
    }

    function syncUIToFile(fileObj) {
        if (!fileObj) return;
        const seg = getActiveSegment(fileObj);
        if (!seg) return;

        // 1. FPS
        fpsSlider.value = seg.fps || 24;
        fpsDisplay.textContent = `${fpsSlider.value} FPS`;

        // 2. Resolution Dropdown
        const resValue = seg.resolution || "중간 (720p)";
        const resItems = document.querySelectorAll('#res-dropdown .dropdown-item');
        resItems.forEach(item => {
            if (item.dataset.value === resValue) {
                resItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.getElementById('res-selected').textContent = item.textContent;
            }
        });
        
        if (resValue === "직접 설정") {
            customWidthInput.value = seg.customWidth || fileObj.width;
            customHeightInput.value = seg.customHeight || fileObj.height;
            aspectRatioLock.checked = seg.aspectRatioLock !== undefined ? seg.aspectRatioLock : true;
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

    mainPlayer.addEventListener('error', async (e) => {
        const error = mainPlayer.error;
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        
        if (!error || !selectedFileObj) return;

        // 맥 환경이고 WebM 파일인 경우에만 프록시 변환 고려
        const isWebM = selectedFileObj.name.toLowerCase().endsWith('.webm');
        
        if (isMac && isWebM && error.code === 4) {
            if (!selectedFileObj.proxyPath && !selectedFileObj.isProxying) {
                console.warn("Mac WebM playback error. Starting proxy:", selectedFileObj.path);
                updateStatus("시스템 미지원 포맷입니다. 프록시를 생성합니다...");
                startProxyConversion(selectedFileObj);
            }
        } else {
            // 그 외의 일반적인 로딩 에러는 콘솔에만 출력하고 무시
            console.log("Transient video player error ignored:", error.code);
        }
    });

    function togglePlayPause() {
        if (!selectedFileObj) return;
        if (mainPlayer.paused) {
            mainPlayer.play().catch(err => console.error("Play error:", err));
        } else {
            mainPlayer.pause();
        }
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === undefined || seconds === null) seconds = 0;
        
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
        if (!selectedFileObj || !selectedSegmentObj || selectedFileObj.duration === 0) return;

        const duration = selectedFileObj.duration;
        const startPct = (selectedSegmentObj.start / duration) * 100;
        const endPct = (selectedSegmentObj.end / duration) * 100;

        // 핸들 락(Lock) 상태 반영
        const isLocked = selectedFileObj.activeSegmentId && !isEditingSavedSegment;
        handleLeft.classList.toggle('handle-locked', isLocked);
        handleRight.classList.toggle('handle-locked', isLocked);

        handleLeft.style.left = `${startPct}%`;
        handleLeft.style.transform = 'translateX(-50%)';
        handleRight.style.left = `${endPct}%`;
        handleRight.style.transform = 'translateX(-50%)';

        const mLeft = document.getElementById('mask-left');
        const mRight = document.getElementById('mask-right');
        if (mLeft) mLeft.style.width = `${startPct}%`;
        if (mRight) mRight.style.width = `${100 - endPct}%`;

        trimStartDisplay.textContent = `시작: ${formatTime(selectedSegmentObj.start)}`;
        trimEndDisplay.textContent = `종료: ${formatTime(selectedSegmentObj.end)}`;

        // 초기화 버튼 텍스트/스타일 전환
        if (resetBtn) {
            if (selectedFileObj.activeSegmentId && isEditingSavedSegment) {
                resetBtn.textContent = "수정 완료";
                resetBtn.classList.remove('bg-slate-200', 'hover:bg-slate-300');
                resetBtn.classList.add('bg-green-500', 'hover:bg-green-600', 'text-white');
            } else {
                resetBtn.textContent = "초기화";
                resetBtn.classList.add('bg-slate-200', 'hover:bg-slate-300');
                resetBtn.classList.remove('bg-green-500', 'hover:bg-green-600', 'text-white');
            }
        }
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
    // 타임라인에 이미 추가된 구간들을 시각적으로 표시 (Ghost Bars)
    function renderGhostMarkers() {
        const container = document.getElementById('ghost-markers-container');
        if (!container || !selectedFileObj) return;

        container.innerHTML = '';
        const duration = selectedFileObj.duration;
        if (!duration) return;

        selectedFileObj.segments.forEach(seg => {
            const marker = document.createElement('div');
            const startPct = (seg.start / duration) * 100;
            const widthPct = ((seg.end - seg.start) / duration) * 100;
            
            marker.className = `ghost-marker ${selectedFileObj.activeSegmentId === seg.id ? 'active' : ''}`;
            marker.style.left = `${startPct}%`;
            marker.style.width = `${widthPct}%`;
            
            container.appendChild(marker);
        });
    }

    function updateTimelineUI(forceTime = null) {
        updateTrimUI();
        updatePlayheadUI(forceTime);
        if (selectedFileObj) {
            renderSegments(selectedFileObj);
            renderGhostMarkers();
        }
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

    // Keyboard Shortcuts (Unified & Optimized)
    document.addEventListener('keydown', (e) => {
        // 입력 필드에서는 단축키 비활성화
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (!selectedFileObj) return;

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? e.metaKey : e.ctrlKey; // Mac: Cmd, Win: Ctrl
        const altKey = e.altKey;
        const shiftKey = e.shiftKey;
        const code = e.code; // e.key 대신 e.code를 사용하여 한글 상태에서도 정상 작동 (ㅑ -> KeyI)

        // 단축키 매핑 및 시스템 비프음(뽁 소리) 방지
        switch (code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;
                
            case 'KeyI':
                e.preventDefault();
                if (altKey) {
                    selectedSegmentObj.start = 0;
                } else {
                    selectedSegmentObj.start = mainPlayer.currentTime;
                    if (selectedSegmentObj.start >= selectedSegmentObj.end) {
                        selectedSegmentObj.end = Math.min(selectedFileObj.duration, selectedSegmentObj.start + 0.1);
                    }
                }
                updateTimelineUI();
                break;
                
            case 'KeyO':
                e.preventDefault();
                if (altKey) {
                    selectedSegmentObj.end = selectedFileObj.duration;
                } else {
                    selectedSegmentObj.end = mainPlayer.currentTime;
                    if (selectedSegmentObj.end <= selectedSegmentObj.start) {
                        selectedSegmentObj.start = Math.max(0, selectedSegmentObj.end - 0.1);
                    }
                }
                updateTimelineUI();
                break;
                
            case 'KeyX':
                if (altKey) {
                    e.preventDefault();
                    selectedSegmentObj.start = 0;
                    selectedSegmentObj.end = selectedFileObj.duration;
                    updateTimelineUI();
                }
                break;

            case 'Enter':
                e.preventDefault();
                addNewSegment();
                break;
                
            case 'ArrowLeft':
                e.preventDefault();
                mainPlayer.pause();
                const fpsL = selectedFileObj.fps || 30;
                let jumpL = 1 / fpsL;
                if (shiftKey && modKey) jumpL = 10 / fpsL;
                else if (shiftKey) jumpL = 5 / fpsL;
                mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - jumpL);
                updateTimelineUI();
                break;
                
            case 'ArrowRight':
                e.preventDefault();
                mainPlayer.pause();
                const fpsR = selectedFileObj.fps || 30;
                let jumpR = 1 / fpsR;
                if (shiftKey && modKey) jumpR = 10 / fpsR;
                else if (shiftKey) jumpR = 5 / fpsR;
                mainPlayer.currentTime = Math.min(selectedFileObj.duration, mainPlayer.currentTime + jumpR);
                updateTimelineUI();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (selectedSegmentObj) {
                    mainPlayer.currentTime = selectedSegmentObj.start;
                    updateTimelineUI();
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (selectedSegmentObj) {
                    mainPlayer.currentTime = selectedSegmentObj.end;
                    updateTimelineUI();
                }
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

    async function processProxyQueue() {
        if (proxyQueue.length === 0 || activeProxyCount >= MAX_CONCURRENT_PROXIES) return;

        while (proxyQueue.length > 0 && activeProxyCount < MAX_CONCURRENT_PROXIES) {
            const fileObj = proxyQueue.shift();
            activeProxyCount++;
            
            // 병렬로 인코딩 시작 (await 하지 않음)
            startProxyConversion(fileObj).finally(() => {
                activeProxyCount--;
                processProxyQueue(); // 하나 끝나면 다음 작업 호출
            });
        }
    }
    let lastTargetTime = -1; // 마지막으로 강제 이동한 목표 시간
    let seekLockTimeout = null; // 이동 중 루프 차단 타이머

    timelineTrack.addEventListener('mousedown', (e) => {
        // 대기열 항목 선택 중인데 '수정 모드'가 아니면 핸들 조작 불가
        if (selectedFileObj && selectedFileObj.activeSegmentId && !isEditingSavedSegment) {
            if (e.target === handleLeft || e.target === handleRight) {
                updateStatus("수정 버튼을 눌러야 구간을 변경할 수 있습니다.");
                setTimeout(() => updateStatus(""), 2000);
                return;
            }
        }

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
            if (selectedSegmentObj) {
                selectedSegmentObj.start = Math.min(time, selectedSegmentObj.end - 0.1);
                updateTrimUI();
                updatePlayheadUI(selectedSegmentObj.start);
                // 실시간 사이드바/고스트바 동기화
                renderGhostMarkers();
                if (selectedFileObj) renderSegments(selectedFileObj);
            }
        } else if (isDraggingRight) {
            if (selectedSegmentObj) {
                selectedSegmentObj.end = Math.max(time, selectedSegmentObj.start + 0.1);
                updateTrimUI();
                updatePlayheadUI(selectedSegmentObj.end);
                // 실시간 사이드바/고스트바 동기화
                renderGhostMarkers();
                if (selectedFileObj) renderSegments(selectedFileObj);
            }
        }

        // 비디오 탐색은 rAF를 통해 최적화된 속도로 수행
        if (!scrubAnimationFrame) {
            scrubAnimationFrame = requestAnimationFrame(() => {
                if (isScrubbing) {
                    mainPlayer.currentTime = lastTargetTime;
                } else if (isDraggingLeft && selectedSegmentObj) {
                    mainPlayer.currentTime = selectedSegmentObj.start;
                } else if (isDraggingRight && selectedSegmentObj) {
                    mainPlayer.currentTime = selectedSegmentObj.end;
                }
                scrubAnimationFrame = null;
            });
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingLeft || isDraggingRight) {
            // 드래그 종료 시 최종 상태 확정 및 UI 갱신
            if (selectedFileObj) {
                renderSegments(selectedFileObj);
                renderGhostMarkers();
            }
        }
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
        
        // 현재 '수정 모드'인 경우 완료 처리
        if (selectedFileObj.activeSegmentId && isEditingSavedSegment) {
            isEditingSavedSegment = false;
            updateStatus("수정이 완료되었습니다.");
        } else {
            // 대기열 구간이 선택된 상태에서 초기화를 누르면, 
            // 기존 구간을 망가뜨리지 않고 '선택 해제'하여 다시 전체 영상(드래프트) 모드로 돌아갑니다.
            selectedFileObj.activeSegmentId = null;
            
            // 드래프트 모드의 구간을 전체 범위로 초기화
            const seg = getActiveSegment(selectedFileObj);
            if (seg) {
                seg.start = 0;
                seg.end = selectedFileObj.duration;
            }
            updateStatus("타임라인이 전체 구간으로 초기화되었습니다.");
        }
        
        // UI 갱신
        selectVideo(selectedFileObj);
        renderSegments(selectedFileObj);
        setTimeout(() => updateStatus(""), 2000);
    });

    function addNewSegment() {
        if (!selectedFileObj || !selectedSegmentObj) return;
        
        // 1. 현재 편집 중인 설정(드래프트 혹은 기존 세그먼트)을 복제하여 새로운 대기열 아이템 생성
        const currentSeg = selectedSegmentObj;
        const newSeg = {
            id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            start: currentSeg.start,
            end: currentSeg.end,
            fps: currentSeg.fps,
            resolution: currentSeg.resolution,
            numColors: currentSeg.numColors,
            useDither: currentSeg.useDither,
            loopPlayback: currentSeg.loopPlayback,
            aspectRatioLock: currentSeg.aspectRatioLock,
            customWidth: currentSeg.customWidth,
            customHeight: currentSeg.customHeight,
            status: 'idle',
            progress: 0
        };

        // 2. 대기열에 추가
        selectedFileObj.segments.push(newSeg);
        
        // 3. [개선] 추가 후에는 항상 '드래프트(마스터) 모드'로 돌아가 타임라인을 리셋합니다.
        //    이렇게 하면 사용자가 방금 추가한 것에 얽매이지 않고 즉시 새로운 구간을 잡을 수 있습니다.
        selectedFileObj.activeSegmentId = null; 
        isEditingSavedSegment = false; // 수정 모드 해제
        if (selectedFileObj.draft) {
            selectedFileObj.draft.start = 0;
            selectedFileObj.draft.end = selectedFileObj.duration;
        }
        
        // UI 갱신
        selectVideo(selectedFileObj);
        renderSegments(selectedFileObj);
        renderGhostMarkers();
        
        updateStatus("새로운 구간이 대기열에 추가되었습니다.");
        setTimeout(() => updateStatus(""), 2000);
    }

    addSegmentBtn.addEventListener('click', addNewSegment);

    mainPlayer.addEventListener('timeupdate', () => {
        // 드래그 중이거나 스크러빙 중일 때는 로직을 실행하지 않음
        if (!selectedFileObj || !selectedSegmentObj || isDraggingLeft || isDraggingRight || isScrubbing) return;
        
        // rVFC가 지원되지 않는 브라우저를 위한 최소한의 폴백
        if (!('requestVideoFrameCallback' in mainPlayer) && !mainPlayer.paused) {
            const currentTime = mainPlayer.currentTime;
            const start = selectedSegmentObj.start;
            const end = selectedSegmentObj.end;

            if (currentTime >= end || currentTime < start - 0.3) {
                mainPlayer.currentTime = start;
            }
        }
    });

    function updateUIFrame(now, metadata) {
        if (selectedFileObj && selectedSegmentObj && !isScrubbing && !isDraggingLeft && !isDraggingRight) {
            const currentTime = metadata && metadata.mediaTime ? metadata.mediaTime : mainPlayer.currentTime;
            updatePlayheadUI(currentTime);

            // 루프 로직 (rVFC 내부에서 더 정밀하게 처리)
            if (!mainPlayer.paused) {
                const start = selectedSegmentObj.start;
                const end = selectedSegmentObj.end;
                const fps = selectedFileObj.fps || 30;
                const frameDuration = 1 / fps;

                // 아웃점 한 프레임 밀림 방지를 위해 미세하게(0.1 프레임) 앞당겨 체크
                if (currentTime >= end - (frameDuration * 0.1)) {
                    mainPlayer.currentTime = start;
                }
                
                // 인점보다 한참 뒤처진 경우 보정
                if (currentTime < start - 0.3) {
                    mainPlayer.currentTime = start;
                }
            }
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

    // --- Custom Context Menu Logic ---
    const ctxMenu = document.getElementById('custom-context-menu');
    let ctxTargetFile = null;

    // 전역 우클릭 방지
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        ctxMenu.classList.add('hidden');
    });

    function showContextMenu(e, fileObj) {
        e.preventDefault();
        e.stopPropagation();
        ctxTargetFile = fileObj;

        // 메뉴 위치 설정
        ctxMenu.style.left = `${e.pageX}px`;
        ctxMenu.style.top = `${e.pageY}px`;
        ctxMenu.classList.remove('hidden');

        // 프록시 버튼 상태 업데이트
        const proxyBtn = document.getElementById('ctx-generate-proxy');
        if (fileObj.proxyPath || fileObj.isProxying) {
            proxyBtn.classList.add('opacity-30', 'pointer-events-none');
            proxyBtn.querySelector('span').textContent = fileObj.isProxying ? "pending" : "check_circle";
        } else {
            proxyBtn.classList.remove('opacity-30', 'pointer-events-none');
            proxyBtn.querySelector('span').textContent = "speed";
        }
    }

    // 메뉴 바깥 클릭 시 닫기
    document.addEventListener('click', () => {
        ctxMenu.classList.add('hidden');
    });

    // 메뉴 항목 클릭 처리
    document.getElementById('ctx-generate-proxy').addEventListener('click', () => {
        if (ctxTargetFile) startProxyConversion(ctxTargetFile);
    });

    document.getElementById('ctx-open-folder').addEventListener('click', () => {
        if (ctxTargetFile) eel.open_file_location(ctxTargetFile.path)();
    });

    document.getElementById('ctx-delete').addEventListener('click', () => {
        if (ctxTargetFile) {
            const item = document.querySelector(`[data-id="${ctxTargetFile.id}"]`);
            if (item) item.querySelector('.delete-file-btn').click();
        }
    });

    // --- Custom Confirmation Modal Logic ---
    function showCustomConfirm(title, message, okText = "제거하기") {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = document.getElementById('confirm-title');
            const messageEl = document.getElementById('confirm-message');
            const okBtn = document.getElementById('confirm-ok-btn');
            const cancelBtn = document.getElementById('confirm-cancel-btn');

            titleEl.textContent = title;
            messageEl.innerHTML = message;
            okBtn.textContent = okText;
            
            modal.classList.remove('hidden');

            const cleanup = (result) => {
                modal.classList.add('hidden');
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };

            okBtn.onclick = () => cleanup(true);
            cancelBtn.onclick = () => cleanup(false);
        });
    }

    // 일괄 삭제 실행
    document.getElementById('bulk-delete-btn').addEventListener('click', async () => {
        const checkedBoxes = document.querySelectorAll('.lib-checkbox:checked');
        if (checkedBoxes.length === 0) return;

        const confirmed = await showCustomConfirm(
            "목록 제거 확인", 
            `선택한 <b>${checkedBoxes.length}개</b>의 파일을 목록에서 제거하시겠습니까?<br><small class="text-slate-400">원본 파일은 삭제되지 않습니다.</small>`
        );
        
        if (!confirmed) return;

        let currentFileDeleted = false;
        const idsToRemove = Array.from(checkedBoxes).map(cb => {
            const item = cb.closest('[data-id]');
            return item.dataset.id;
        });

        idsToRemove.forEach(id => {
            const fileIdx = uploadedFiles.findIndex(f => f.id === id);
            if (fileIdx > -1) {
                if (selectedFileObj && selectedFileObj.id === id) currentFileDeleted = true;
                uploadedFiles.splice(fileIdx, 1);
                document.querySelector(`[data-id="${id}"]`).remove();
            }
        });

        // 현재 편집 중인 파일이 삭제된 경우 처리
        if (currentFileDeleted) {
            if (uploadedFiles.length > 0) {
                selectVideo(uploadedFiles[0]);
            } else {
                selectedFileObj = null;
                mainPlayer.src = "";
                mainPlayer.classList.add('hidden');
                placeholderMsg.classList.remove('hidden');
                document.getElementById('header-filename').textContent = "파일을 선택해주세요";
                document.getElementById('header-resolution').textContent = "영상 정보가 여기에 표시됩니다";
                document.getElementById('proxy-badge').classList.add('hidden');
                document.getElementById('timeline-area').classList.add('hidden');
            }
        }

        // 인덱스 및 UI 갱신
        document.querySelectorAll('.lib-checkbox').forEach((cb, i) => {
            cb.dataset.index = i;
        });
        updateBatchButtonState();
        updateLibraryEmptyState();
        updateStatus(`${idsToRemove.length}개의 파일을 목록에서 제거했습니다.`);
        setTimeout(() => updateStatus(""), 3000);
    });

    function getActiveSegment(fileObj) {
        if (!fileObj) return null;
        
        // 1. 현재 명시적으로 선택된 세그먼트가 있는 경우
        if (fileObj.activeSegmentId) {
            const seg = fileObj.segments.find(s => s.id === fileObj.activeSegmentId);
            if (seg) return seg;
        }

        // 2. 선택된 세그먼트가 없거나 목록에 없는 경우, 드래프트(편집용 임시 객체)를 사용
        if (!fileObj.draft) {
            fileObj.draft = {
                id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                start: 0,
                end: fileObj.duration || 0,
                fps: fileObj.fps || 24,
                resolution: "중간 (720p)",
                numColors: 256,
                useDither: false,
                loopPlayback: true,
                aspectRatioLock: true,
                customWidth: fileObj.width,
                customHeight: fileObj.height,
                status: 'idle',
                progress: 0
            };
        }
        return fileObj.draft;
    }

    function renderSegments(fileObj) {
        const item = document.querySelector(`[data-id="${fileObj.id}"]`);
        if (!item) return;

        const container = item.querySelector('.segments-container');
        if (!container) return;

        container.innerHTML = '';
        fileObj.segments.forEach((seg, idx) => {
            const segDiv = document.createElement('div');
            const isActive = fileObj.activeSegmentId === seg.id;
            segDiv.className = `segment-item group flex items-center justify-between px-2 py-1.5 rounded text-[11px] font-medium border border-transparent ${isActive ? 'active' : 'text-slate-500'}`;
            
            const isThisEditing = isActive && isEditingSavedSegment;
            const timeRange = `${formatTime(seg.start)} - ${formatTime(seg.end)}`;
            
            segDiv.innerHTML = `
                <div class="flex items-center gap-2 overflow-hidden flex-1">
                    <span class="opacity-40 flex-shrink-0">#${idx + 1}</span>
                    <span class="segment-time truncate font-bold text-slate-700">${timeRange}</span>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <!-- Edit Button -->
                    <button class="edit-seg-btn p-1.5 rounded-md hover:bg-indigo-100 transition-all ${isThisEditing ? 'text-indigo-600 bg-indigo-50 shadow-sm' : 'text-slate-500'}" title="구간 수정">
                        <span class="material-symbols-outlined text-[18px]">${isThisEditing ? 'check_circle' : 'edit_square'}</span>
                    </button>
                    <!-- Delete Button -->
                    <button class="delete-seg-btn text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all p-1.5 rounded-md" data-seg-id="${seg.id}" title="삭제">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
            `;
            
            // 항목 자체 클릭 (단순 선택 및 이동)
            segDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                fileObj.activeSegmentId = seg.id;
                isEditingSavedSegment = false; // 단순 클릭은 보기 모드
                selectVideo(fileObj); 
                renderSegments(fileObj);
            });

            // 수정 버튼 클릭
            const editBtn = segDiv.querySelector('.edit-seg-btn');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (fileObj.activeSegmentId === seg.id && isEditingSavedSegment) {
                    // 이미 수정 중이었다면 완료 처리
                    isEditingSavedSegment = false;
                } else {
                    fileObj.activeSegmentId = seg.id;
                    isEditingSavedSegment = true;
                }
                selectVideo(fileObj);
                renderSegments(fileObj);
            });

            const delBtn = segDiv.querySelector('.delete-seg-btn');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sIdx = fileObj.segments.findIndex(s => s.id === seg.id);
                if (sIdx !== -1) {
                    fileObj.segments.splice(sIdx, 1);
                    
                    // 삭제한 것이 현재 활성 세그먼트였다면 드래프트 모드로 복귀
                    if (fileObj.activeSegmentId === seg.id) {
                        fileObj.activeSegmentId = null;
                        selectVideo(fileObj);
                    } else {
                        renderSegments(fileObj);
                    }
                }
            });

            container.appendChild(segDiv);
        });
    }

    function addLibraryItem(fileObj) {
        const sizeMb = (fileObj.size / (1024 * 1024)).toFixed(1);
        const format = fileObj.name.split('.').pop().toUpperCase();
        const itemDiv = document.createElement('div');
        itemDiv.className = "bg-white text-indigo-600 shadow-sm rounded-lg p-3 cursor-pointer group transition-all duration-200 ease-in-out border border-indigo-200 hover:border-indigo-400 select-none";

        const index = uploadedFiles.indexOf(fileObj);

        itemDiv.setAttribute('data-id', fileObj.id);
        
        // 우클릭 이벤트 바인딩
        itemDiv.addEventListener('contextmenu', (e) => showContextMenu(e, fileObj));

        itemDiv.innerHTML = `
            <div class="flex flex-col gap-2">
                <div class="flex gap-3 items-center">
                    <div class="flex items-center">
                        <input type="checkbox" class="lib-checkbox w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" data-index="${index}" />
                    </div>
                    <div class="flex-1 flex flex-col justify-center overflow-hidden">
                        <span class="truncate font-semibold text-on-surface">${fileObj.name}</span>
                        <div class="flex items-center gap-2 mt-0.5 min-h-[20px]">
                            <div class="file-metadata flex items-center gap-2">
                                <span class="text-xs text-slate-500 font-medium">${sizeMb} MB</span>
                                <div class="flex items-center gap-1.5">
                                    <span class="bg-slate-100 text-slate-500 px-1 py-0 rounded text-[9px] font-bold uppercase tracking-wider border border-slate-200/50 leading-tight">${format}</span>
                                    <span class="proxy-badge bg-indigo-50 text-indigo-600 px-1 py-0 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-100 leading-tight ${fileObj.proxyPath ? '' : 'hidden'}">Proxy</span>
                                </div>
                            </div>
                            <div class="proxy-status-container">
                                <span class="proxy-status-text text-[10px] font-bold text-indigo-500 animate-pulse"></span>
                            </div>
                        </div>
                    </div>
                    <!-- Delete Button (Visible on Hover) -->
                    <button class="delete-file-btn opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all outline-none">
                        <span class="material-symbols-outlined text-xl">delete</span>
                    </button>
                </div>
                <!-- Proxy Progress Bar Container -->
                <div class="proxy-progress-container w-full h-1 bg-slate-100 rounded-full overflow-hidden hidden">
                    <div class="proxy-progress-bar h-full bg-indigo-500 transition-all duration-300" style="width: 0%"></div>
                </div>
                <!-- Conversion Progress Bar Container -->
                <div class="conversion-progress-container w-full h-1 bg-slate-100 rounded-full overflow-hidden hidden">
                    <div class="conversion-progress-bar h-full bg-green-500 transition-all duration-300" style="width: 0%"></div>
                </div>

                <!-- Segments List (Child Tasks) -->
                <div class="segments-container flex flex-col gap-1 mt-2 border-t border-indigo-50 pt-2 empty:hidden"></div>
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
                    document.getElementById('proxy-badge').classList.add('hidden');
                    
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
            updateLibraryEmptyState();
        });

        itemDiv.addEventListener('click', () => {
            selectVideo(fileObj);
        });
        libraryList.appendChild(itemDiv);
        renderSegments(fileObj);
        updateLibraryEmptyState();
        updateBatchButtonState();
    }

    async function processConversionQueue() {
        // 더 이상 처리할 작업이 없고 활성 작업도 없는 경우 종료 처리
        if (conversionQueue.length === 0 && activeConversionCount === 0) {
            updateStatus(`전체 완료! (${totalBatchCount}/${totalBatchCount})`);
            setTimeout(() => {
                if (activeConversionCount === 0 && conversionQueue.length === 0) {
                    updateStatus("");
                    totalBatchCount = 0;
                    completedBatchCount = 0;
                }
            }, 3000);
            convertBtn.disabled = false;
            convertBtn.style.opacity = '1';
            convertSplitBtn.disabled = false;
            return;
        }

        // 큐가 비었거나 이미 최대 병렬 수 도달 시 리턴
        if (conversionQueue.length === 0 || activeConversionCount >= MAX_CONCURRENT_CONVERSIONS) return;

        while (conversionQueue.length > 0 && activeConversionCount < MAX_CONCURRENT_CONVERSIONS) {
            const task = conversionQueue.shift();
            activeConversionCount++;
            
            const { fileObj, params } = task;
            
            // 작업 시작 상태 표시
            update_conversion_status(fileObj.id, "준비 중...", 2);
            
            try {
                const res = await eel.request_conversion(
                    fileObj.path, 
                    fileObj.id, 
                    params.outName, 
                    params.start, 
                    params.end, 
                    params.fps, 
                    params.resolution, 
                    params.numColors, 
                    params.useDither, 
                    params.loopPlayback
                )();

                if (res.status === 'processing') {
                    await new Promise((resolve, reject) => {
                        conversionResolvers.set(fileObj.id, { resolve, reject });
                    });
                }
            } catch (err) {
                console.error("Conversion error for", fileObj.name, err);
                conversion_completed(fileObj.id, {status: "error", message: err.message});
            } finally {
                activeConversionCount--;
                processConversionQueue();
            }
        }
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

        // UI 값 캡처 (오버라이드용)
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

        // 이번 배치 작업 정보 초기화 (총 세그먼트 수 기준)
        totalBatchCount = 0;
        selectedFiles.forEach(f => totalBatchCount += f.segments.length);
        completedBatchCount = 0;

        for (let i = 0; i < selectedFiles.length; i++) {
            const fileObj = selectedFiles[i];
            
            for (let j = 0; j < fileObj.segments.length; j++) {
                const seg = fileObj.segments[j];
                let outName = "output_" + fileObj.name.replace(/\.[^/.]+$/, "");
                if (fileObj.segments.length > 1) {
                    outName += `_Clip${j + 1}`;
                }
                outName += ".gif";

                const start = seg.start;
                const end = seg.end || 99999;
                
                let fps, resolution, numColors, useDither, loopPlayback;

                if (useOverride) {
                    fps = uiFps; resolution = uiResolution; numColors = uiNumColors; useDither = uiUseDither; loopPlayback = uiLoopPlayback;
                } else {
                    fps = seg.fps || 24;
                    resolution = seg.resolution || "중간 (720p)";
                    if (resolution === "직접 설정") {
                        resolution = `${seg.customWidth || fileObj.width}:${seg.customHeight || fileObj.height}`;
                    }
                    numColors = seg.numColors || 256;
                    useDither = seg.useDither || false;
                    loopPlayback = seg.loopPlayback !== undefined ? seg.loopPlayback : true;
                }

                // 세그먼트 상태 초기화
                seg.status = 'waiting';
                seg.progress = 0;
                renderSegments(fileObj);

                // 부모 아이템 UI도 업데이트 (첫 번째 작업 시작 시)
                const item = document.querySelector(`[data-id="${fileObj.id}"]`);
                if (item) {
                    const statusText = item.querySelector('.proxy-status-text');
                    const metadata = item.querySelector('.file-metadata');
                    if (statusText) statusText.textContent = "대기 중...";
                    if (metadata) metadata.classList.add('hidden');
                }

                conversionQueue.push({
                    fileObj,
                    segId: seg.id,
                    params: { outName, start, end, fps, resolution, numColors, useDither, loopPlayback }
                });
            }
        }
        
        processConversionQueue();
    }

    convertBtn.addEventListener('click', () => runConversion(false));
});
