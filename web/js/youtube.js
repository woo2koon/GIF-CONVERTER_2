// 전역 상태 변수
let pendingYoutubeUrl = null;

async function handleYoutubeUrl() {
    console.log("[JS] handleYoutubeUrl 호출됨");
    if (window.eel) eel.debug_log("handleYoutubeUrl 호출됨");

    const urlInput = document.getElementById('youtube-url-input');
    const url = urlInput.value.trim();
    if (!url) {
        console.warn("[JS] URL이 비어있습니다.");
        return;
    }

    // 유튜브 URL 유효성 검사 추가
    const youtubePattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubePattern.test(url)) {
        showToast('올바른 주소가 아닙니다');
        return;
    }

    const youtubeModal = document.getElementById('youtube-modal');
    const confirmBtn = document.getElementById('youtube-confirm-btn');
    
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
        confirmBtn.querySelector('span').textContent = "처리 중...";
    }

    updateStatus("유튜브 정보 추출 중...");

    try {
        const info = await eel.get_youtube_info(url)();
        
        if (info.status === 'error') {
            updateStatus("오류: " + info.message);
            if (confirmBtn) {
                resetLoadButton(confirmBtn);
            }
            setTimeout(() => updateStatus(""), 5000);
            return;
        }

        // 연령 제한 등으로 다운로드가 필요한 경우
        if (info.status === 'requires_download') {
            if (youtubeModal) hideModal('youtube-modal');
            showYoutubeDownloadModal(info.title, info.message, url);
            if (confirmBtn) resetLoadButton(confirmBtn);
            updateStatus("다운로드 확인 대기 중...");
            return;
        }

        // 성공 시 모달 닫기
        if (youtubeModal) {
            hideModal('youtube-modal');
        }

        if (info.local_path) {
            await addYoutubeToLibrary(info, info.local_path);
            
            // Mac WebM 대응: 로컬 파일 발견 시 자동 프록시 생성 대기열 추가
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const fileObj = window.uploadedFiles[window.uploadedFiles.length - 1];
            if (isMac && info.local_path.toLowerCase().endsWith('.webm') && fileObj) {
                window.proxyQueue.push(fileObj);
                if (typeof processProxyQueue === 'function') {
                    processProxyQueue();
                }
            }
        } else {
            await addYoutubeToLibrary(info);
        }
        urlInput.value = "";
    } catch (err) {
        updateStatus("유튜브 처리 중 오류 발생");
        console.error(err);
        if (confirmBtn) resetLoadButton(confirmBtn);
    }
    setTimeout(() => updateStatus(""), 3000);
}

function resetLoadButton(btn) {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
    btn.querySelector('span').textContent = "불러오기";
}

