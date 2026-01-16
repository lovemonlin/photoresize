// Image Resizer Web Logic (v3.0)

// Constants
const PRINT_SIZES = {
    "4x6": { minW: 1200, minH: 800 },
    "5x7": { minW: 1500, minH: 2100 },
    "8x10": { minW: 2400, minH: 3000 },
    "8x12": { minW: 2400, minH: 3600 },
    "10x12": { minW: 3000, minH: 3600 },
    "11x14": { minW: 3300, minH: 4200 },
    "12x18": { minW: 3600, minH: 5400 },
    "16x20": { minW: 4800, minH: 6000 },
    "20x24": { minW: 4800, minH: 6000 }
};

// State
let files = []; // [{file, id, thumbUrl}]
let isProcessing = false;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const emptyState = document.getElementById('emptyState');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const percentSelect = document.getElementById('percentSelect');
const percentCustom = document.getElementById('percentCustom');

// --- Initialization & Event Listeners ---

// Percent Custom Input Toggle
percentSelect.addEventListener('change', (e) => {
    percentCustom.style.display = e.target.value === 'custom' ? 'block' : 'none';
});

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    handleFiles(e.dataTransfer.files);
});

// File Input
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

// --- Logic Functions ---

function toggleSettings() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    document.getElementById('setting-percentage').classList.add('hidden');
    document.getElementById('setting-print').classList.add('hidden');
    document.getElementById('setting-purpose').classList.add('hidden');
    document.getElementById('setting-quality').classList.add('hidden');

    document.getElementById('setting-' + mode).classList.remove('hidden');
}

function handleFiles(newFiles) {
    if (!newFiles.length) return;

    Array.from(newFiles).forEach(file => {
        // Simple type check
        if (!file.type.startsWith('image/')) return;

        // Check duplicate
        if (files.some(f => f.file.name === file.name && f.file.size === file.size)) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const item = {
                file: file,
                id: Date.now() + Math.random(),
                thumbUrl: e.target.result
            };
            files.push(item);
            renderFileItem(item);
            updateEmptyState();
            statusText.innerText = `已加入 ${files.length} 張照片`;
        };
        reader.readAsDataURL(file);
    });
}

function renderFileItem(item) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.id = 'item-' + item.id;
    div.innerHTML = `
        <img src="${item.thumbUrl}" class="file-thumb">
        <div class="file-info">
            <div class="file-name">${item.file.name}</div>
            <div class="file-size">${(item.file.size / 1024 / 1024).toFixed(2)} MB</div>
        </div>
        <button class="btn btn-danger" onclick="removeFile(${item.id})">✕</button>
    `;
    fileListEl.appendChild(div);
}

function removeFile(id) {
    files = files.filter(f => f.id !== id);
    document.getElementById('item-' + id).remove();
    updateEmptyState();
    statusText.innerText = `已加入 ${files.length} 張照片`;
}

function clearAll() {
    files = [];
    fileListEl.innerHTML = '';
    updateEmptyState();
    statusText.innerText = '準備就緒';
}

function updateEmptyState() {
    emptyState.style.display = files.length ? 'none' : 'block';
}

// --- Processing Logic ---

async function startProcessing() {
    if (files.length === 0) {
        alert('請先加入照片！');
        return;
    }
    if (isProcessing) return;

    isProcessing = true;
    progressBar.style.width = '0%';

    const zip = new JSZip();
    const mode = document.querySelector('input[name="mode"]:checked').value;

    // Get Settings
    let settings = {};
    if (mode === 'percentage') {
        let val = percentSelect.value;
        if (val === 'custom') val = percentCustom.value;
        settings.percent = parseInt(val);
        if (isNaN(settings.percent) || settings.percent <= 0) {
            alert('請輸入有效的百分比');
            isProcessing = false; return;
        }
    } else if (mode === 'print') {
        const val = document.getElementById('printSelect').value;
        settings.target = PRINT_SIZES[val];
    } else if (mode === 'purpose') {
        settings.size = parseInt(document.getElementById('purposeSelect').value);
    } else if (mode === 'quality') {
        settings.quality = parseFloat(document.querySelector('input[name="qualityVal"]:checked').value);
        if (!settings.quality) settings.quality = 0.7; // default
    }

    let processedCount = 0;

    for (const item of files) {
        statusText.innerText = `處理中... ${item.file.name}`;

        try {
            const blob = await processOneImage(item.file, mode, settings);
            // Add to zip
            const newName = getNewFileName(item.file.name, mode);
            zip.file(newName, blob);
        } catch (err) {
            console.error(err);
        }

        processedCount++;
        progressBar.style.width = `${(processedCount / files.length) * 100}%`;

        // Allow UI update
        await new Promise(r => setTimeout(r, 10));
    }

    statusText.innerText = '正在建立壓縮檔...';

    // Generate ZIP
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "resized_photos.zip");

    statusText.innerText = '完成！';
    isProcessing = false;
}

function getNewFileName(originalName, mode) {
    const parts = originalName.split('.');
    const ext = parts.pop();
    const name = parts.join('.');
    return `${name}_resize.${ext}`;
}

// Core Image Processing
function processOneImage(file, mode, settings) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            let w = img.width;
            let h = img.height;
            let finalW = w;
            let finalH = h;
            let quality = 0.92; // default high

            // Calculation
            if (mode === 'percentage') {
                const ratio = settings.percent / 100;
                finalW = Math.round(w * ratio);
                finalH = Math.round(h * ratio);
                canvas.width = finalW;
                canvas.height = finalH;
                ctx.drawImage(img, 0, 0, finalW, finalH);

            } else if (mode === 'purpose') {
                const target = settings.size;
                const scale = target / Math.max(w, h);
                finalW = Math.round(w * scale);
                finalH = Math.round(h * scale);
                canvas.width = finalW;
                canvas.height = finalH;
                ctx.drawImage(img, 0, 0, finalW, finalH);

            } else if (mode === 'print') {
                // Smart Crop (Fit) logic
                // Ensure target orientation matches source roughly to avoid rotation confusion
                // But simplified: fit into minW/minH box? No, print sizes are fixed ratios
                // We'll use "Cover" logic (Crop to fill) or "Contain" (Fit inside)?
                // Python code used ImageOps.fit -> Crop to fill

                const tW = settings.target.minW;
                const tH = settings.target.minH;

                // Match orientation
                let targetW = tW, targetH = tH;
                if ((w > h && tW < tH) || (w < h && tW > tH)) {
                    targetW = tH;
                    targetH = tW;
                }

                // Calculate ratio to cover
                const ratioW = targetW / w;
                const ratioH = targetH / h;
                const ratio = Math.max(ratioW, ratioH);

                const centerW = (w * ratio - targetW) / 2;
                const centerH = (h * ratio - targetH) / 2;

                canvas.width = targetW;
                canvas.height = targetH;

                // Draw clipped
                ctx.drawImage(img,
                    -centerW, -centerH,
                    w * ratio, h * ratio
                );

            } else if (mode === 'quality') {
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                quality = settings.quality;
            }

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas to Blob failed'));
            }, 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
