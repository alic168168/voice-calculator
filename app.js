class VoiceCalculator {
    constructor() {
        this.entries = [];
        this.isListening = false;
        this.recognition = null;

        // Timers
        this.transcriptTimeout = null;
        this.forceFinalizeTimer = null;
        this.restartTimer = null;
        this.inactivityTimer = null; // Auto-stop timer

        // Config
        this.autoStopMinutes = 3; // Default 3 mins

        // DOM Elements
        this.statusIndicator = document.getElementById('status-indicator');
        this.settingsBtn = document.getElementById('btn-settings'); // New Settings Button
        this.entriesList = document.getElementById('entries-list');
        this.totalAmountEl = document.getElementById('total-amount');
        this.totalAreaLabel = document.querySelector('.total-label');
        this.micBtn = document.getElementById('mic-btn');
        this.summaryModal = document.getElementById('summary-modal');
        this.modalCount = document.getElementById('modal-count');
        this.modalTotal = document.getElementById('modal-total');
        this.closeModalBtn = document.getElementById('close-modal-btn');
        this.liveTranscript = document.getElementById('live-transcript');

        // Buttons
        this.btnDelete = document.getElementById('btn-delete');
        this.btnSummary = document.getElementById('btn-summary');
        this.btnClear = document.getElementById('btn-clear-all');

        this.initSpeechRecognition();
        this.initListeners();
        this.render();
    }

    resetInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);

        if (this.isListening) {
            const ms = this.autoStopMinutes * 60 * 1000;
            this.inactivityTimer = setTimeout(() => {
                console.log('Inactivity timeout reached.');
                this.isListening = false;
                this.recognition.stop();
                this.updateUIState(false);
                this.statusIndicator.textContent = '閒置已關閉';
                if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
            }, ms);
        }
    }

    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();

            // Continuous=true for smoother session. 
            // We handle "end" events by restarting.
            this.recognition.continuous = true;
            this.recognition.lang = 'cmn-Hant-TW';
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                console.log('Voice Service: Started');
                // Only update UI to listening if we intended to listen
                if (this.isListening) {
                    this.updateUIState(true);
                    if (navigator.vibrate) navigator.vibrate(50);
                    this.resetInactivityTimer();
                }
            };

            this.recognition.onend = () => {
                console.log('Voice Service: Ended');
                // Vital: If we are supposed to be listening, restart immediately.
                if (this.isListening) {
                    console.log('Voice Service: Auto-restarting...');

                    clearTimeout(this.restartTimer);
                    this.restartTimer = setTimeout(() => {
                        try {
                            if (this.isListening) this.recognition.start();
                        } catch (e) {
                            console.error("Restart failed", e);
                        }
                    }, 50); // Minimized delay for continuous input
                } else {
                    this.updateUIState(false);
                }
            };

            this.recognition.onresult = (event) => {
                this.resetInactivityTimer(); // Reset timer on speech
                clearTimeout(this.forceFinalizeTimer);

                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    this.showTranscript(finalTranscript);
                    this.processSpeechInput(finalTranscript);
                }

                if (interimTranscript) {
                    this.showTranscript(interimTranscript);

                    // Force finalize if stuck in interim state for > 0.6s (Balanced mode)
                    this.forceFinalizeTimer = setTimeout(() => {
                        console.log("Force Finalizing:", interimTranscript);
                        this.processSpeechInput(interimTranscript);
                        // Abort to reset the speech buffer, it will auto-restart via onend
                        if (this.isListening) this.recognition.abort();
                    }, 600);
                }
            };

            this.recognition.onerror = (event) => {
                console.log('Voice Service Error:', event.error);

                // Benign errors: 'no-speech' (silence), 'aborted' (manual stop or restart), 'network' (transient)
                if (['no-speech', 'aborted', 'network'].includes(event.error)) {
                    // Ignore these, let onend handle the restart
                    return;
                }

                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    this.isListening = false;
                    this.updateUIState(false);
                    alert('無法存取麥克風。請確認：\n1. 網址開頭是 https\n2. 已允許瀏覽器使用麥克風');
                } else {
                    // Show other errors but try to keep listening if possible
                    this.statusIndicator.textContent = '錯誤: ' + event.error;
                    // We don't stop isListening here, we let onend try to restart.
                }
            };
        } else {
            alert('您的瀏覽器不支援語音辨識，請使用 Chrome (Android) 或 Safari (iOS)。');
            this.micBtn.disabled = true;
        }
    }

    initListeners() {
        // Settings Button Logic
        if (this.settingsBtn) {
            const settingsModal = document.getElementById('settings-modal');
            const saveSettingsBtn = document.getElementById('save-settings-btn');
            const autoStopSelect = document.getElementById('auto-stop-select');

            this.settingsBtn.addEventListener('click', () => {
                // Open modal
                settingsModal.classList.remove('hidden');
                autoStopSelect.value = this.autoStopMinutes;
            });

            saveSettingsBtn.addEventListener('click', () => {
                // Save and close
                const val = parseInt(autoStopSelect.value);
                this.autoStopMinutes = val;
                settingsModal.classList.add('hidden');

                // Feedback
                this.showTranscript(`已設定: ${val} 分鐘`);
                if (this.isListening) this.resetInactivityTimer();
            });

            // Close on click outside
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) settingsModal.classList.add('hidden');
            });
        }

        this.micBtn.addEventListener('click', () => {
            if (navigator.vibrate) navigator.vibrate(30);

            if (this.isListening) {
                // User wants to STOP
                this.isListening = false;
                this.recognition.stop();
                this.updateUIState(false);
                if (this.inactivityTimer) clearTimeout(this.inactivityTimer); // Clear timer
            } else {
                // User wants to START
                this.isListening = true;
                this.statusIndicator.textContent = '啟動中...';

                // Force reset any existing instance
                try { this.recognition.abort(); } catch (e) { }

                setTimeout(() => {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.error("Start failed", e);
                        this.isListening = false;
                        this.updateUIState(false);
                        alert('啟動失敗，請重試');
                    }
                }, 100);
            }
        });

        this.btnDelete.addEventListener('click', () => this.deleteLastEntry());
        this.btnSummary.addEventListener('click', () => this.showSummary());
        this.btnClear.addEventListener('click', () => {
            if (confirm('清空所有數字？')) {
                this.entries = [];
                this.render();
                this.showTranscript('已清空');
            }
        });

        this.closeModalBtn.addEventListener('click', () => this.summaryModal.classList.add('hidden'));
        this.summaryModal.addEventListener('click', (e) => {
            if (e.target === this.summaryModal) this.summaryModal.classList.add('hidden');
        });
    }

    updateUIState(listening, customText) {
        if (listening) {
            this.micBtn.classList.add('listening');
            this.statusIndicator.textContent = customText || '聆聽中...';
            this.statusIndicator.classList.add('listening');
        } else {
            this.micBtn.classList.remove('listening');
            this.statusIndicator.textContent = '點擊麥克風';
            this.statusIndicator.classList.remove('listening');
            this.hideTranscript();
        }
    }

    showTranscript(text) {
        this.liveTranscript.textContent = text;
        this.liveTranscript.classList.remove('hidden');
        if (this.transcriptTimeout) clearTimeout(this.transcriptTimeout);
        this.transcriptTimeout = setTimeout(() => this.hideTranscript(), 2000);
    }

    hideTranscript() {
        this.liveTranscript.classList.add('hidden');
    }

    processSpeechInput(text) {
        let cleanText = text.trim();
        cleanText = cleanText.replace(/,/g, '');
        if (!cleanText) return;

        if (cleanText.includes('刪除') || cleanText.toLowerCase().includes('delete')) {
            this.deleteLastEntry();
            return;
        }
        if (cleanText.includes('總共') || cleanText.includes('多少') || cleanText.includes('結算') || cleanText.includes('買單')) {
            this.showSummary();
            return;
        }

        // Feature: Multiplier "3個300" -> "300 300 300"
        cleanText = cleanText.replace(/([0-9零一二兩三四五六七八九十]+)\s*[個个]\s*([0-9零一二兩三四五六七八九十百千萬]+)/g, (match, qtyStr, amountStr) => {
            const qty = this.parseNumber(qtyStr);
            if (!isNaN(qty) && qty > 0 && qty <= 50) {
                return Array(qty).fill(amountStr).join(' ');
            }
            return match;
        });

        const tokens = cleanText.split(/[^0-9零一二兩三四五六七八九十百千萬\.、]+/);

        let addedCount = 0;
        tokens.forEach(token => {
            if (!token) return;
            let val = this.parseNumber(token);
            if (!isNaN(val)) {
                this.entries.push({
                    id: Date.now() + Math.random(),
                    value: val,
                    timestamp: new Date()
                });
                addedCount++;
            }
        });

        if (addedCount > 0) {
            this.render();
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }

    parseNumber(str) {
        const floatCheck = parseFloat(str);
        if (!isNaN(floatCheck) && !/[零一二兩三四五六七八九十百千萬]/.test(str)) {
            return floatCheck;
        }

        const map = {
            '零': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4,
            '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            '百': 100, '千': 1000, '萬': 10000
        };

        let val = 0;
        let bucket = 0;
        let currentDigitStr = '';

        for (let i = 0; i < str.length; i++) {
            const char = str[i];

            if (/[0-9\.]/.test(char)) {
                currentDigitStr += char;
                continue;
            }

            if (currentDigitStr) {
                bucket = parseFloat(currentDigitStr);
                currentDigitStr = '';
            }

            const num = map[char];
            if (num === undefined) continue;

            if (num >= 10 && ![0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(num)) {
                if (bucket === 0 && char === '十') bucket = 1;

                if (num === 10000) {
                    val = (val + bucket) * 10000;
                    bucket = 0;
                } else {
                    val += bucket * num;
                    bucket = 0;
                }
            } else {
                bucket = num;
            }
        }

        if (currentDigitStr) {
            bucket = parseFloat(currentDigitStr);
        }
        val += bucket;

        return val === 0 ? NaN : val;
    }

    deleteLastEntry() {
        if (this.entries.length > 0) {
            const removed = this.entries.pop();
            this.render();
            this.showTranscript(`已刪除 ${removed.value}`);
        } else {
            this.showTranscript('無資料');
        }
    }

    showSummary() {
        this.updateTotal();
        this.modalCount.textContent = this.entries.length;
        this.modalTotal.textContent = this.calculateTotal().toLocaleString();
        this.summaryModal.classList.remove('hidden');
    }

    calculateTotal() {
        return this.entries.reduce((sum, item) => sum + item.value, 0);
    }

    updateTotal() {
        const total = this.calculateTotal();
        this.totalAmountEl.textContent = total.toLocaleString();
        this.totalAreaLabel.textContent = `總計 (${this.entries.length} 筆)`;
    }

    render() {
        this.updateTotal();
        this.entriesList.innerHTML = '';

        if (this.entries.length === 0) {
            this.entriesList.innerHTML = `
                <div class="empty-state">
                    <p>請按開始說話<br>「一百五 200 300」</p>
                    <div class="commands-hint">
                        <span>提示：可說出多個數字</span>
                    </div>
                </div>
            `;
            return;
        }

        // Render newest first
        [...this.entries].reverse().forEach((entry, index) => {
            const displayIndex = this.entries.length - index;
            const el = document.createElement('div');
            el.className = 'entry-item';
            el.innerHTML = `
                <span class="entry-index">#${displayIndex}</span>
                <span class="entry-value">${entry.value.toLocaleString()}</span>
                <button class="delete-btn" aria-label="刪除">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            el.querySelector('.delete-btn').addEventListener('click', () => {
                this.entries = this.entries.filter(e => e.id !== entry.id);
                this.render();
            });
            this.entriesList.appendChild(el);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new VoiceCalculator();
});
