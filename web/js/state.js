// Global State
window.currentOS = 'Unknown';
window.uploadedFiles = [];
window.selectedFileObj = null;
window.selectedSegmentObj = null;
window.isProcessingFiles = false;
window.isEditingSavedSegment = false;

// Player/Video State
window.currentVideoPath = null;
window.currentVideoFileName = null;
window.videoDuration = 0;
window.zoomLevel = 1;

// Queue Management
window.proxyQueue = [];
window.activeProxyCount = 0;
window.MAX_CONCURRENT_PROXIES = 3;

window.conversionQueue = [];
window.activeConversionCount = 0;
window.MAX_CONCURRENT_CONVERSIONS = 2;
window.totalBatchCount = 0;
window.completedBatchCount = 0;

// YouTube 실시간 병합 프록시 관련 상태
window.proxyStartTime = 0;
window.isProxySeeking = false;

// Promise Management
window.proxyResolvers = new Map();
window.conversionResolvers = new Map();

// Crop State
window.isCropMode = false;
window.isCropDragging = false;
window.cropDragHandle = null;
window.cropBoxState = { x: 10, y: 10, w: 80, h: 80 };
window.cropStartX = 0;
window.cropStartY = 0;
window.cropAspectRatio = 'free';

// Timeline State
window.lastVolume = 0.8;
window.isAspectRatioLocked = true;
window.lastTouchedCustomInput = 'width';
