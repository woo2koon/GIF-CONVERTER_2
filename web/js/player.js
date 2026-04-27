function selectVideo(fileObj) {
    const mainPlayer = document.getElementById('main-player');
    const placeholderMsg = document.getElementById('placeholder-msg');
    
    if (!fileObj) {
        window.selectedFileObj = null;
        window.selectedSegmentObj = null;
        mainPlayer.src = "";
        placeholderMsg.classList.remove('hidden');
        document.getElementById('header-filename').textContent = "파일을 선택해주세요";
        document.getElementById('header-resolution').textContent = "영상 정보가 여기에 표시됩니다";
        
        // proxy-badge 숨기기
        const pBadge = document.getElementById('proxy-badge');
        if (pBadge) pBadge.classList.add('hidden');
        
        window.isCropMode = false;
        const cropToggle = document.getElementById('crop-toggle');
        if (cropToggle) updateToggleUI(cropToggle, false);
        const cropControlsContainer = document.getElementById('crop-controls-container');
        if (cropControlsContainer) cropControlsContainer.classList.add('hidden');
        updateCropUI();
        return;
    }

    const isSameFile = (window.selectedFileObj && window.selectedFileObj.id === fileObj.id);
    
    window.selectedFileObj = fileObj;
    window.selectedSegmentObj = getActiveSegment(fileObj);
    
    window.currentVideoPath = fileObj.path;
    window.currentVideoFileName = fileObj.name;
    window.proxyStartTime = 0; // Reset proxy start time
    
    document.getElementById('header-filename').textContent = fileObj.name;
    
    if (isSameFile) {
        syncUIToFile(fileObj);
        updateTimelineUI();
        updateCropOverlaySize();
        if (window.selectedSegmentObj) {
            mainPlayer.currentTime = window.selectedSegmentObj.start;
            updatePlayheadUI(window.selectedSegmentObj.start);
        }
        return;
    }

    // 다른 파일로 전환 시 크롭 모드 초기화
    if (window.isCropMode) {
        window.isCropMode = false;
        const cropToggle = document.getElementById('crop-toggle');
        if (cropToggle) updateToggleUI(cropToggle, false);
        const cropControlsContainer = document.getElementById('crop-controls-container');
        if (cropControlsContainer) {
            cropControlsContainer.classList.add('hidden');
            cropControlsContainer.classList.remove('flex');
        }
        updateCropUI();
    }


    document.getElementById('header-resolution').textContent = "로딩 중...";
    mainPlayer.pause();
    
    // Attach listener BEFORE setting src
    mainPlayer.onloadeddata = () => {
        updateTimelineUI();
        updateCropOverlaySize(); // Match crop overlay to actual video area
        
        if (window.selectedSegmentObj) {
            mainPlayer.currentTime = window.selectedSegmentObj.start;
            updatePlayheadUI(window.selectedSegmentObj.start);
        }
        
        document.getElementById('total-time-display').textContent = formatTime(fileObj.duration);
        
        // 상세 파일 정보 표시: 1280×720 • WEBM • 03:25:49 • 59.94 FPS
        const ext = fileObj.isYoutube ? 'YT' : (fileObj.name.split('.').pop() || '').toUpperCase();
        const totalSec = Math.floor(fileObj.duration);
        const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const ss = String(totalSec % 60).padStart(2, '0');
        const durationStr = `${hh}:${mm}:${ss}`;
        const fpsStr = Number.isInteger(fileObj.fps) ? `${fileObj.fps}` : fileObj.fps.toFixed(2);
        const resStr = fileObj.isYoutube
            ? `${fileObj.width}×${fileObj.height} (원본)`
            : `${fileObj.width}×${fileObj.height}`;
        document.getElementById('header-resolution').textContent =
            `${resStr} • ${ext} • ${durationStr} • ${fpsStr} FPS`;

        syncUIToFile(fileObj);
        
        const overlay = document.getElementById('proxy-overlay');
        if (fileObj.isProxying) {
            if (overlay) overlay.classList.remove('hidden');
        } else {
            if (overlay) overlay.classList.add('hidden');
        }

        const pBadge = document.getElementById('proxy-badge');
        if (fileObj.isYoutube) {
            // YouTube: 재생 해상도 배지 표시
            if (pBadge) {
                const previewLabel = fileObj.previewHeight ? `${fileObj.previewHeight}P PREVIEW` : 'PREVIEW';
                pBadge.textContent = previewLabel;
                pBadge.classList.remove('hidden');
            }
        } else if (fileObj.proxyPath) {
            // 일반 영상: 프록시 배지 표시
            if (pBadge) {
                pBadge.textContent = 'PROXY PREVIEW';
                pBadge.classList.remove('hidden');
            }
            if (!fileObj.proxyStatusShown) {
                updateStatus("미리보기 준비 완료 (프록시)");
                fileObj.proxyStatusShown = true;
                setTimeout(() => updateStatus(""), 3000);
            }
        } else {
            if (pBadge) pBadge.classList.add('hidden');
        }
    };

    mainPlayer.onerror = (e) => {
        console.error("Video load error:", e);
        document.getElementById('header-resolution').textContent = "영상 정보가 여기에 표시됩니다";
    };

    const timestamp = Date.now();
    if (fileObj.isYoutube) {
        mainPlayer.src = fileObj.streamUrl;
    } else {
        mainPlayer.src = `${fileObj.objectUrl}?t=${timestamp}`;
    }
    mainPlayer.load();
    
    mainPlayer.classList.remove('hidden');
    placeholderMsg.classList.add('hidden');
    const tArea = document.getElementById('timeline-area');
    if (tArea) tArea.classList.remove('hidden');
    
    syncUIToFile(fileObj);
}

