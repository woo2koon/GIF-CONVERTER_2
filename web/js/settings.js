function syncUIToFile(fileObj) {
    if (!fileObj) return;
    const seg = getActiveSegment(fileObj);
    if (!seg) return;

    // FPS
    const fpsSlider = document.getElementById('fps-slider');
    const fpsDisplay = document.getElementById('fps-display');
    fpsSlider.value = seg.fps || 24;
    fpsDisplay.textContent = `${fpsSlider.value} FPS`;

    // Speed
    const speedSlider = document.getElementById('speed-slider');
    const speedDisplay = document.getElementById('speed-display');
    const speed = seg.speed || 1.0;
    if (speedSlider) speedSlider.value = speed;
    if (speedDisplay) speedDisplay.textContent = `${parseFloat(speed).toFixed(1)}x`;

    // Update preset buttons
    document.querySelectorAll('.speed-preset-btn').forEach(btn => {
        const btnSpeed = parseFloat(btn.dataset.speed);
        if (Math.abs(btnSpeed - speed) < 0.01) {
            btn.classList.remove('bg-white', 'border-slate-200', 'text-slate-500');
            btn.classList.add('bg-indigo-50', 'border-indigo-200', 'text-indigo-600');
        } else {
            btn.classList.add('bg-white', 'border-slate-200', 'text-slate-500');
            btn.classList.remove('bg-indigo-50', 'border-indigo-200', 'text-indigo-600');
        }
    });

    // Live preview speed
    const mainPlayer = document.getElementById('main-player');
    if (mainPlayer) {
        mainPlayer.playbackRate = speed;
    }
    if (window.selectedFileObj && window.selectedFileObj.isYoutube && window.ytPlayer) {
        if (typeof window.ytPlayer.setPlaybackRate === 'function') {
            window.ytPlayer.setPlaybackRate(speed);
        }
    }

    // Resolution
    const resValue = seg.resolution || "중간 (720p)";
    const resItems = document.querySelectorAll('#res-dropdown .dropdown-item');
    resItems.forEach(item => {
        if (item.dataset.value === resValue) {
            resItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.getElementById('res-selected').textContent = item.textContent;
        }
    });
    
    const customResContainer = document.getElementById('custom-res-container');
    if (resValue === "직접 설정") {
        document.getElementById('custom-width').value = seg.customWidth || fileObj.width;
        document.getElementById('custom-height').value = seg.customHeight || fileObj.height;
        const lockBtn = document.getElementById('aspect-ratio-lock');
        const isLocked = seg.aspectRatioLock !== undefined ? seg.aspectRatioLock : true;
        lockBtn.dataset.active = isLocked ? 'true' : 'false';
        
        const icon = lockBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = isLocked ? 'link' : 'link_off';
        
        lockBtn.classList.toggle('text-indigo-600', isLocked);
        lockBtn.classList.toggle('text-slate-300', !isLocked);
        customResContainer.classList.remove('hidden');
    } else {
        customResContainer.classList.add('hidden');
    }

    // Colors
    const colorValue = seg.numColors || 256;
    const colorItems = document.querySelectorAll('#colors-dropdown .dropdown-item');
    colorItems.forEach(item => {
        if (parseInt(item.dataset.value) === colorValue) {
            colorItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.getElementById('colors-selected').textContent = item.textContent;
        }
    });

    // Toggles
    updateToggleUI(document.getElementById('loop-toggle'), seg.loopPlayback !== undefined ? seg.loopPlayback : true);
    updateToggleUI(document.getElementById('dither-toggle'), seg.useDither !== undefined ? seg.useDither : false);
    
    // Batch Sync
    updateToggleUI(document.getElementById('batch-sync-toggle'), fileObj.isBatchSync || false);
    updateSyncToggleVisibility();

    // Crop State
    const cropToggle = document.getElementById('crop-toggle');
    const cropControlsContainer = document.getElementById('crop-controls-container');
    if (seg.crop) {
        window.isCropMode = true;
        window.cropBoxState = { ...seg.crop };
        updateToggleUI(cropToggle, true);
        cropControlsContainer.classList.remove('hidden');
        cropControlsContainer.classList.add('flex');
    } else {
        window.isCropMode = false;
        window.cropBoxState = { x: 10, y: 10, w: 80, h: 80 };
        updateToggleUI(cropToggle, false);
        cropControlsContainer.classList.add('hidden');
        cropControlsContainer.classList.remove('flex');
    }
    updateCropUI();
    updateSizeEstimate();
    
    // 키프레임 목록 업데이트
    if (window.updateKeyframeListUI) {
        window.updateKeyframeListUI();
    }
}

