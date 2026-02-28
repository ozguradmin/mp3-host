// ===== MP3 Host — GitHub Storage App =====

const STORAGE_KEY = 'mp3host_settings';
const HISTORY_KEY = 'mp3host_history';

// ===== State =====
let settings = loadSettings();
let history = loadHistory();

// ===== DOM Elements =====
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.getElementById('closeModal');
const ghTokenInput = document.getElementById('ghToken');
const ghRepoInput = document.getElementById('ghRepo');
const saveSettingsBtn = document.getElementById('saveSettings');
const setupBanner = document.getElementById('setupBanner');
const setupBtn = document.getElementById('setupBtn');
const mainContent = document.getElementById('mainContent');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadCard = document.getElementById('uploadCard');
const uploadName = document.getElementById('uploadName');
const uploadSize = document.getElementById('uploadSize');
const progressFill = document.getElementById('progressFill');
const uploadStatus = document.getElementById('uploadStatus');
const resultCard = document.getElementById('resultCard');
const resultUrl = document.getElementById('resultUrl');
const copyBtn = document.getElementById('copyBtn');
const openUrlBtn = document.getElementById('openUrlBtn');
const uploadAnotherBtn = document.getElementById('uploadAnotherBtn');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');

// ===== TTS DOM Elements =====
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const ttsText = document.getElementById('ttsText');
const radioDefault = document.querySelector('input[name="refType"][value="default"]');
const radioCustom = document.querySelector('input[name="refType"][value="custom"]');
const customRefArea = document.getElementById('customRefArea');
const ttsDropZone = document.getElementById('ttsDropZone');
const ttsFileInput = document.getElementById('ttsFileInput');
const ttsFileName = document.getElementById('ttsFileName');
const generateTtsBtn = document.getElementById('generateTtsBtn');
const ttsResultArea = document.getElementById('ttsResultArea');
const ttsAudio = document.getElementById('ttsAudio');
const downloadTtsBtn = document.getElementById('downloadTtsBtn');
const saveTtsAsMp3Btn = document.getElementById('saveTtsAsMp3Btn');
const ttsProgressCard = document.getElementById('ttsProgressCard');
const ttsProgressFill = document.getElementById('ttsProgressFill');
const ttsStatus = document.getElementById('ttsStatus');

// ===== State (TTS) =====
let customTtsFile = null;
let currentTtsBlob = null;
const DEFAULT_REF_URL = 'https://raw.githubusercontent.com/ozguradmin/mp3-storage/main/uploads/1772289155579_en-US-Chirp3-HD-Umbriel.mp3';

// ===== Init =====
function init() {
    updateUI();
    renderHistory();
    bindEvents();
}

function updateUI() {
    if (!settings.token || !settings.repo) {
        setupBanner.classList.remove('hidden');
        mainContent.classList.add('hidden');
    } else {
        setupBanner.classList.add('hidden');
        mainContent.classList.remove('hidden');
    }
}

// ===== Settings =====
function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

function saveSettings_() {
    const token = ghTokenInput.value.trim();
    const repo = ghRepoInput.value.trim();

    if (!token || !repo) {
        showToast('Token ve repo adı gerekli');
        return;
    }

    settings = { token, repo };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    settingsModal.classList.remove('active');
    updateUI();
    showToast('Ayarlar kaydedildi ✓');

    // Ensure repo exists
    ensureRepo();
}

function openSettings() {
    ghTokenInput.value = settings.token || '';
    ghRepoInput.value = settings.repo || 'mp3-storage';
    settingsModal.classList.add('active');
}

// ===== GitHub API =====
async function ghFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${settings.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    return res;
}

async function getUsername() {
    const res = await ghFetch('/user');
    if (!res.ok) throw new Error('GitHub token geçersiz');
    const data = await res.json();
    return data.login;
}

async function ensureRepo() {
    try {
        const username = await getUsername();
        const res = await ghFetch(`/repos/${username}/${settings.repo}`);
        if (res.status === 404) {
            // Create repo
            const createRes = await ghFetch('/user/repos', {
                method: 'POST',
                body: JSON.stringify({
                    name: settings.repo,
                    description: 'MP3 file hosting via MP3 Host',
                    private: false,
                    auto_init: true,
                }),
            });
            if (!createRes.ok) {
                const err = await createRes.json();
                throw new Error(err.message || 'Repo oluşturulamadı');
            }
            showToast('Repo oluşturuldu ✓');
        }
    } catch (err) {
        showToast('Hata: ' + err.message);
        console.error(err);
    }
}