function initPlayerEvents() {
    const mainPlayer = document.getElementById('main-player');
    const playIcon = document.getElementById('play-icon');
    const playPauseBtn = document.getElementById('play-pause-btn');
    
    if (!mainPlayer || !playIcon) return;

    let syncAnimationFrame = null;

    function updateSync() {
        if (!mainPlayer.paused && !mainPlayer.ended) {
            // Loop logic for segment preview
            if (window.selectedSegmentObj) {
                const inPoint = window.selectedSegmentObj.start;
                const outPoint = window.selectedSegmentObj.end;
                
                const isProxy = window.selectedFileObj.isYoutube && window.selectedFileObj.streamUrl.includes('/yt_proxy');
                const absTime = isProxy ? (window.proxyStartTime + mainPlayer.currentTime) : mainPlayer.currentTime;
                
                // If we passed the out point, jump back to in point
                if (absTime >= outPoint) {
                    if (isProxy) {
                        window.proxyStartTime = inPoint;
                        const baseSrc = window.selectedFileObj.streamUrl.split('&ss=')[0];
                        mainPlayer.src = `${baseSrc}&ss=${inPoint}`;
                        mainPlayer.load();
                        mainPlayer.play().catch(() => {});
                    } else {
                        mainPlayer.currentTime = inPoint;
                    }
                }
            }
            
            updatePlayheadUI(); // Update playhead on timeline
            syncAnimationFrame = requestAnimationFrame(updateSync);
        }
    }

    mainPlayer.addEventListener('play', () => {
        playIcon.textContent = 'pause';
        if (!syncAnimationFrame) {
            syncAnimationFrame = requestAnimationFrame(updateSync);
        }
    });

    mainPlayer.addEventListener('pause', () => {
        playIcon.textContent = 'play_arrow';
        if (syncAnimationFrame) {
            cancelAnimationFrame(syncAnimationFrame);
            syncAnimationFrame = null;
        }
        updatePlayheadUI();
    });

    mainPlayer.addEventListener('ended', () => {
        // If we reach the end of the video, check if we should loop back to in-point
        if (window.selectedSegmentObj) {
            mainPlayer.currentTime = window.selectedSegmentObj.start;
            mainPlayer.play();
        } else {
            playIcon.textContent = 'play_arrow';
        }
        if (syncAnimationFrame) {
            cancelAnimationFrame(syncAnimationFrame);
            syncAnimationFrame = null;
        }
    });

    mainPlayer.addEventListener('timeupdate', () => {
        if (mainPlayer.paused) {
            updatePlayheadUI();
        }
    });
    
    mainPlayer.addEventListener('click', togglePlayPause);
    
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', (e) => {
            console.log("[JS] Play button clicked");
            e.preventDefault();
            e.stopPropagation();
            togglePlayPause();
        });
    }

    const stepBackBtn = document.getElementById('step-back-btn');
    const stepForwardBtn = document.getElementById('step-forward-btn');

    if (stepBackBtn) {
        stepBackBtn.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            mainPlayer.pause();
            mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - (1 / (window.selectedFileObj.fps || 30)));
            updatePlayheadUI();
        });
    }

    if (stepForwardBtn) {
        stepForwardBtn.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            mainPlayer.pause();
            mainPlayer.currentTime = Math.min(window.selectedFileObj.duration, mainPlayer.currentTime + (1 / (window.selectedFileObj.fps || 30)));
            updatePlayheadUI();
        });
    }
}