function updateCropOverlaySize() {
    const video = document.getElementById('main-player');
    const overlay = document.getElementById('crop-overlay');
    const container = document.getElementById('video-container');
    if (!overlay || !container) return;

    let vWidth, vHeight;
    if (window.selectedFileObj && window.selectedFileObj.isYoutube) {
        vWidth = window.selectedFileObj.width;
        vHeight = window.selectedFileObj.height;
    } else {
        if (!video || video.videoWidth === 0) return;
        vWidth = video.videoWidth;
        vHeight = video.videoHeight;
    }

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const videoRatio = vWidth / vHeight;
    const containerRatio = containerWidth / containerHeight;

    let displayWidth, displayHeight;
    if (videoRatio > containerRatio) {
        displayWidth = containerWidth;
        displayHeight = containerWidth / videoRatio;
    } else {
        displayHeight = containerHeight;
        displayWidth = containerHeight * videoRatio;
    }

    overlay.style.width = `${displayWidth}px`;
    overlay.style.height = `${displayHeight}px`;
    overlay.style.left = `${(containerWidth - displayWidth) / 2}px`;
    overlay.style.top = `${(containerHeight - displayHeight) / 2}px`;
}

function updateCropUI() {
    const cropBox = document.getElementById('crop-box');
    const cropOverlay = document.getElementById('crop-overlay');
    const pixelDisplay = document.getElementById('crop-pixel-display');

    if (!window.isCropMode) {
        cropOverlay.classList.add('hidden');
        cropBox.classList.add('hidden');
        return;
    }
    cropOverlay.classList.remove('hidden');
    cropBox.classList.remove('hidden');
    cropBox.style.left = `${window.cropBoxState.x}%`;
    cropBox.style.top = `${window.cropBoxState.y}%`;
    cropBox.style.width = `${window.cropBoxState.w}%`;
    cropBox.style.height = `${window.cropBoxState.h}%`;

    // Update Custom Resolution Inputs and Pixel HUD to match crop box pixels
    if (window.selectedFileObj) {
        const realW = Math.round(window.selectedFileObj.width * (window.cropBoxState.w / 100));
        const realH = Math.round(window.selectedFileObj.height * (window.cropBoxState.h / 100));
        
        if (pixelDisplay) {
            pixelDisplay.textContent = `${realW} × ${realH}`;
        }

        const customWInput = document.getElementById('custom-width');
        const customHInput = document.getElementById('custom-height');
        if (customWInput && customHInput) {
            customWInput.value = realW;
            customHInput.value = realH;
            
            // Also sync to segment data
            const seg = getActiveSegment(window.selectedFileObj);
            if (seg) {
                seg.customWidth = realW;
                seg.customHeight = realH;
            }
        }
    }
}

