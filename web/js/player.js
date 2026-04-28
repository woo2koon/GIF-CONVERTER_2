function selectVideo(fileObj) {
    const mainPlayer = document.getElementById('main-player');
    const placeholderMsg = document.getElementById('placeholder-msg');
    
    if (!fileObj) {
        window.selectedFileObj = null;
        window.selectedSegmentObj = null;
        
        // 유튜브 플레이어 정지 및 컨테이너 숨김
        if (window.isYTReady && window.ytPlayer) {
            window.ytPlayer.pauseVideo();
        }
        const ytContainer = document.getElementById('yt-player-container');
        if (ytContainer) ytContainer.classList.add('hidden');
        
        mainPlayer.src = "";
        mainPlayer.classList.add('hidden');
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

    // 타임라인 줌 및 스크롤 초기화
    window.timelineZoom = 1;
    const zoomSlider = document.getElementById('timeline-zoom-slider');
    const timelineTrack = document.getElementById('timeline-track');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    
    if (zoomSlider) zoomSlider.value = 1;
    if (timelineTrack) timelineTrack.style.width = '100%';
    if (scrollContainer) {
        scrollContainer.style.overflowX = 'hidden';
        scrollContainer.scrollLeft = 0;
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
            const startTime = window.selectedSegmentObj.start;
            if (fileObj.isYoutube && window.ytPlayer && window.ytPlayer.seekTo) {
                window.ytPlayer.seekTo(startTime, true);
            } else if (mainPlayer) {
                mainPlayer.currentTime = startTime + 0.001;
            }
            updatePlayheadUI(startTime);
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


    const updateMetadataDisplay = () => {
        const durationStr = formatTime(fileObj.duration);
        const resStr = `${fileObj.width}×${fileObj.height}`;
        const isYT = fileObj.isYoutube || fileObj.isDownloadedYoutube;
        const ext = isYT ? 'YT' : (fileObj.name.split('.').pop() || '').toUpperCase();
        const fpsStr = (fileObj.fps || 30).toFixed(2);
        const infoText = `${resStr} • ${ext} • ${durationStr} • ${fpsStr} FPS`;
        
        const headerResText = document.getElementById('header-resolution-text');
        if (headerResText) headerResText.textContent = infoText;
        else {
            const hRes = document.getElementById('header-resolution');
            if (hRes) hRes.textContent = infoText;
        }
        
        const totalTimeDisplay = document.getElementById('total-time-display');
        if (totalTimeDisplay) totalTimeDisplay.textContent = durationStr;
    };

    updateMetadataDisplay(); // 즉시 정보 업데이트

    const ytContainer = document.getElementById('yt-player-container');
    
    // 플레이어 스위칭
    if (fileObj.isYoutube) {
        mainPlayer.pause();
        mainPlayer.classList.add('hidden');
        ytContainer.classList.remove('hidden');
        
        if (window.isYTReady && window.ytPlayer) {
            window.ytPlayer.cueVideoById({
                videoId: fileObj.videoId,
                startSeconds: window.selectedSegmentObj ? window.selectedSegmentObj.start : 0,
                suggestedQuality: 'hd720'
            });
        }
        
        setTimeout(() => {
            updateTimelineUI();
            updateCropOverlaySize();
            updateMetadataDisplay();
            syncUIToFile(fileObj);
            const pBadge = document.getElementById('proxy-badge');
            if (pBadge) pBadge.classList.add('hidden');
        }, 500);

    } else {
        // 로컬 비디오
        if (window.isYTReady && window.ytPlayer) {
            window.ytPlayer.pauseVideo();
        }
        ytContainer.classList.add('hidden');
        mainPlayer.classList.remove('hidden');

        mainPlayer.onloadeddata = () => {
            updateTimelineUI();
            updateCropOverlaySize();
            
            if (window.selectedSegmentObj) {
                mainPlayer.currentTime = window.selectedSegmentObj.start + 0.001;
                updatePlayheadUI(window.selectedSegmentObj.start);
            }
            
            updateMetadataDisplay();
            syncUIToFile(fileObj);
            
            const pBadge = document.getElementById('proxy-badge');
            if (fileObj.proxyPath) {
                if (pBadge) {
                    pBadge.textContent = 'PROXY PREVIEW';
                    pBadge.classList.remove('hidden');
                }
            } else {
                if (pBadge) pBadge.classList.add('hidden');
            }
        };

        const timestamp = Date.now();
        mainPlayer.src = `${fileObj.objectUrl}?t=${timestamp}`;
        mainPlayer.load();
    }
    
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
    let isSeekingNow = false; // 탐색 중임을 나타내는 플래그

    function updateSync() {
        if (!window.selectedFileObj) return;

        let isPaused, currentTime;
        if (window.selectedFileObj.isYoutube) {
            isPaused = window.ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING;
            currentTime = window.ytPlayer.getCurrentTime();
        } else {
            isPaused = mainPlayer.paused;
            currentTime = mainPlayer.currentTime;
        }

        if (!isPaused) {
            if (window.selectedSegmentObj && !isSeekingNow) {
                const inPoint = window.selectedSegmentObj.start;
                const outPoint = window.selectedSegmentObj.end;
                
                if (currentTime < inPoint - 0.05 || currentTime >= outPoint) {
                    if (window.selectedFileObj.isYoutube) {
                        window.ytPlayer.seekTo(inPoint, true);
                    } else {
                        isSeekingNow = true;
                        updatePlayheadUI(inPoint);
                        mainPlayer.currentTime = inPoint + 0.001;
                    }
                }
            }
            
            // 탐색 중이 아닐 때만 실제 시간으로 UI 갱신
            if (!isSeekingNow) {
                updatePlayheadUI();
            }
            
            syncAnimationFrame = requestAnimationFrame(updateSync);
        }
    }

    // 탐색 완료 이벤트 리스너
    mainPlayer.addEventListener('seeked', () => {
        isSeekingNow = false;
        updatePlayheadUI();
    });

    mainPlayer.addEventListener('play', () => {
        if (window.selectedFileObj && !window.selectedFileObj.isYoutube) {
            playIcon.textContent = 'pause';
            if (!syncAnimationFrame) syncAnimationFrame = requestAnimationFrame(updateSync);
        }
    });

    mainPlayer.addEventListener('pause', () => {
        if (window.selectedFileObj && !window.selectedFileObj.isYoutube) {
            playIcon.textContent = 'play_arrow';
            if (syncAnimationFrame) {
                cancelAnimationFrame(syncAnimationFrame);
                syncAnimationFrame = null;
            }
            updatePlayheadUI();
        }
    });

    // YouTube state changes are handled in onPlayerStateChange

    // Global click listener for play/pause toggle
    const videoContainer = document.getElementById('video-container');
    const ytShield = document.getElementById('yt-shield');

    if (ytShield) {
        ytShield.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePlayPause();
        });
    }

    videoContainer.addEventListener('click', (e) => {
        if (window.isCropMode) return; // Ignore clicks during crop mode
        if (e.target.closest('#yt-player')) return;
        if (e.target.closest('#yt-shield')) return; // Already handled above
        togglePlayPause();
    });
    
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', (e) => {
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
            const fps = window.selectedFileObj.fps || 30;
            if (window.selectedFileObj.isYoutube) {
                const target = Math.max(0, window.ytPlayer.getCurrentTime() - (1 / fps));
                window.ytPlayer.seekTo(target, true);
            } else {
                mainPlayer.pause();
                mainPlayer.currentTime = Math.max(0, mainPlayer.currentTime - (1 / fps));
            }
            updatePlayheadUI();
        });
    }

    if (stepForwardBtn) {
        stepForwardBtn.addEventListener('click', () => {
            if (!window.selectedFileObj) return;
            const fps = window.selectedFileObj.fps || 30;
            if (window.selectedFileObj.isYoutube) {
                const target = Math.min(window.selectedFileObj.duration, window.ytPlayer.getCurrentTime() + (1 / fps));
                window.ytPlayer.seekTo(target, true);
            } else {
                mainPlayer.pause();
                mainPlayer.currentTime = Math.min(window.selectedFileObj.duration, mainPlayer.currentTime + (1 / fps));
            }
            updatePlayheadUI();
        });
    }
}