async function uploadFile(file) {
    const username = await getUsername();
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `uploads/${timestamp}_${safeName}`;

    // Read file as base64
    const base64 = await fileToBase64(file);

    // Upload via GitHub Contents API
    const res = await ghFetch(`/repos/${username}/${settings.repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
            message: `Upload ${file.name}`,
            content: base64,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Yükleme başarısız');
    }

    // Return raw URL
    const rawUrl = `https://raw.githubusercontent.com/${username}/${settings.repo}/main/${path}`;
    return rawUrl;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Remove data:...;base64, prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== Upload Flow =====
async function handleFile(file) {
    if (!file) return;

    // Validate
    if (!file.name.toLowerCase().endsWith('.mp3') && file.type !== 'audio/mpeg') {
        showToast('Sadece MP3 dosyaları kabul edilir');
        return;
    }

    if (file.size > 100 * 1024 * 1024) {
        showToast('Dosya çok büyük (max 100MB)');
        return;
    }

    // Show upload card
    uploadCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    uploadName.textContent = file.name;
    uploadSize.textContent = formatSize(file.size);
    progressFill.style.width = '0%';
    uploadStatus.textContent = 'Yükleniyor...';
    uploadStatus.classList.remove('error');

    // Animate progress (simulated since GitHub API doesn't support progress)
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 85) progress = 85;
        progressFill.style.width = progress + '%';
    }, 200);

    try {
        const url = await uploadFile(file);

        // Complete progress
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        uploadStatus.textContent = 'Tamamlandı!';

        // Show result after brief delay
        setTimeout(() => {
            uploadCard.classList.add('hidden');
            resultCard.classList.remove('hidden');
            resultUrl.value = url;

            // Save to history
            addToHistory(file.name, url, file.size);
        }, 500);

    } catch (err) {
        clearInterval(progressInterval);
        progressFill.style.width = '0%';
        uploadStatus.textContent = 'Hata: ' + err.message;
        uploadStatus.classList.add('error');
        console.error(err);
    }
}

// ===== TTS Flow =====
async function generateTTS() {
    const text = ttsText.value.trim();
    if (!text) {
        showToast('Lütfen sese çevrilecek bir metin yazın');
        return;
    }

    // Determine reference audio
    const isCustom = radioCustom.checked;
    let audioPromptParams;

    if (isCustom) {
        if (!customTtsFile) {
            showToast('Lütfen referans bir ses dosyası seçin');
            return;
        }
        audioPromptParams = customTtsFile;
    } else {
        // Use default URL but we need it as a Blob to pass to Gradio handles
        try {
            audioPromptParams = DEFAULT_REF_URL;
        } catch (e) {
            showToast('Varsayılan ses yüklenemedi');
            return;
        }
    }

    // Show Progress
    generateTtsBtn.disabled = true;
    ttsResultArea.classList.add('hidden');
    ttsProgressCard.classList.remove('hidden');
    ttsStatus.textContent = "HuggingFace API'sine bağlanılıyor...";
    ttsStatus.classList.remove('error');
    ttsProgressFill.style.width = '30%';

    try {
        const { Client } = window.gradio_client;

        let client;
        try {
            client = await Client.connect("ResembleAI/Chatterbox-Multilingual-TTS");
        } catch (err) {
            throw new Error("API'ye bağlanılamadı. HuggingFace kapalı olabilir.");
        }

        ttsStatus.textContent = "Ses üretiliyor...";
        ttsProgressFill.style.width = '70%';

        // Gradio requires files to be passed directly or as Blobs/URLs
        // Fortunately, the handle_file from Gradio client supports File objects directly
        const audioPromptInput = isCustom ? customTtsFile : await (await fetch(DEFAULT_REF_URL)).blob();

        const result = await client.predict("/generate_tts_audio", {
            text_input: text,
            language_id: "tr",
            audio_prompt_path_input: audioPromptInput,
            exaggeration_input: 0.5,
            temperature_input: 0.8,
            seed_num_input: 0,
            cfgw_input: 0.5
        });

        // result is normally {"url": "blob:..."} or {"data": "..."} depending on the API output
        ttsProgressFill.style.width = '100%';
        ttsStatus.textContent = "Tamamlandı!";

        // Get the audio from the predictive result array or object
        // For audio output, Gradio usually returns {"url": "...", ...} or just an object with 'url'
        let audioUrl = result.url || (result.data ? result.data[0].url : null);

        // If it's a direct response string (blob url)
        if (typeof result === 'string') {
            audioUrl = result;
        } else if (result.value) { // some gradio client versions
            audioUrl = result.value.url;
        } else if (Array.isArray(result) && result[0]) {
            audioUrl = typeof result[0] === 'object' ? result[0].url : result[0];
        }

        if (!audioUrl) {
            console.log("Raw Result:", result);
            throw new Error("Beklenmeyen API yanıtı");
        }

        // Fetch the generated blob
        const res = await fetch(audioUrl);
        currentTtsBlob = await res.blob();

        const localUrl = URL.createObjectURL(currentTtsBlob);

        ttsAudio.src = localUrl;

        setTimeout(() => {
            ttsProgressCard.classList.add('hidden');
            ttsResultArea.classList.remove('hidden');
            generateTtsBtn.disabled = false;
        }, 500);

    } catch (err) {
        ttsProgressFill.style.width = '0%';
        ttsStatus.textContent = 'Hata: ' + err.message;
        ttsStatus.classList.add('error');
        generateTtsBtn.disabled = false;
        console.error(err);
    }
}

