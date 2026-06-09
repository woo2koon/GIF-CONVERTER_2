// Proxy and Conversion Callbacks
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
    
    if (progress < 100) {
        if (metadata) metadata.classList.add('hidden');
    }

    const overlay = document.getElementById('proxy-overlay');
    const overlayProgress = document.getElementById('proxy-overlay-progress');
    if (window.selectedFileObj && window.selectedFileObj.id === file_id) {
        if (overlay) overlay.classList.remove('hidden');
        if (overlayProgress) overlayProgress.textContent = `${progress}%`;
    }

    if (statusText) {
        if (progress >= 100) {
            statusText.textContent = "변환 완료";
            if (metadata) metadata.classList.remove('hidden');
            const badge = item.querySelector('.proxy-badge');
            if (badge) badge.classList.remove('hidden');
            
            setTimeout(() => {
                if (container) container.classList.add('hidden');
                statusText.textContent = "";
                if (window.selectedFileObj && window.selectedFileObj.id === file_id && overlay) {
                    overlay.classList.add('hidden');
                }
            }, 2000);
        } else {
            statusText.textContent = `프록시 생성 중... ${progress}%`;
        }
    }
}

eel.expose(update_conversion_status);
function update_conversion_status(task_id, status, progress) {
    if (!task_id || typeof task_id !== 'string') {
        console.warn("[Conversion] Invalid task_id received:", task_id);
        return;
    }
    const [file_id, seg_id] = task_id.includes('@@') ? task_id.split('@@') : [task_id, null];
    
    const fileObj = window.uploadedFiles.find(f => f.id === file_id);
    if (!fileObj) return;

    const item = document.querySelector(`[data-id="${file_id}"]`);
    if (!item) return;
    
    if (seg_id) {
        let seg = fileObj.segments.find(s => s.id === seg_id);
        if (!seg && fileObj.draft && fileObj.draft.id === seg_id) {
            seg = fileObj.draft;
        }
        if (seg) {
            seg.status = 'encoding';
            seg.progress = progress;
            renderSegments(fileObj);
        }
    }

    const bar = item.querySelector('.conversion-progress-bar');
    const container = item.querySelector('.conversion-progress-container');
    const statusText = item.querySelector('.proxy-status-text'); 
    const metadata = item.querySelector('.file-metadata');
    
    if (container) container.classList.remove('hidden');
    if (metadata) metadata.classList.add('hidden');
    
    const targets = fileObj.segments.length > 0 ? fileObj.segments : [fileObj.draft].filter(Boolean);
    if (targets.length > 0) {
        const totalProgress = targets.reduce((acc, s) => acc + (s.progress || 0), 0);
        const overallProgress = Math.round(totalProgress / targets.length);
        if (bar) bar.style.width = `${overallProgress}%`;
        if (statusText) {
            if (status && (status.includes('최적화') || status.includes('팔레트') || status.includes('준비'))) {
                statusText.textContent = `${status} (${overallProgress}%)`;
            } else {
                statusText.textContent = `인코딩 중... ${overallProgress}%`;
            }
        }
    }

    const activeTasksProgress = Array.from(window.conversionResolvers.keys()).reduce((acc, tid) => {
        const [fid, sid] = tid.includes('@@') ? tid.split('@@') : [tid, null];
        const f = window.uploadedFiles.find(u => u.id === fid);
        if (f && sid) {
            let p = 0;
            if (sid.startsWith('draft_')) {
                p = f.draft ? f.draft.progress : 0;
            } else {
                const s = f.segments.find(seg => seg.id === sid);
                p = s ? s.progress : 0;
            }
            return acc + p;
        }
        return acc;
    }, 0);
    
    const overallGlobalProgress = Math.min(100, Math.round((window.completedBatchCount * 100 + activeTasksProgress) / window.totalBatchCount));
    const currentNum = Math.min(window.totalBatchCount, window.completedBatchCount + 1);
    
    // 현재 세그먼트의 포맷에 따라 문구 변경
    let formatLabel = "GIF";
    if (seg && seg.format) {
        formatLabel = seg.format.toUpperCase();
    }
    
    updateStatus(`(${currentNum}/${window.totalBatchCount}) ${formatLabel} 변환 중... (${overallGlobalProgress}%)`);
}

eel.expose(proxy_completed);
function proxy_completed(file_id, result) {
    if (window.proxyResolvers.has(file_id)) {
        const resolver = window.proxyResolvers.get(file_id);
        window.proxyResolvers.delete(file_id);
        
        if (result.status === 'success') {
            const fileObj = window.uploadedFiles.find(f => f.id === file_id);
            if (fileObj) handleProxyReady(fileObj, result.proxy_path);
            resolver.resolve(result);
        } else {
            resolver.reject(new Error(result.message));
        }
    }
}

