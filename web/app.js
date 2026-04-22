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
    const timelineContainer = document.getElementById('timeline-container');
    const timelineTrack = document.getElementById('timeline-track');
    const timelineSelection = document.getElementById('timeline-selection');
    const handleLeft = document.getElementById('handle-left');
    const handleRight = document.getElementById('handle-right');
    const playhead = document.getElementById('playhead');
    const trimStartDisplay = document.getElementById('trim-start-display');
    const trimEndDisplay = document.getElementById('trim-end-display');
    const filmstripContainer = document.getElementById('filmstrip-container');
    
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const resetBtn = document.getElementById('trim-reset-btn');
    
    let currentVideoPath = null;
    let currentVideoFileName = null;
    let videoDuration = 0;
    let selectedFileObj = null;
    let zoomLevel = 1;

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
                const fileObj = {
                    name: res.name,
                    path: res.path,
                    objectUrl: `/local_file/${res.path.replace(/\\/g, '/')}`,
                    size: res.size,
                    trimStart: 0,
                    trimEnd: 0,
                    duration: 0,
                    filmstrip: [],
                    aspectRatio: 16/9
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
        
        mainPlayer.src = fileObj.objectUrl;
        mainPlayer.classList.remove('hidden');
        placeholderMsg.classList.add('hidden');
        
        document.getElementById('header-filename').textContent = fileObj.name;
        
        mainPlayer.onloadedmetadata = () => {
            fileObj.duration = mainPlayer.duration;
            fileObj.aspectRatio = mainPlayer.videoWidth / mainPlayer.videoHeight;
            
            if (fileObj.trimEnd === 0) {
                fileObj.trimEnd = fileObj.duration;
            }
            videoDuration = fileObj.duration;
            
            zoomLevel = 1;
            timelineTrack.style.width = "100%";
            
            updateTimelineUI();
            generateFilmstrip(fileObj);
            
            const w = mainPlayer.videoWidth;
            const h = mainPlayer.videoHeight;
            document.getElementById('header-resolution').textContent = `${w}X${h} 원본`;
        };
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(1);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(4, '0')}`;
    }

    function updateTimelineUI() {
        if (!selectedFileObj || selectedFileObj.duration === 0) return;

        const duration = selectedFileObj.duration;
        const startPct = (selectedFileObj.trimStart / duration) * 100;
        const endPct = (selectedFileObj.trimEnd / duration) * 100;

        handleLeft.style.left = `${startPct}%`;
        handleLeft.style.transform = "translateX(-50%)";
        
        handleRight.style.left = `${endPct}%`;
        handleRight.style.transform = "translateX(-50%)";

        timelineSelection.style.left = `${startPct}%`;
        timelineSelection.style.right = `${100 - endPct}%`;

        trimStartDisplay.textContent = `시작: ${formatTime(selectedFileObj.trimStart)}`;
        trimEndDisplay.textContent = `종료: ${formatTime(selectedFileObj.trimEnd)}s`;
        
        const currentPct = (mainPlayer.currentTime / duration) * 100;
        playhead.style.left = `${currentPct}%`;
    }

    document.addEventListener('keydown', (e) => {
        if (!selectedFileObj) return;
        const key = e.key.toLowerCase();
        const curTime = mainPlayer.currentTime;
        
        if (key === 'i') {
            selectedFileObj.trimStart = Math.min(curTime, selectedFileObj.trimEnd - 0.1);
            statusMsg.textContent = "시작점(IN) 설정됨";
            updateTimelineUI();
        } else if (key === 'o') {
            selectedFileObj.trimEnd = Math.max(curTime, selectedFileObj.trimStart + 0.1);
            statusMsg.textContent = "종료점(OUT) 설정됨";
            updateTimelineUI();
        } else if (key === ' ') { 
            e.preventDefault();
            if (mainPlayer.paused) mainPlayer.play();
            else mainPlayer.pause();
        }
    });

    zoomInBtn.addEventListener('click', () => {
        if (!selectedFileObj) return;
        zoomLevel = Math.min(zoomLevel * 1.5, 15);
        timelineTrack.style.width = `${zoomLevel * 100}%`;
        updateTimelineUI();
        displayFilmstrip(selectedFileObj);
    });

    zoomOutBtn.addEventListener('click', () => {
        if (!selectedFileObj) return;
        zoomLevel = Math.max(zoomLevel / 1.5, 1);
        timelineTrack.style.width = `${zoomLevel * 100}%`;
        updateTimelineUI();
        displayFilmstrip(selectedFileObj);
    });

    resetBtn.addEventListener('click', () => {
        if (!selectedFileObj) return;
        selectedFileObj.trimStart = 0;
        selectedFileObj.trimEnd = selectedFileObj.duration;
        updateTimelineUI();
    });

    let isDraggingLeft = false;
    let isDraggingRight = false;

    handleLeft.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isDraggingLeft = true;
        mainPlayer.pause();
    });

    handleRight.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isDraggingRight = true;
        mainPlayer.pause();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingLeft && !isDraggingRight) return;
        if (!selectedFileObj) return;

        const rect = timelineTrack.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const pct = x / rect.width;
        const time = pct * selectedFileObj.duration;

        if (isDraggingLeft) {
            selectedFileObj.trimStart = Math.max(0, Math.min(time, selectedFileObj.trimEnd - 0.1));
            mainPlayer.currentTime = selectedFileObj.trimStart;
        } else if (isDraggingRight) {
            selectedFileObj.trimEnd = Math.min(selectedFileObj.duration, Math.max(time, selectedFileObj.trimStart + 0.1));
            mainPlayer.currentTime = selectedFileObj.trimEnd;
        }

        updateTimelineUI();
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingLeft || isDraggingRight) {
            mainPlayer.play();
        }
        isDraggingLeft = false;
        isDraggingRight = false;
    });

    timelineTrack.addEventListener('click', (e) => {
        if (!selectedFileObj) return;
        if (e.target === handleLeft || e.target === handleRight) return;
        
        const rect = timelineTrack.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        const time = pct * selectedFileObj.duration;
        
        mainPlayer.currentTime = time;
        updateTimelineUI();
    });

    mainPlayer.addEventListener('timeupdate', () => {
        if (!selectedFileObj || isDraggingLeft || isDraggingRight) return;
        
        if (mainPlayer.currentTime < selectedFileObj.trimStart) {
            mainPlayer.currentTime = selectedFileObj.trimStart;
        }
        if (mainPlayer.currentTime >= selectedFileObj.trimEnd) {
            mainPlayer.currentTime = selectedFileObj.trimStart;
            mainPlayer.play();
        }

        const pct = (mainPlayer.currentTime / selectedFileObj.duration) * 100;
        playhead.style.left = `${pct}%`;
    });

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
        const resolution = resSelect.options[resSelect.selectedIndex].text;
        
        const colorsSelect = document.getElementById('colors-select');
        const numColors = parseInt(colorsSelect.value) || 256;
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
