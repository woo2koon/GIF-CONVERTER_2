function initCustomDropdowns() {
    const dropdowns = document.querySelectorAll('.custom-dropdown');
    
    dropdowns.forEach(dropdown => {
        const trigger = dropdown.querySelector('.dropdown-trigger');
        const menu = dropdown.querySelector('.dropdown-menu');
        const items = dropdown.querySelectorAll('.dropdown-item');
        const selectedSpan = trigger.querySelector('span:first-child');
        
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.dropdown-menu').forEach(m => {
                if (m !== menu) m.classList.remove('show');
            });
            menu.classList.toggle('show');
        });
        
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = item.dataset.value;
                selectedSpan.textContent = item.textContent;
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                menu.classList.remove('show');
                dropdown.dispatchEvent(new CustomEvent('change', { detail: { value } }));
            });
        });
    });
    
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
    });
}

function updateSyncToggleVisibility() {
    const container = document.getElementById('batch-sync-container');
    const batchSyncToggle = document.getElementById('batch-sync-toggle');
    if (!window.selectedFileObj || !container) return;
    
    const segmentCount = window.selectedFileObj.segments.length;
    
    if (segmentCount >= 2) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
        updateToggleUI(batchSyncToggle, false);
        window.selectedFileObj.isBatchSync = false;
    }
}

function updateBatchButtonState() {
    const checkedBoxes = document.querySelectorAll('.lib-checkbox:checked');
    const checkedCount = checkedBoxes.length;
    const isBatch = checkedCount >= 2;
    const splitPart = document.getElementById('split-part');
    const convertBtn = document.getElementById('convert-btn');
    
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
        const batchMenu = document.getElementById('batch-menu');
        if (batchMenu) batchMenu.classList.add('hidden');
    }

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