eel.expose(conversion_completed);
function conversion_completed(task_id, result) {
    const [file_id, seg_id] = task_id.includes('@@') ? task_id.split('@@') : [task_id, null];
    
    if (window.conversionResolvers.has(task_id)) {
        const resolver = window.conversionResolvers.get(task_id);
        window.conversionResolvers.delete(task_id);
        resolver.resolve(result);
    }
    
    window.completedBatchCount++;
    const fileObj = window.uploadedFiles.find(f => f.id === file_id);
    const item = document.querySelector(`[data-id="${file_id}"]`);
    
    if (fileObj && seg_id) {
        let seg = fileObj.segments.find(s => s.id === seg_id);
        if (!seg && fileObj.draft && fileObj.draft.id === seg_id) {
            seg = fileObj.draft;
        }
        if (seg) {
            seg.status = result.status === 'success' ? 'completed' : 'error';
            seg.progress = 100;
            renderSegments(fileObj);
            
            if (seg.status === 'error') {
                showToast(`변환 실패: ${result.message}`, 5000);
            } else if (seg.status === 'completed') {
                setTimeout(() => {
                    seg.status = 'idle';
                    renderSegments(fileObj);
                }, 5000);
            }
        }
    }

    if (item) {
        const bar = item.querySelector('.conversion-progress-bar');
        const targets = fileObj.segments.length > 0 ? fileObj.segments : [fileObj.draft].filter(Boolean);
        if (bar && targets.length > 0) {
            const totalProgress = targets.reduce((acc, s) => acc + (s.progress || 0), 0);
            const overallProgress = totalProgress / targets.length;
            bar.style.width = `${overallProgress}%`;
        }

        const statusText = item.querySelector('.proxy-status-text');
        const allFinished = !targets.some(s => s.status === 'waiting' || s.status === 'encoding');

        if (allFinished) {
            if (statusText) statusText.textContent = "완료";
            item.classList.add('border-green-400', 'bg-green-50');
            setTimeout(() => {
                item.classList.remove('border-green-400', 'bg-green-50');
                const metadata = item.querySelector('.file-metadata');
                if (metadata) metadata.classList.remove('hidden');
                const convContainer = item.querySelector('.conversion-progress-container');
                if (convContainer) convContainer.classList.add('hidden');
                if (statusText && statusText.textContent === "완료") statusText.textContent = "";
            }, 3000);
        }
    }

    if (window.completedBatchCount >= window.totalBatchCount) {
        updateStatus(`(${window.totalBatchCount}/${window.totalBatchCount}) 모든 변환 완료 (100%)`);
        eel.open_downloads_folder();
        setTimeout(() => updateStatus(""), 3000);
    }
}

function handleProxyReady(fileObj, proxyPath) {
    fileObj.isProxying = false;
    let safeProxyPath = proxyPath.replace(/\\/g, '/');
    if (safeProxyPath.startsWith('/')) safeProxyPath = safeProxyPath.substring(1);
    const newUrl = `/local_file/${safeProxyPath.split('/').map(encodeURIComponent).join('/')}`;
    
    fileObj.proxyPath = proxyPath;
    fileObj.objectUrl = newUrl;
    
    const item = document.querySelector(`[data-id="${fileObj.id}"]`);
    if (item) {
        const badge = item.querySelector('.proxy-badge');
        if (badge) badge.classList.remove('hidden');
        const metadata = item.querySelector('.file-metadata');
        if (metadata) metadata.classList.remove('hidden');
        const progressContainer = item.querySelector('.proxy-progress-container');
        if (progressContainer) progressContainer.classList.add('hidden');
        const statusText = item.querySelector('.proxy-status-text');
        if (statusText) statusText.textContent = "";
    }
    
    if (window.selectedFileObj && window.selectedFileObj.id === fileObj.id) {
        const mainPlayer = document.getElementById('main-player');
        mainPlayer.src = `${newUrl}?t=${Date.now()}`;
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
        return new Promise((resolve, reject) => {
            window.proxyResolvers.set(fileObj.id, { resolve, reject });
        });
    } else {
        fileObj.isProxying = false;
        throw new Error(res.message);
    }
}

