eel.expose(handle_dropped_files_from_python);
function handle_dropped_files_from_python(paths) {
    if (paths && paths.length > 0) {
        processFilePaths(paths);
    }
}

function addLibraryItem(fileObj) {
    const libraryList = document.getElementById('library-list');
    const displaySize = fileObj.size >= 1024 * 1024 * 1024 
        ? (fileObj.size / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
        : (fileObj.size / (1024 * 1024)).toFixed(1) + ' MB';
    const format = fileObj.name.split('.').pop().toUpperCase();
    const itemDiv = document.createElement('div');
    itemDiv.className = "library-item bg-white text-indigo-600 shadow-sm rounded-lg p-3 cursor-pointer group transition-all duration-200 ease-in-out border border-indigo-200 hover:border-indigo-400 select-none";

    const index = window.uploadedFiles.indexOf(fileObj);
    itemDiv.setAttribute('data-id', fileObj.id);
    
    // 우클릭 이벤트 바인딩
    itemDiv.addEventListener('contextmenu', (e) => showContextMenu(e, fileObj));

    itemDiv.innerHTML = `
        <div class="flex flex-col gap-2">
            <div class="flex gap-3 items-center">
                <div class="flex items-center">
                    <input type="checkbox" class="lib-checkbox w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" data-index="${index}" />
                </div>
                ${fileObj.isYoutube ? `
                <div class="w-12 h-8 rounded bg-slate-200 overflow-hidden flex-shrink-0 relative">
                    <img src="${fileObj.thumbnail}" class="w-full h-full object-cover" />
                    <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                        <span class="material-symbols-outlined text-white text-xs">play_circle</span>
                    </div>
                </div>
                ` : ''}
                <div class="flex-1 flex flex-col justify-center overflow-hidden">
                    <div class="library-item-name-container">
                        <span class="marquee-text font-semibold text-on-surface">${fileObj.name}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-0.5 min-h-[20px]">
                        <div class="file-metadata flex items-center gap-1 overflow-hidden">
                            <span class="text-xs text-slate-500 font-medium truncate max-w-[100px]">${fileObj.isYoutube || fileObj.isDownloadedYoutube ? (fileObj.author || 'YouTube') : displaySize}</span>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                ${(fileObj.isYoutube || fileObj.isDownloadedYoutube) ? `
                                <span class="flex items-center" style="line-height:0;margin-top:-2px" title="YouTube">
                                    <svg viewBox="0 0 28 20" width="16" height="11" style="vertical-align:middle" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M27.4 3.1a3.5 3.5 0 0 0-2.5-2.5C22.8 0 14 0 14 0S5.2 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.2 0 9.6 0 9.6s0 4.4.6 6.5a3.5 3.5 0 0 0 2.5 2.5C5.2 19.2 14 19.2 14 19.2s8.8 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5c.6-2.1.6-6.5.6-6.5s0-4.4-.6-6.5z" fill="#FF0000"/>
                                        <path d="M11.2 13.7V5.5l7.2 4.1-7.2 4.1z" fill="#fff"/>
                                    </svg>
                                </span>` : `<span class="bg-slate-100 text-slate-500 px-1 py-0 rounded text-[9px] font-bold uppercase tracking-wider border border-slate-200/50 leading-tight">${format}</span>`}
                                <span class="proxy-badge bg-indigo-50 text-indigo-600 px-1 py-0 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-100 leading-tight ${fileObj.proxyPath || fileObj.isDownloadedYoutube ? '' : 'hidden'}">Proxy</span>
                            </div>
                        </div>
                        <div class="proxy-status-container">
                            <span class="proxy-status-text text-[10px] font-bold text-indigo-500 animate-pulse"></span>
                        </div>
                    </div>
                </div>
                <button class="delete-file-btn opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all outline-none">
                    <span class="material-symbols-outlined text-xl">delete</span>
                </button>
            </div>
            <div class="proxy-progress-container w-full h-1 bg-slate-100 rounded-full overflow-hidden hidden">
                <div class="proxy-progress-bar h-full bg-indigo-500 transition-all duration-300" style="width: 0%"></div>
            </div>
            <div class="conversion-progress-container w-full h-1 bg-slate-100 rounded-full overflow-hidden hidden">
                <div class="conversion-progress-bar h-full bg-green-500 transition-all duration-300" style="width: 0%"></div>
            </div>
            <div class="segments-container flex flex-col gap-1 mt-2 border-t border-indigo-50 pt-2 empty:hidden"></div>
        </div>
    `;

    // 체크박스 이벤트 리스너 추가
    const checkbox = itemDiv.querySelector('.lib-checkbox');
    checkbox.addEventListener('change', () => {
        updateBatchButtonState();
    });

    itemDiv.addEventListener('click', (e) => {
        if (e.target.closest('input') || e.target.closest('button')) return;
        selectVideo(fileObj);
    });

    // Marquee Hover Effect
    itemDiv.addEventListener('mouseenter', () => {
        const container = itemDiv.querySelector('.library-item-name-container');
        const text = itemDiv.querySelector('.marquee-text');
        if (container && text) {
            const scrollDist = text.offsetWidth - container.offsetWidth;
            if (scrollDist > 0) {
                const totalDist = scrollDist + 30; // 여유 공간
                const duration = Math.max(2, totalDist / 30); // 속도 조절 (30px/s)
                
                text.style.setProperty('--marquee-dist', `-${totalDist}px`);
                text.style.setProperty('--marquee-duration', `${duration}s`);
                text.classList.add('animate-marquee');
            }
        }
    });

    itemDiv.addEventListener('mouseleave', () => {
        const text = itemDiv.querySelector('.marquee-text');
        if (text) {
            text.classList.remove('animate-marquee');
            // 즉시 제자리로 돌아가게 하기 위해 transform 초기화
            text.style.transform = 'translateX(0)';
        }
    });

    const deleteBtn = itemDiv.querySelector('.delete-file-btn');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        // 프록시 생성 중인 경우 백엔드에 취소 신호 발송
        if (window.eel && typeof eel.cancel_proxy === 'function') {
            eel.cancel_proxy(fileObj.id)();
        }

        const idx = window.uploadedFiles.indexOf(fileObj);
        if (idx > -1) {
            window.uploadedFiles.splice(idx, 1);
        }
        itemDiv.remove();
        
        document.querySelectorAll('.lib-checkbox').forEach((cb, i) => {
            cb.dataset.index = i;
        });

        // 현재 선택된 파일인 경우 UI 초기화
        if (window.selectedFileObj === fileObj) {
            const overlay = document.getElementById('proxy-overlay');
            if (overlay) overlay.classList.add('hidden');
            
            if (window.uploadedFiles.length > 0) {
                selectVideo(window.uploadedFiles[0]);
            } else {
                selectVideo(null);
            }
        }
        
        updateBatchButtonState();
        updateLibraryEmptyState();
    });

    libraryList.appendChild(itemDiv);
    updateLibraryEmptyState();
}