function togglePlayPause() {
    if (!window.selectedFileObj) return;
    const mainPlayer = document.getElementById('main-player');

    if (window.selectedFileObj.isYoutube) {
        const state = window.ytPlayer.getPlayerState();
        if (state == YT.PlayerState.PLAYING) {
            window.ytPlayer.pauseVideo();
        } else {
            // YouTube 인 지점 보정 후 재생
            if (window.selectedSegmentObj) {
                const inPoint = window.selectedSegmentObj.start;
                const curr = window.ytPlayer.getCurrentTime();
                if (curr < inPoint - 0.1 || curr > window.selectedSegmentObj.end) {
                    window.ytPlayer.seekTo(inPoint, true);
                }
            }
            window.ytPlayer.playVideo();
            updatePlayheadUI(); 
            requestAnimationFrame(window.updateSyncProxy);
        }
    } else {
        if (mainPlayer.paused) {
            // [개선] 재생 전 구간 시작점 체크 및 사전 탐색
            if (window.selectedSegmentObj) {
                const inPoint = window.selectedSegmentObj.start;
                // 현재 위치가 인 지점보다 이전이거나 완전히 벗어나 있으면 먼저 이동
                if (mainPlayer.currentTime < inPoint - 0.05 || mainPlayer.currentTime >= window.selectedSegmentObj.end) {
                    mainPlayer.currentTime = inPoint + 0.001;
                }
            }
            
            // 약간의 지연 후 재생하여 화면-시간 동기화 유도
            requestAnimationFrame(() => {
                mainPlayer.play().catch(err => console.error("Play error:", err));
            });
        } else {
            mainPlayer.pause();
        }
    }
}