async function processProxyQueue() {
    if (window.proxyQueue.length === 0 || window.activeProxyCount >= window.MAX_CONCURRENT_PROXIES) return;
    while (window.proxyQueue.length > 0 && window.activeProxyCount < window.MAX_CONCURRENT_PROXIES) {
        const fileObj = window.proxyQueue.shift();
        window.activeProxyCount++;
        startProxyConversion(fileObj).finally(() => {
            window.activeProxyCount--;
            processProxyQueue();
        });
    }
}
async function startConversionWorkflow() {
    if (!window.uploadedFiles || window.uploadedFiles.length === 0) {
        updateStatus("변환할 비디오를 먼저 추가하세요.");
        return;
    }

    // 1. Collect all segments to convert
    let tasks = [];
    
    // Check if any specific files are selected via checkboxes
    const checkedBoxes = document.querySelectorAll('.lib-checkbox:checked');
    let targetFiles = [];
    
    if (checkedBoxes.length > 0) {
        checkedBoxes.forEach(cb => {
            const idx = parseInt(cb.dataset.index);
            if (window.uploadedFiles[idx]) targetFiles.push(window.uploadedFiles[idx]);
        });
    } else if (window.selectedFileObj) {
        targetFiles = [window.selectedFileObj];
    }

    if (targetFiles.length === 0) {
        updateStatus("변환할 비디오를 선택하세요.");
        return;
    }

    targetFiles.forEach(file => {
        // If file has segments, convert all segments. If not, convert the draft (entire range or current trim).
        const segmentsToConvert = file.segments.length > 0 ? file.segments : [file.draft].filter(Boolean);
        
        segmentsToConvert.forEach(seg => {
            tasks.push({ file, seg });
        });
    });

    if (tasks.length === 0) {
        updateStatus("변환할 구간이 없습니다.");
        return;
    }

    // 2. Setup Batch State
    window.conversionQueue = tasks;
    window.totalBatchCount = tasks.length;
    window.completedBatchCount = 0;
    window.conversionResolvers.clear();

    updateStatus(`총 ${window.totalBatchCount}개의 작업을 시작합니다...`);

    // 3. Process Queue
    processConversionQueue();
}

async function processConversionQueue() {
    // Process up to MAX_CONCURRENT_CONVERSIONS (default 2 or 3)
    const MAX_CONCURRENT = 3;
    
    while (window.conversionQueue.length > 0 && window.conversionResolvers.size < MAX_CONCURRENT) {
        const task = window.conversionQueue.shift();
        const { file, seg } = task;
        const taskId = `${file.id}@@${seg.id}`;

        seg.status = 'waiting';
        seg.progress = 0;
        renderSegments(file);

        // Prepare parameters
        const inputPath = file.path;
        const format = seg.format || 'gif';
        const includeAudio = seg.includeAudio !== undefined ? seg.includeAudio : true;

        // Use only the original filename. Duplicates are handled by the backend (e.g., adding (1), (2)).
        // Use original filename with time tags for segments to prevent overwriting and provide context
        const lastDotIndex = file.name.lastIndexOf('.');
        let baseName = lastDotIndex !== -1 ? file.name.substring(0, lastDotIndex) : file.name;
        baseName = sanitizeFilename(baseName);
        let outputName = `${baseName}.${format}`;
        
        // If there are segments, add time tags to distinguish them
        if (file.segments.length > 0) {
            const startTag = formatTimeForFilename(seg.start);
            const endTag = formatTimeForFilename(seg.end);
            outputName = `${baseName}_${startTag}_${endTag}.${format}`;
        }
        const startTime = seg.start;
        const endTime = seg.end;
        const fps = seg.fps || 24;
        let resolution = seg.resolution || "원본";
        if (resolution === "직접 설정" && seg.customWidth && seg.customHeight) {
            resolution = `${seg.customWidth}:${seg.customHeight}`;
        } else if (resolution === "원본") {
            resolution = "original";
        }
        const numColors = seg.numColors || 256;
        const useDither = seg.useDither !== undefined ? seg.useDither : false;
        const loopPlayback = seg.loopPlayback !== undefined ? seg.loopPlayback : true;
        
        // 크롭 및 키프레임 데이터 통합
        const cropParams = seg.crop ? { ...seg.crop } : null;
        if (cropParams && seg.keyframes && seg.keyframes.length > 0) {
            cropParams.keyframes = seg.keyframes;
        }
        const speed = seg.speed || 1.0;

        // Gifsicle 최적화 관련 파라미터 준비
        const optMethod = seg.optimizationMethod || 'none';
        const lossyLevel = seg.lossyLevel !== undefined ? (seg.lossyLevel * 2) : 30;
        const eliminateLocalPalette = seg.eliminateLocalPalette !== undefined ? seg.eliminateLocalPalette : true;
        const reduceColors = seg.reduceColors !== undefined ? seg.reduceColors : 256;

        // Create promise for this specific task
        const conversionPromise = new Promise((resolve, reject) => {
            window.conversionResolvers.set(taskId, { resolve, reject });
        });

        // Start async conversion in backend
        eel.request_conversion(
            inputPath, 
            taskId, 
            outputName, 
            startTime, 
            endTime, 
            fps, 
            resolution, 
            numColors, 
            useDither, 
            loopPlayback, 
            cropParams,
            file.audioUrl,
            speed,
            format,
            includeAudio,
            optMethod,
            lossyLevel,
            eliminateLocalPalette,
            reduceColors
        );

        // Handle completion
        conversionPromise.then((result) => {
            if (result.status === 'success') {
                console.log(`[Conversion] Task ${taskId} Success:`, result.path);
            } else {
                console.error(`[Conversion] Task ${taskId} Failed:`, result.message);
            }
            processConversionQueue(); // Try to start next task
        }).catch(err => {
            console.error(`[Conversion] Task ${taskId} Error:`, err);
            processConversionQueue();
        });
    }
}