function updateLibraryEmptyState() {
    const emptyState = document.getElementById('library-empty-state');
    const compactYtBtn = document.getElementById('add-youtube-btn-compact');
    const compactVideoBtn = document.getElementById('add-video-btn-compact');
    
    if (window.uploadedFiles.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (compactYtBtn) compactYtBtn.classList.add('hidden');
        if (compactVideoBtn) compactVideoBtn.classList.add('hidden');
    } else {
        if (emptyState) emptyState.classList.add('hidden');
        if (compactYtBtn) compactYtBtn.classList.remove('hidden');
        if (compactVideoBtn) compactVideoBtn.classList.remove('hidden');
    }
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
        
        const isThisEditing = isActive && window.isEditingSavedSegment;
        const timeRange = `${formatTime(seg.start)} - ${formatTime(seg.end)}`;
        
        segDiv.innerHTML = `
            <div class="flex flex-col flex-1 overflow-hidden pr-1">
                <div class="flex items-center gap-1">
                    <span class="opacity-40 flex-shrink-0 text-[10px]">#${idx + 1}</span>
                    <span class="segment-time font-bold text-slate-700 whitespace-nowrap">${timeRange}</span>
                </div>
                ${(seg.status === 'encoding' || seg.status === 'waiting') ? `
                    <div class="w-full h-0.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div class="h-full bg-indigo-400 transition-all duration-300" style="width: ${seg.progress || 0}%"></div>
                    </div>
                ` : ''}
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <div class="text-right min-w-[28px] mr-0.5">
                    ${seg.status === 'encoding' ? `<span class="text-indigo-500 font-black animate-pulse">${seg.progress}%</span>` : ''}
                    ${seg.status === 'completed' ? `<span class="text-green-500 font-bold animate-in fade-in slide-in-from-right-1">완료</span>` : ''}
                </div>
                <button class="edit-seg-btn p-1.5 rounded-md hover:bg-indigo-100 transition-all ${isThisEditing ? 'text-indigo-600 bg-indigo-50 shadow-sm' : 'text-slate-500'}" title="구간 수정">
                    <span class="material-symbols-outlined text-[18px]">${isThisEditing ? 'check_circle' : 'edit_square'}</span>
                </button>
                <button class="delete-seg-btn text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all p-1.5 rounded-md" data-seg-id="${seg.id}" title="삭제">
                    <span class="material-symbols-outlined text-[18px]">close</span>
                </button>
            </div>
        `;
        
        segDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            fileObj.activeSegmentId = seg.id;
            window.isEditingSavedSegment = false;
            selectVideo(fileObj); 
            renderSegments(fileObj);
        });

        const editBtn = segDiv.querySelector('.edit-seg-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (fileObj.activeSegmentId === seg.id && window.isEditingSavedSegment) {
                window.isEditingSavedSegment = false;
            } else {
                fileObj.activeSegmentId = seg.id;
                window.isEditingSavedSegment = true;
            }
            selectVideo(fileObj);
            renderSegments(fileObj);
        });

        const delBtn = segDiv.querySelector('.delete-seg-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSegment(seg.id);
        });

        container.appendChild(segDiv);
    });
    
    updateSyncToggleVisibility();
    renderGhostMarkers();
}

