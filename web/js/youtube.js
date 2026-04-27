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
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                confirmBtn.querySelector('span').textContent = "불러오기";
            }
            setTimeout(() => updateStatus(""), 5000);
            return;
        }

        // 성공 시 모달 닫기
        if (youtubeModal) {
            youtubeModal.classList.add('pointer-events-none', 'opacity-0');
            const inner = youtubeModal.querySelector('.relative');
            if (inner) inner.classList.add('scale-95');
        }

        const fileId = `yt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 성능을 위해 직접 재생 가능한 720p MP4 주소를 우선 사용
        // 만약 소리가 없는 고화질 스트림만 있다면 프록시를 통해 병합 재생
        let finalStreamUrl = info.stream_url;
        if (!info.preview_height && info.video_url && info.audio_url) {
            finalStreamUrl = `/yt_proxy?v=${encodeURIComponent(info.video_url)}&a=${encodeURIComponent(info.audio_url)}`;
        }

        const fileObj = {
            id: fileId,
            videoId: info.video_id,
            name: info.title,
            path: info.video_url,         // 변환용 고화질 비디오
            audioUrl: info.audio_url,      // 변환용 오디오
            streamUrl: finalStreamUrl,    // 재생용 URL (성능 우선)
            thumbnail: info.thumbnail,
            author: info.author,
            duration: info.duration,
            width: info.width || 1280,
            height: info.height || 720,
            fps: info.fps || 30,
            previewHeight: info.preview_height || (info.video_url && info.audio_url ? '1080+' : null),
            size: 0,
            segments: [],
            draft: {
                id: `draft_${fileId}`,
                start: 0,
                end: info.duration,
                fps: 24,
                resolution: "중간 (720p)",
                numColors: 256,
                useDither: false,
                loopPlayback: true,
                status: 'idle',
                progress: 0
            },
            isYoutube: true,
            proxyPath: null,
            isProxying: false,
            objectUrl: info.stream_url    // 재생용으로 동일하게 설정
        };

        window.uploadedFiles.push(fileObj);
        addLibraryItem(fileObj);
        selectVideo(fileObj);
        updateStatus("유튜브 영상이 추가되었습니다.");
        urlInput.value = "";
    } catch (err) {
        updateStatus("유튜브 처리 중 오류 발생");
        console.error(err);
    }
    setTimeout(() => updateStatus(""), 3000);
}

// 유튜브 입력 UI 초기화
function initYoutubeUI() {
    const urlInput = document.getElementById('youtube-url-input');
    if (!urlInput) return;

    // 우클릭 시 자동 붙여넣기 기능
    urlInput.addEventListener('contextmenu', async (e) => {
        e.preventDefault(); // 기본 메뉴 차단
        
        try {
            // 파이썬 백엔드를 통해 클립보드 텍스트 읽기 (브라우저 보안 제약 우회)
            const text = await eel.get_clipboard_text()();
            
            if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
                urlInput.value = text.trim();
                console.log("[JS] 유튜브 주소 자동 붙여넣기 완료:", urlInput.value);
                
                // 자동으로 영상 불러오기 실행
                handleYoutubeUrl();
            } else {
                showToast('올바른 주소가 아닙니다');
                console.warn("[JS] 클립보드에 유효한 유튜브 주소가 없습니다.");
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