function handleCustomTtsFile(file) {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
        showToast('Sadece ses dosyaları (MP3, WAV) kabul edilir');
        return;
    }
    customTtsFile = file;
    ttsFileName.textContent = file.name;
    ttsFileName.classList.remove('hidden');
}

// ===== History =====
function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
        return [];
    }
}

function saveHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function addToHistory(name, url, size) {
    history.unshift({
        name,
        url,
        size,
        date: new Date().toISOString(),
    });
    // Keep last 50
    if (history.length > 50) history = history.slice(0, 50);
    saveHistory();
    renderHistory();
}

function removeFromHistory(index) {
    history.splice(index, 1);
    saveHistory();
    renderHistory();
}

function renderHistory() {
    if (history.length === 0) {
        historySection.classList.add('hidden');
        return;
    }

    historySection.classList.remove('hidden');
    historyList.innerHTML = history.map((item, i) => `
        <div class="history-item">
            <div class="history-item-icon">🎵</div>
            <div class="history-item-info">
                <div class="history-item-name">${escapeHtml(item.name)}</div>
                <div class="history-item-date">${formatDate(item.date)} · ${formatSize(item.size)}</div>
            </div>
            <div class="history-item-actions">
                <button class="btn-icon" onclick="copyUrl('${escapeAttr(item.url)}')" title="URL Kopyala">📋</button>
                <button class="btn-icon" onclick="window.open('${escapeAttr(item.url)}', '_blank')" title="Aç">🔗</button>
                <button class="btn-icon delete" onclick="removeFromHistory(${i})" title="Sil">✕</button>
            </div>
        </div>
    `).join('');
}

// ===== Utility =====
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showToast(message) {
    // Remove existing
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function copyUrl(url) {
    try {
        await navigator.clipboard.writeText(url);
        showToast('URL kopyalandı ✓');
    } catch {
        // Fallback
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        showToast('URL kopyalandı ✓');
    }
}

// ===== Event Bindings =====
function bindEvents() {
    // Settings
    settingsBtn.addEventListener('click', openSettings);
    setupBtn.addEventListener('click', openSettings);
    closeModal.addEventListener('click', () => settingsModal.classList.remove('active'));
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove('active');
    });
    saveSettingsBtn.addEventListener('click', saveSettings_);

    // Drag & Drop
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        handleFile(file);
        fileInput.value = ''; // Reset
    });

    // Result actions
    copyBtn.addEventListener('click', async () => {
        await copyUrl(resultUrl.value);
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 2000);
    });

    openUrlBtn.addEventListener('click', () => {
        window.open(resultUrl.value, '_blank');
    });

    uploadAnotherBtn.addEventListener('click', () => {
        resultCard.classList.add('hidden');
        uploadCard.classList.add('hidden');
    });

    // ===== TTS Events =====

    // Tabs Navigation
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // Ref Source Toggle
    document.querySelectorAll('input[name="refType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customRefArea.classList.remove('hidden');
            } else {
                customRefArea.classList.add('hidden');
            }
        });
    });

    // Custom TTS Audio File Drop
    ttsDropZone.addEventListener('click', () => ttsFileInput.click());

    ttsDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        ttsDropZone.classList.add('dragover');
    });

    ttsDropZone.addEventListener('dragleave', () => ttsDropZone.classList.remove('dragover'));

    ttsDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        ttsDropZone.classList.remove('dragover');
        handleCustomTtsFile(e.dataTransfer.files[0]);
    });

    ttsFileInput.addEventListener('change', (e) => {
        handleCustomTtsFile(e.target.files[0]);
    });

    // Generate Button
    generateTtsBtn.addEventListener('click', generateTTS);

    // Download TTS Audio
    downloadTtsBtn.addEventListener('click', () => {
        if (!currentTtsBlob) return;
        const url = URL.createObjectURL(currentTtsBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TTS_${new Date().getTime()}.wav`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Save generated TTS to MP3 Storage
    saveTtsAsMp3Btn.addEventListener('click', () => {
        if (!currentTtsBlob) return;

        // Go back to upload tab
        tabBtns[0].click();

        // Fake a File object and send to the main upload flow
        const f = new File([currentTtsBlob], `TTS_${new Date().getTime()}.wav`, { type: 'audio/wav' });
        handleFile(f);
    });
}

// ===== Start =====
init();