function deleteSegment(segId) {
    if (!window.selectedFileObj) return;
    const fileObj = window.selectedFileObj;
    const sIdx = fileObj.segments.findIndex(s => s.id === segId);
    if (sIdx !== -1) {
        fileObj.segments.splice(sIdx, 1);
        
        // 현재 편집 중이던 구간이 삭제된 경우 draft로 돌아가기
        if (fileObj.activeSegmentId === segId) {
            fileObj.activeSegmentId = null;
            window.isEditingSavedSegment = false;
            window.selectedSegmentObj = getActiveSegment(fileObj);
            syncUIToFile(fileObj);
        }
        
        // 항상 라이브러리 목록과 타임라인 고스트 마커를 즉시 갱신
        renderSegments(fileObj);
        fullUpdateTimelineUI();
        
        updateStatus("구간이 삭제되었습니다.");
        setTimeout(() => updateStatus(""), 2000);
    }
}

async function processFilePaths(paths) {
    if (window.isProcessingFiles) return;
    window.isProcessingFiles = true;
    updateStatus(`${paths.length}개의 파일 분석 중...`);

    for (const path of paths) {
        try {
            const fileInfo = await eel.get_file_info(path)();
            const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const displayPath = fileInfo.proxy_path || fileInfo.path;
            const encodedPath = displayPath.replace(/\\/g, '/').split('/').map(p => encodeURIComponent(p)).join('/');
            const objectUrl = `/local_file/${encodedPath.startsWith('/') ? encodedPath.substring(1) : encodedPath}`;

            const fileObj = {
                id: fileId,
                name: fileInfo.name,
                path: fileInfo.path,
                size: fileInfo.size,
                duration: fileInfo.duration,
                width: fileInfo.width,
                height: fileInfo.height,
                fps: fileInfo.fps,
                objectUrl: objectUrl,
                segments: [],
                draft: {
                    id: `draft_${fileId}`,
                    start: 0,
                    end: fileInfo.duration,
                    fps: 24,
                    speed: 1.0,
                    resolution: "중간 (720p)",
                    numColors: 256,
                    useDither: false,
                    loopPlayback: true,
                    format: 'gif',
                    includeAudio: true,
                    status: 'idle',
                    progress: 0
                },
                proxyPath: fileInfo.proxy_path,
                isProxying: false,
                isYoutube: false
            };

            window.uploadedFiles.push(fileObj);
            addLibraryItem(fileObj);
            
            // Mac WebM 대응: 프록시 자동 생성 대기열 추가
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            if (isMac && fileObj.name.toLowerCase().endsWith('.webm') && !fileObj.proxyPath) {
                window.proxyQueue.push(fileObj);
            }
        } catch (err) {
            console.error("File processing error:", err);
        }
    }

    if (window.uploadedFiles.length > 0 && !window.selectedFileObj) {
        selectVideo(window.uploadedFiles[0]);
    }
    
    window.isProcessingFiles = false;
    updateStatus("");
    processProxyQueue();
}
// --- Custom Context Menu Logic ---
function showContextMenu(e, fileObj) {
    e.preventDefault();
    e.stopPropagation();
    
    const ctxMenu = document.getElementById('custom-context-menu');
    if (!ctxMenu) return;
    
    window.ctxTargetFile = fileObj;

    // 메뉴 위치 설정
    ctxMenu.style.left = `${e.pageX}px`;
    ctxMenu.style.top = `${e.pageY}px`;
    ctxMenu.classList.remove('hidden');

    // 프록시 버튼 상태 업데이트
    const proxyBtn = document.getElementById('ctx-generate-proxy');
    if (proxyBtn) {
        if (fileObj.isYoutube || fileObj.proxyPath || fileObj.isProxying) {
            proxyBtn.classList.add('opacity-30', 'pointer-events-none');
            const icon = proxyBtn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = fileObj.isYoutube ? "link" : (fileObj.isProxying ? "pending" : "check_circle");
        } else {
            proxyBtn.classList.remove('opacity-30', 'pointer-events-none');
            const icon = proxyBtn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = "speed";
        }
    }

    // 폴더 열기 버튼 상태 업데이트 (유튜브는 폴더가 없으므로 비활성화)
    const openFolderBtn = document.getElementById('ctx-open-folder');
    if (openFolderBtn) {
        if (fileObj.isYoutube) {
            openFolderBtn.classList.add('opacity-30', 'pointer-events-none');
        } else {
            openFolderBtn.classList.remove('opacity-30', 'pointer-events-none');
        }
    }
}

