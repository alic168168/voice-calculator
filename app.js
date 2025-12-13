class VoiceCalculator {
    constructor() {
        this.entries = [];
        this.isListening = false;
        this.recognition = null;
        
        // DOM Elements
        this.statusIndicator = document.getElementById('status-indicator');
        this.entriesList = document.getElementById('entries-list');
        this.totalAmountEl = document.getElementById('total-amount');
        this.totalAreaLabel = document.querySelector('.total-label');
        this.micBtn = document.getElementById('mic-btn');
        this.summaryModal = document.getElementById('summary-modal');
        this.modalCount = document.getElementById('modal-count');
        this.modalTotal = document.getElementById('modal-total');
        this.closeModalBtn = document.getElementById('close-modal-btn');
        
        this.initSpeechRecognition();
        this.initListeners();
        this.render();
    }

    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false; // We want to restart listening to update UI smoothly or handle logic
            this.recognition.lang = 'cmn-Hant-TW'; // Traditional Chinese (Taiwan)
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                this.isListening = true;
                this.updateUIState();
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.updateUIState();
                // If user didn't stop it manually, we might want to ensure UI is synced
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.processSpeechInput(transcript);
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                this.statusIndicator.textContent = '錯誤: ' + event.error;
                this.isListening = false;
                this.updateUIState();
            };
        } else {
            alert('您的瀏覽器不支援語音辨識，請使用 Chrome 或 Safari。');
            this.micBtn.disabled = true;
        }
    }

    initListeners() {
        // Mic Button Toggle
        this.micBtn.addEventListener('click', () => {
            if (this.isListening) {
                this.recognition.stop();
            } else {
                this.recognition.start();
            }
        });

        // Close Modal
        this.closeModalBtn.addEventListener('click', () => {
            this.summaryModal.classList.add('hidden');
        });

        // Close modal on outside click
        this.summaryModal.addEventListener('click', (e) => {
            if (e.target === this.summaryModal) {
                this.summaryModal.classList.add('hidden');
            }
        });
    }

    updateUIState() {
        if (this.isListening) {
            this.micBtn.classList.add('listening');
            this.statusIndicator.textContent = '聆聽中...';
            this.statusIndicator.classList.add('listening');
        } else {
            this.micBtn.classList.remove('listening');
            this.statusIndicator.textContent = '點擊麥克風';
            this.statusIndicator.classList.remove('listening');
        }
    }

    processSpeechInput(text) {
        console.log('Received:', text);
        
        // Normalize text
        const cleanText = text.trim();

        // 1. Check for Commands
        if (cleanText.includes('刪除') || cleanText.toLowerCase().includes('delete')) {
            this.deleteLastEntry();
            return;
        }

        if (cleanText.includes('總共多少') || cleanText.includes('多少錢') || cleanText.includes('結算')) {
            this.showSummary();
            return;
        }

        // 2. Parse Numbers
        // Extract all numbers from the string. 
        // Handles: "100 200 500" -> [100, 200, 500]
        // Note: Google Speech API usually gives digits "100" but sometimes chinese "一百". 
        // For MVP we assume digits mostly, but let's try a simple regex for digits first.
        
        // Replace common non-digit separators with space
        const numberString = cleanText.replace(/[^0-9\.]+/g, ' '); 
        const numbers = numberString.trim().split(/\s+/);

        let addedCount = 0;
        numbers.forEach(numStr => {
            if (!numStr) return;
            const val = parseFloat(numStr);
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
            // Automatically restart listening for continuous input experience?
            // For now, let it stop so user can see result, or perhaps restart immediately.
            // Let's rely on user pressing button again for better control, or we can make it loop.
            // Requirement says "I speak 100 120 180" -> implies one sentence. 
            // So one-shot is fine.
        }
    }

    deleteLastEntry() {
        if (this.entries.length > 0) {
            const removed = this.entries.pop();
            this.render();
            this.showFeedback(`已刪除 ${removed.value}`);
        } else {
            this.showFeedback('沒有資料可刪除');
        }
    }

    deleteEntry(id) {
        this.entries = this.entries.filter(e => e.id !== id);
        this.render();
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

    showFeedback(msg) {
        // Simple toast or just update status momentarily
        const originalStatus = this.statusIndicator.textContent;
        this.statusIndicator.textContent = msg;
        setTimeout(() => {
            if (!this.isListening) {
                this.statusIndicator.textContent = '點擊麥克風';
            }
        }, 2000);
    }

    render() {
        this.updateTotal();

        // Clear list
        this.entriesList.innerHTML = '';

        if (this.entries.length === 0) {
            this.entriesList.innerHTML = `
                <div class="empty-state">
                    <p>請按下方按鈕開始說話<br>例如：「100 200 50」</p>
                    <div class="commands-hint">
                        <span>指令：</span>
                        <span class="chip">刪除</span>
                        <span class="chip">總共多少</span>
                    </div>
                </div>
            `;
            return;
        }

        // Render items (newest at bottom? or top? Usually calc is top-down like receipt)
        // Let's do newest at bottom to match "listing" logic, but scroll to bottom.
        
        this.entries.forEach((entry, index) => {
            const el = document.createElement('div');
            el.className = 'entry-item';
            el.innerHTML = `
                <span class="entry-index">#${index + 1}</span>
                <span class="entry-value">${entry.value.toLocaleString()}</span>
                <button class="delete-btn" aria-label="刪除">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            
            // Delete button handler
            el.querySelector('.delete-btn').addEventListener('click', () => {
                this.deleteEntry(entry.id);
            });

            this.entriesList.appendChild(el);
        });

        // Scroll to bottom
        this.entriesList.scrollTop = this.entriesList.scrollHeight;
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    new VoiceCalculator();
});