// Helper to start sync loop for YT from outside
window.updateSyncProxy = function() {
    if (window.selectedFileObj && window.selectedFileObj.isYoutube && window.ytPlayer) {
        const state = window.ytPlayer.getPlayerState();
        if (state == YT.PlayerState.PLAYING) {
            const currentTime = window.ytPlayer.getCurrentTime();
            
            // Loop logic for YouTube
            if (window.selectedSegmentObj) {
                const inPoint = window.selectedSegmentObj.start;
                const outPoint = window.selectedSegmentObj.end;
                
                // 루프 설정이 켜져 있을 때만 반복하되, 인 지점 가드는 항상 작동
                if (window.selectedSegmentObj.loopPlayback) {
                    if (currentTime < inPoint - 0.05 || currentTime >= outPoint) {
                        updatePlayheadUI(inPoint);
                        window.ytPlayer.seekTo(inPoint, true);
                        requestAnimationFrame(window.updateSyncProxy);
                        return;
                    }
                }
            }

            
            // 타임코드 및 재생바 강제 업데이트
            if (typeof updatePlayheadUI === 'function') {
                updatePlayheadUI();
            }
            
            requestAnimationFrame(window.updateSyncProxy);
        }
    }
};

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
        if (window.ytPlayer && window.ytPlayer.setVolume) {
            window.ytPlayer.setVolume(val * 100);
            if (val === 0) window.ytPlayer.mute();
            else window.ytPlayer.unMute();
        }
        if (val > 0) window.lastVolume = val;
        updateVolumeIcon();
        updateVolumeSliderFill(val);
    });

    muteBtn.addEventListener('click', () => {
        const isMuting = !mainPlayer.muted;
        mainPlayer.muted = isMuting;
        if (window.ytPlayer && window.ytPlayer.mute) {
            if (isMuting) window.ytPlayer.mute();
            else window.ytPlayer.unMute();
        }

        if (mainPlayer.muted) {
            volumeSlider.value = 0;
        } else {
            if (window.lastVolume === 0) window.lastVolume = 0.5;
            mainPlayer.volume = window.lastVolume;
            volumeSlider.value = window.lastVolume;
            if (window.ytPlayer && window.ytPlayer.setVolume) window.ytPlayer.setVolume(window.lastVolume * 100);
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
// --- YouTube IFrame API Integration ---
window.ytPlayer = null;
window.isYTReady = false;

// This function is called by the YouTube API script
window.onYouTubeIframeAPIReady = function() {
    window.ytPlayer = new YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        playerVars: {
            'autoplay': 0,
            'controls': 0,         // Hide bottom controls
            'disablekb': 1,        // Disable keyboard (we handle it)
            'fs': 0,               // Disable fullscreen button
            'rel': 0,              // Disable related videos
            'modestbranding': 1,   // Hide YouTube logo in bar
            'iv_load_policy': 3,   // Hide annotations
            'autohide': 1,         // Auto-hide controls
            'showinfo': 0,         // Hide title (deprecated but good to keep)
            'origin': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
};

function onPlayerError(event) {
    console.error("[YT API] Player Error:", event.data);
    // 101: The owner of the requested video does not allow it to be played in embedded players.
    // 150: Same as 101.
    if (event.data === 101 || event.data === 150) {
        if (window.selectedFileObj && window.selectedFileObj.isYoutube) {
            const name = window.selectedFileObj.name;
            const message = "이 영상은 유튜브 정책에 의해 외부 재생(Embedding)이 차단되었습니다. 계속하려면 영상을 다운로드해야 합니다.";
            const url = window.selectedFileObj.url;
            
            console.log("[JS] Player error detected for URL:", url);
            
            if (url && typeof showYoutubeDownloadModal === 'function') {
                showYoutubeDownloadModal(name, message, url);
            } else {
                console.error("[JS] Cannot trigger download modal: url is missing or function not found");
            }
        }
    }
}

function onPlayerReady(event) {
    window.isYTReady = true;
    console.log("[YT API] Player Ready");
    
    // Initial volume sync
    const vol = document.getElementById('volume-slider').value;
    event.target.setVolume(vol * 100);
}

function onPlayerStateChange(event) {
    const playIcon = document.getElementById('play-icon');
    if (!playIcon) return;

    if (event.data == YT.PlayerState.PLAYING) {
        playIcon.textContent = 'pause';
        requestAnimationFrame(updateSyncProxy);
    } else if (event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.ENDED) {
        playIcon.textContent = 'play_arrow';
    }
}