// 메뉴 항목 클릭 처리 초기화
document.addEventListener('DOMContentLoaded', () => {
    const ctxMenu = document.getElementById('custom-context-menu');
    if (!ctxMenu) return;

    // 메뉴 바깥 클릭 시 닫기
    document.addEventListener('click', () => {
        ctxMenu.classList.add('hidden');
    });

    const genProxyBtn = document.getElementById('ctx-generate-proxy');
    if (genProxyBtn) {
        genProxyBtn.addEventListener('click', () => {
            if (window.ctxTargetFile && typeof startProxyConversion === 'function') {
                startProxyConversion(window.ctxTargetFile);
            }
        });
    }

    const openFolderBtn = document.getElementById('ctx-open-folder');
    if (openFolderBtn) {
        openFolderBtn.addEventListener('click', () => {
            if (window.ctxTargetFile && window.ctxTargetFile.path) {
                eel.open_file_location(window.ctxTargetFile.path)();
            }
        });
    }

    const deleteBtn = document.getElementById('ctx-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (window.ctxTargetFile) {
                const item = document.querySelector(`[data-id="${window.ctxTargetFile.id}"]`);
                if (item) {
                    const realDeleteBtn = item.querySelector('.delete-file-btn');
                    if (realDeleteBtn) realDeleteBtn.click();
                }
            }
        });
    }
});