function updateSizeEstimate() {
    const container = document.getElementById('size-estimate-container');
    const valueEl = document.getElementById('size-estimate-value');
    if (!container || !valueEl || !window.selectedFileObj) return;

    const seg = getActiveSegment(window.selectedFileObj);
    if (!seg) {
        container.classList.add('opacity-0');
        return;
    }

    // 1. Get Base Data
    const duration = Math.max(0.1, (seg.end - seg.start) / (seg.speed || 1.0));
    const fps = seg.fps || 24;
    
    let width = window.selectedFileObj.width;
    let height = window.selectedFileObj.height;

    // Use cropped dimensions if active (Check global crop state for real-time update)
    if (window.isCropMode && window.cropBoxState) {
        width = Math.round(width * (window.cropBoxState.w / 100));
        height = Math.round(height * (window.cropBoxState.h / 100));
    }

    // Adjust for output resolution presets
    const res = (seg.resolution || "720P").toUpperCase();
    
    if (res.includes("직접 설정") && seg.customWidth && seg.customHeight) {
        width = seg.customWidth;
        height = seg.customHeight;
    } else if (res.includes("480P")) {
        if (height > 480) {
            const scale = 480 / height;
            width = Math.round(width * scale);
            height = 480;
        }
    } else if (res.includes("720P")) {
        if (height > 720) {
            const scale = 720 / height;
            width = Math.round(width * scale);
            height = 720;
        }
    } else if (res.includes("원본")) {
        // Keep original/cropped dimensions
    }

    // 2. Calculation Formula (Empirical GIF model)
    // Base complexity factor
    let complexityFactor = 0.22; 
    
    if (window.selectedFileObj.bitrate > 0 && window.selectedFileObj.width > 0) {
        const area = window.selectedFileObj.width * window.selectedFileObj.height;
        const bpp = (window.selectedFileObj.bitrate * 1024) / (area * (window.selectedFileObj.fps || 30));
        const bppFactor = Math.sqrt(bpp / 0.15);
        complexityFactor *= Math.max(0.7, Math.min(1.8, bppFactor));
    }
    
    // Speed Impact: Slower speeds have much smaller per-frame changes.
    // User tests show total size is almost constant across speeds for the same content.
    const speed = seg.speed || 1.0;
    const speedCorrection = Math.pow(speed, 0.9); // Higher power means total size stays more constant when speed changes
    complexityFactor *= speedCorrection;

    const totalPixels = width * height * fps * duration;
    
    // Parse numColors
    let numColors = 256;
    if (seg.numColors) {
        const match = String(seg.numColors).match(/\d+/);
        if (match) numColors = parseInt(match[0]);
    }
    
    // Factors
    const colorFactor = Math.pow(numColors / 256, 0.5); 
    const ditherFactor = seg.useDither ? 1.8 : 1.0; 
    
    let estimatedBytes = totalPixels * complexityFactor * colorFactor * ditherFactor;
    
    // Convert to MB
    const estimatedMB = estimatedBytes / (1024 * 1024);
    
    // 3. UI Update
    valueEl.textContent = estimatedMB.toFixed(1);
    container.classList.remove('opacity-0');
}