// 정보가 확보된 유튜브 영상을 라이브러리에 추가
async function addYoutubeToLibrary(info, localPath = null) {
    const fileId = `yt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let finalStreamUrl = info.stream_url;
    // 로컬 파일로 다운로드된 경우 또는 이미 로컬 파일 정보가 있는 경우
    if (localPath || info.path) {
        const actualPath = localPath || info.path;
        // 이미 생성된 프록시가 있다면 그것을 사용
        if (info.proxy_path) {
            let safeProxyPath = info.proxy_path.replace(/\\/g, '/');
            if (safeProxyPath.startsWith('/')) safeProxyPath = safeProxyPath.substring(1);
            finalStreamUrl = `/local_file/${safeProxyPath.split('/').map(encodeURIComponent).join('/')}`;
        } else {
            let safePath = actualPath.replace(/\\/g, '/');
            if (safePath.startsWith('/')) safePath = safePath.substring(1);
            finalStreamUrl = `/local_file/${safePath.split('/').map(encodeURIComponent).join('/')}`;
        }
    } else if (!info.preview_height && info.video_url && info.audio_url) {
        // 소리와 영상이 분리된 스트리밍인 경우 프록시 사용
        finalStreamUrl = `/yt_proxy?v=${encodeURIComponent(info.video_url)}&a=${encodeURIComponent(info.audio_url)}`;
    }

    const fileObj = {
        id: fileId,
        videoId: info.video_id || 'local',
        name: info.title,
        path: localPath || info.path || info.video_url, // 변환용 (로컬 경로 우선)
        audioUrl: localPath || info.path ? null : info.audio_url,
        streamUrl: finalStreamUrl,    // 재생용 URL
        thumbnail: info.thumbnail,
        author: info.author || 'YouTube',
        duration: info.duration,
        width: info.width || 1280,
        height: info.height || 720,
        fps: info.fps || 30,
        previewHeight: (localPath || info.path) ? info.height : (info.preview_height || (info.video_url && info.audio_url ? '1080+' : null)),
        size: info.size || 0,
        segments: [],
        draft: {
            id: `draft_${fileId}`,
            start: 0,
            end: info.duration,
            fps: 24,
            speed: 1.0,
            resolution: "원본",
            numColors: 256,
            useDither: false,
            loopPlayback: true,
            status: 'idle',
            progress: 0
        },
        url: info.url, // Original YouTube URL
        isYoutube: !(localPath || info.path),
        isDownloadedYoutube: !!(localPath || info.path),
        proxyPath: info.proxy_path || null,
        isProxying: false,
        objectUrl: finalStreamUrl
    };

    window.uploadedFiles.push(fileObj);
    addLibraryItem(fileObj);
    selectVideo(fileObj);
    updateStatus(localPath ? "영상을 다운로드하여 추가했습니다." : "유튜브 영상이 추가되었습니다.");
}

async function startYoutubeDownload() {
    console.log("[JS] startYoutubeDownload 호출됨, pendingUrl:", pendingYoutubeUrl);
    if (window.eel) eel.debug_log(`startYoutubeDownload 호출됨, pendingUrl: ${pendingYoutubeUrl}`);

    if (!pendingYoutubeUrl) {
        console.error("[JS] pendingYoutubeUrl이 없습니다!");
        return;
    }
    
    hideModal('yt-download-modal');
    const overlay = document.getElementById('yt-download-overlay');
    overlay.classList.remove('hidden');
    
    const bar = document.getElementById('yt-download-bar');
    const text = document.getElementById('yt-download-progress-text');
    if (bar) bar.style.width = '0%';
    if (text) text.textContent = '0%';
    
    updateStatus("고화질 다운로드 중...");
    console.log("[JS] eel.download_youtube_video 호출 시도...");
    
    try {
        const result = await eel.download_youtube_video(pendingYoutubeUrl)();
        console.log("[JS] eel.download_youtube_video 응답 받음:", result.status);
        
        overlay.classList.add('hidden');
        
        if (result.status === 'success') {
            const fileInfo = await eel.get_file_info(result.path)();
            
            if (fileInfo.status === 'success') {
                // 기존 유튜브 항목 찾기
                const existingFileObj = window.uploadedFiles.find(f => f.isYoutube && f.url === pendingYoutubeUrl);
                
                if (existingFileObj) {
                    // 데이터 업데이트
                    existingFileObj.path = result.path;
                    existingFileObj.isYoutube = false; // 이제 로컬 비디오로 처리
                    existingFileObj.isDownloadedYoutube = true;
                    existingFileObj.width = fileInfo.width;
                    existingFileObj.height = fileInfo.height;
                    existingFileObj.fps = fileInfo.fps;
                    existingFileObj.size = fileInfo.size;
                    
                    // 프록시 정보가 있으면 반영
                    if (fileInfo.proxy_path) {
                        existingFileObj.proxyPath = fileInfo.proxy_path;
                        let safeProxyPath = fileInfo.proxy_path.replace(/\\/g, '/');
                        if (safeProxyPath.startsWith('/')) safeProxyPath = safeProxyPath.substring(1);
                        existingFileObj.objectUrl = `/local_file/${safeProxyPath.split('/').map(encodeURIComponent).join('/')}`;
                    } else {
                        let safePath = result.path.replace(/\\/g, '/');
                        if (safePath.startsWith('/')) safePath = safePath.substring(1);
                        existingFileObj.objectUrl = `/local_file/${safePath.split('/').map(encodeURIComponent).join('/')}`;
                    }
                    
                    // UI 갱신 (전체 렌더링 대신 필요한 부분만 업데이트하거나 새로 그리기)
                    const libraryList = document.getElementById('library-list');
                    const oldItem = libraryList.querySelector(`[data-id="${existingFileObj.id}"]`);
                    if (oldItem) {
                        const nextSibling = oldItem.nextSibling;
                        oldItem.remove();
                        addLibraryItem(existingFileObj);
                        // 순서 유지를 위해 원래 위치로 이동 (addLibraryItem은 마지막에 추가하므로)
                        const newItem = libraryList.querySelector(`[data-id="${existingFileObj.id}"]`);
                        if (nextSibling) {
                            libraryList.insertBefore(newItem, nextSibling);
                        }
                    }
                    
                    selectVideo(existingFileObj);
                    updateStatus("영상을 다운로드하여 라이브러리에 통합했습니다.");

                    // Mac WebM 대응: 다운로드 완료 후 자동 프록시 생성 대기열 추가
                    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                    if (isMac && result.path.toLowerCase().endsWith('.webm')) {
                        window.proxyQueue.push(existingFileObj);
                        if (typeof processProxyQueue === 'function') {
                            processProxyQueue();
                        }
                    }
                } else {
                    // 혹시라도 항목을 못 찾은 경우 기존처럼 새로 추가
                    await addYoutubeToLibrary({
                        video_id: 'downloaded',
                        title: result.title || fileInfo.name,
                        duration: result.duration || fileInfo.duration,
                        width: fileInfo.width,
                        height: fileInfo.height,
                        fps: fileInfo.fps,
                        thumbnail: null 
                    }, result.path);
                }
            } else {
                showToast('파일 정보를 읽을 수 없습니다');
            }
        } else {
            showToast('다운로드 실패: ' + result.message);
        }
    } catch (err) {
        console.error("Download error:", err);
        showToast('다운로드 중 오류가 발생했습니다');
        overlay.classList.add('hidden');
    }
    
    pendingYoutubeUrl = null;
    setTimeout(() => updateStatus(""), 3000);
}

// Eel 콜백 노출
eel.expose(update_youtube_download_progress);
function update_youtube_download_progress(progress) {
    const bar = document.getElementById('yt-download-bar');
    const text = document.getElementById('yt-download-progress-text');
    const statusLabel = document.querySelector('#yt-download-overlay span.text-white');
    
    if (bar) bar.style.width = `${Math.min(progress, 100)}%`;
    if (text) text.textContent = `${Math.round(Math.min(progress, 100))}%`;
    
    if (statusLabel) {
        if (progress >= 99.9 && progress < 100) {
            statusLabel.textContent = "고화질 영상 병합 중 (잠시만 기다려주세요)...";
        } else if (progress >= 100) {
            statusLabel.textContent = "다운로드 완료! 라이브러리에 추가하는 중...";
        } else {
            statusLabel.textContent = "유튜브 고화질 영상 다운로드 중...";
        }
    }
}

// 모달 제어 유틸리티
function showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    
    // 먼저 display: flex를 적용하여 레이아웃 계산 가능하게 함
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // 브라우저가 레이아웃을 계산할 시간을 줌 (Reflow 강제)
    void modal.offsetWidth;
    
    // 애니메이션 클래스 제어
    modal.classList.remove('pointer-events-none', 'opacity-0');
    const inner = modal.querySelector('.relative');
    if (inner) inner.classList.remove('scale-95');
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    
    modal.classList.add('pointer-events-none', 'opacity-0');
    const inner = modal.querySelector('.relative');
    if (inner) inner.classList.add('scale-95');
    
    // 애니메이션이 끝난 후 hidden 처리
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function showYoutubeDownloadModal(title, message, url) {
    pendingYoutubeUrl = url;
    document.getElementById('yt-download-title').textContent = title || "제한된 영상";
    document.getElementById('yt-download-msg').textContent = message || "이 영상은 다운로드가 필요합니다.";
    showModal('yt-download-modal');
}

// Export for global access
window.showYoutubeDownloadModal = showYoutubeDownloadModal;
window.showModal = showModal;
window.hideModal = hideModal;

// 유튜브 입력 UI 초기화
function initYoutubeUI() {
    console.log("[JS] initYoutubeUI 호출됨");
    if (window.eel) eel.debug_log("initYoutubeUI 호출됨");

    const urlInput = document.getElementById('youtube-url-input');
    
    // 모달 버튼 이벤트 바인딩
    const downloadOkBtn = document.getElementById('yt-download-ok-btn');
    const downloadCancelBtn = document.getElementById('yt-download-cancel-btn');
    
    console.log("[JS] 버튼 검색 결과 - OK:", !!downloadOkBtn, "Cancel:", !!downloadCancelBtn);

    if (downloadOkBtn) {
        console.log("[JS] yt-download-ok-btn 리스너 등록 중");
        downloadOkBtn.addEventListener('click', () => {
            console.log("[JS] yt-download-ok-btn 클릭됨!");
            startYoutubeDownload();
        });
    }
    
    if (downloadCancelBtn) {
        downloadCancelBtn.addEventListener('click', () => hideModal('yt-download-modal'));
    }

    // 우클릭 시 자동 붙여넣기 기능
    urlInput.addEventListener('contextmenu', async (e) => {
        e.preventDefault(); // 기본 메뉴 차단
        
        try {
            const text = await eel.get_clipboard_text()();
            
            if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
                urlInput.value = text.trim();
                console.log("[JS] 유튜브 주소 자동 붙여넣기 완료:", urlInput.value);
                handleYoutubeUrl();
            } else {
                showToast('올바른 주소가 아닙니다');
            }
        } catch (err) {
            console.error("[JS] 클립보드 읽기 실패:", err);
        }
    });
}

// 초기화 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initYoutubeUI);
} else {
    initYoutubeUI();
}