function togglePlayPause() {
    console.log("[JS] togglePlayPause called");
    const mainPlayer = document.getElementById('main-player');
    if (!window.selectedFileObj || !mainPlayer) return;
    
    if (mainPlayer.paused) {
        mainPlayer.play().catch(err => console.error("Play error:", err));
    } else {
        mainPlayer.pause();
    }
}

function initVolumeControls() {
    const mainPlayer = document.getElementById('main-player');
    const volumeSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');
    const volumeIcon = document.getElementById('volume-icon');

    const updateVolumeSliderFill = (val) => {
        const percentage = val * 100;
        volumeSlider.style.background = `linear-gradient(to right, #4f46e5 ${percentage}%, #e2e8f0 ${percentage}%)`;
    };

    const updateVolumeIcon = () => {
        if (mainPlayer.muted || mainPlayer.volume === 0) {
            volumeIcon.textContent = 'volume_off';
            volumeIcon.style.color = '#ef4444';
        } else {
            volumeIcon.textContent = 'volume_up';
            volumeIcon.style.color = '';
        }
    };

    volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        mainPlayer.volume = val;
        mainPlayer.muted = (val === 0);
        if (val > 0) window.lastVolume = val;
        updateVolumeIcon();
        updateVolumeSliderFill(val);
    });

    muteBtn.addEventListener('click', () => {
        mainPlayer.muted = !mainPlayer.muted;
        if (mainPlayer.muted) {
            volumeSlider.value = 0;
        } else {
            if (window.lastVolume === 0) window.lastVolume = 0.5;
            mainPlayer.volume = window.lastVolume;
            volumeSlider.value = window.lastVolume;
        }
        updateVolumeIcon();
        updateVolumeSliderFill(volumeSlider.value);
    });

    updateVolumeSliderFill(volumeSlider.value);
    updateVolumeIcon();
}

async function generateFilmstrip(fileObj) {
    const filmstripContainer = document.getElementById('filmstrip-container');
    if (!filmstripContainer) return;
    
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

function displayFilmstrip(fileObj) {
    const filmstripContainer = document.getElementById('filmstrip-container');
    if (!fileObj || !fileObj.filmstrip || fileObj.filmstrip.length === 0 || !filmstripContainer) return;

    filmstripContainer.innerHTML = '';
    const allThumbs = fileObj.filmstrip;
    const totalGenerated = allThumbs.length;

    let targetCount = Math.floor(12 + (window.zoomLevel - 1) * 8);
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