function initCropLogic() {
    const cropToggle = document.getElementById('crop-toggle');
    const cropControlsContainer = document.getElementById('crop-controls-container');
    const cropBox = document.getElementById('crop-box');
    const cropOverlay = document.getElementById('crop-overlay');

    cropToggle.addEventListener('click', () => {
        if (!window.selectedFileObj) return;
        window.isCropMode = !window.isCropMode;
        
        const seg = getActiveSegment(window.selectedFileObj);
        if (window.isCropMode) {
            seg.crop = { ...window.cropBoxState };
            cropControlsContainer.classList.remove('hidden');
            cropControlsContainer.classList.add('flex');
        } else {
            seg.crop = null;
            cropControlsContainer.classList.add('hidden');
            cropControlsContainer.classList.remove('flex');
        }
        updateToggleUI(cropToggle, window.isCropMode);
        updateCropUI();
    });

    // Crop Reset
    const resetBtn = document.getElementById('crop-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            window.cropBoxState = { x: 10, y: 10, w: 80, h: 80 };
            const seg = getActiveSegment(window.selectedFileObj);
            if (seg) seg.crop = { ...window.cropBoxState };
            updateCropUI();
        });
    }

    // Ratio Dropdown
    const ratioDropdown = document.getElementById('crop-ratio-dropdown');
    if (ratioDropdown) {
        ratioDropdown.addEventListener('change', (e) => {
            window.cropAspectRatio = e.detail.value;
            applyRatioToBox();
        });
    }

    // Rotate Ratio
    const rotateBtn = document.getElementById('rotate-ratio-btn');
    if (rotateBtn) {
        rotateBtn.addEventListener('click', () => {
            if (!window.cropAspectRatio || window.cropAspectRatio === 'free') return;
            
            // Clean the ratio string: take only the part before any space or parenthesis
            let cleanRatio = window.cropAspectRatio.split(' ')[0].trim();
            const parts = cleanRatio.split(':');
            
            if (parts.length === 2) {
                const newRatio = `${parts[1]}:${parts[0]}`;
                window.cropAspectRatio = newRatio;
                
                // Update the current segment's state
                const seg = getActiveSegment(window.selectedFileObj);
                if (seg) seg.cropAspectRatio = newRatio;

                applyRatioToBox();
                
                // Update dropdown text: search DOM carefully
                const selectedText = document.getElementById('crop-ratio-selected');
                const dropdown = document.getElementById('crop-ratio-dropdown');
                const options = dropdown ? dropdown.querySelectorAll('.custom-option') : [];
                
                let foundName = null;
                for (let opt of options) {
                    const optVal = (opt.getAttribute('data-value') || opt.dataset.value || "").trim();
                    if (optVal === newRatio) {
                        // Use innerText and trim to get clean text without extra whitespace/newlines
                        foundName = (opt.innerText || opt.textContent).trim();
                        break;
                    }
                }

                // Fallback mapping (Must match index.html EXACTLY)
                if (!foundName) {
                    const fallbacks = {
                        "free": "자유형 (Free)",
                        "16:9": "16:9 (HD 와이드)",
                        "1:1": "1:1 (정사각형)",
                        "4:3": "4:3 (표준)",
                        "21:9": "21:9 (시네마틱)",
                        "4:5": "4:5 (인스타그램)",
                        "3:2": "3:2 (사진)",
                        "2.35:1": "2.35:1 (시네마틱)"
                    };
                    foundName = fallbacks[newRatio];
                }

                if (selectedText) {
                    selectedText.textContent = foundName ? foundName : `${newRatio} (회전됨)`;
                }
            }
        });
    }

    // Dragging State
    let isDragging = false;
    let dragMode = null; // 'move' or handle position like 'top-left'
    let startX, startY, startBox;

    const onMouseDown = (e) => {
        if (!window.isCropMode) return;
        
        const handle = e.target.closest('.crop-handle');
        const box = e.target.closest('#crop-box');
        
        e.preventDefault();
        e.stopPropagation(); // Prevent interaction from reaching the player
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const overlay = document.getElementById('crop-overlay');
        const rect = overlay.getBoundingClientRect();

        if (handle) {
            dragMode = handle.dataset.handle;
            startBox = { ...window.cropBoxState };
        } else if (box) {
            dragMode = 'move';
            startBox = { ...window.cropBoxState };
        } else {
            // Clicked on empty overlay -> Start drawing new box
            dragMode = 'draw';
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            window.cropBoxState = { x, y, w: 0, h: 0 };
            startBox = { ...window.cropBoxState };
            updateCropUI();
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging || !window.isCropMode) return;
        

        const overlay = document.getElementById('crop-overlay');
        const rect = overlay.getBoundingClientRect();
        const dx = ((e.clientX - startX) / rect.width) * 100;
        const dy = ((e.clientY - startY) / rect.height) * 100;
        
        let nextState = { ...startBox };
        
        if (dragMode === 'move') {
            nextState.x = Math.max(0, Math.min(100 - startBox.w, startBox.x + dx));
            nextState.y = Math.max(0, Math.min(100 - startBox.h, startBox.y + dy));
        } else if (dragMode === 'draw') {
            if (dx > 0) {
                nextState.w = Math.min(100 - startBox.x, dx);
            } else {
                nextState.x = Math.max(0, startBox.x + dx);
                nextState.w = startBox.x - nextState.x;
            }
            
            if (dy > 0) {
                nextState.h = Math.min(100 - startBox.y, dy);
            } else {
                nextState.y = Math.max(0, startBox.y + dy);
                nextState.h = startBox.y - nextState.y;
            }
        } else {
            // Resize logic
            if (dragMode.includes('r')) nextState.w = Math.max(2, Math.min(100 - startBox.x, startBox.w + dx));
            if (dragMode.includes('b')) nextState.h = Math.max(2, Math.min(100 - startBox.y, startBox.h + dy));
            if (dragMode.includes('l')) {
                const newW = Math.max(2, Math.min(startBox.x + startBox.w, startBox.w - dx));
                nextState.x = startBox.x + (startBox.w - newW);
                nextState.w = newW;
            }
            if (dragMode.includes('t')) {
                const newH = Math.max(2, Math.min(startBox.y + startBox.h, startBox.h - dy));
                nextState.y = startBox.y + (startBox.h - newH);
                nextState.h = newH;
            }
        }

        // Apply Aspect Ratio if locked (except during simple 'move')
        if (dragMode !== 'move' && window.cropAspectRatio && window.cropAspectRatio !== 'free') {
            const parts = window.cropAspectRatio.split(':');
            const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);
            const overlayRatio = rect.width / rect.height; // Matches videoRatio
            const targetRatio = ratio / overlayRatio;

            if (dragMode === 'draw') {
                nextState.h = nextState.w / targetRatio;
                if (dy < 0) nextState.y = startBox.y - nextState.h;
            } else {
                const isPureL = dragMode === 'l';
                const isPureR = dragMode === 'r';
                const isPureT = dragMode === 't';
                const isPureB = dragMode === 'b';

                if (isPureL || isPureR) {
                    // 가로 변만 드래그 → 높이를 비율에 맞게, 세로 중앙 기준으로 조정
                    const newH = nextState.w / targetRatio;
                    const centerY = startBox.y + startBox.h / 2;
                    nextState.h = newH;
                    nextState.y = centerY - newH / 2;
                } else if (isPureT || isPureB) {
                    // 세로 변만 드래그 → 너비를 비율에 맞게, 가로 중앙 기준으로 조정
                    const newW = nextState.h * targetRatio;
                    const centerX = startBox.x + startBox.w / 2;
                    nextState.w = newW;
                    nextState.x = centerX - newW / 2;
                } else {
                    // 코너 드래그 (기존 방식 유지)
                    if (dragMode.includes('l') || dragMode.includes('r')) {
                        nextState.h = nextState.w / targetRatio;
                        if (dragMode.includes('t')) nextState.y = (startBox.y + startBox.h) - nextState.h;
                    } else {
                        nextState.w = nextState.h * targetRatio;
                        if (dragMode.includes('l')) nextState.x = (startBox.x + startBox.w) - nextState.w;
                    }
                }
            }

            // Safety boundaries
            if (nextState.x < 0) { nextState.x = 0; nextState.w = startBox.x + startBox.w; nextState.h = nextState.w / targetRatio; }
            if (nextState.y < 0) { nextState.y = 0; nextState.h = startBox.y + startBox.h; nextState.w = nextState.h * targetRatio; }
            if (nextState.x + nextState.w > 100) { nextState.w = 100 - nextState.x; nextState.h = nextState.w / targetRatio; }
            if (nextState.y + nextState.h > 100) { nextState.h = 100 - nextState.y; nextState.w = nextState.h * targetRatio; }
        }
        
        window.cropBoxState = nextState;
        const seg = getActiveSegment(window.selectedFileObj);
        if (seg) seg.crop = { ...window.cropBoxState };
        updateCropUI();
    };

    const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    function applyRatioToBox() {
        if (!window.cropAspectRatio || window.cropAspectRatio === 'free') return;
        const parts = window.cropAspectRatio.split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);
        
        const overlay = document.getElementById('crop-overlay');
        const rect = overlay.getBoundingClientRect();
        if (rect.width === 0) return;

        const overlayRatio = rect.width / rect.height;
        const targetRatio = ratio / overlayRatio;

        let w = 80;
        let h = w / targetRatio;
        
        if (h > 80) {
            h = 80;
            w = h * targetRatio;
        }
        
        window.cropBoxState = {
            x: (100 - w) / 2,
            y: (100 - h) / 2,
            w: w,
            h: h
        };
        
        const seg = getActiveSegment(window.selectedFileObj);
        if (seg) seg.crop = { ...window.cropBoxState };
        updateCropUI();
    }

    cropOverlay.addEventListener('mousedown', onMouseDown);
    cropOverlay.addEventListener('click', (e) => e.stopPropagation());
}
