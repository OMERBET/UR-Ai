import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = true;
env.useBrowserCache = true;

let model = null;
let modelLoaded = false;
let currentFiles = [];
let fileContents = {};
let conversations = [];

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const filesList = document.getElementById('filesList');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.js';

async function loadModel() {
    try {
        statusText.innerText = 'جاري تحميل النموذج... (قد يستغرق دقيقة)';
        
        model = await pipeline('text-generation', 'onnx-community/SmolLM2-135M-Instruct', {
            device: 'webgpu',
            dtype: 'q4'
        });
        
        modelLoaded = true;
        statusDot.classList.add('loaded');
        statusText.innerText = 'النموذج جاهز ✅';
        addAIMessage('النموذج جاهز! يمكنك الآن رفع الملفات وسؤالي عنها.');
        
    } catch (error) {
        console.error('خطأ:', error);
        statusText.innerText = 'خطأ في التحميل - حاول تحديث الصفحة';
        addAIMessage('⚠️ حدث خطأ في تحميل النموذج. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
    }
}

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#FFB347';
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'rgba(255, 180, 71, 0.3)';
});
uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'rgba(255, 180, 71, 0.3)';
    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
});

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    await processFiles(files);
    fileInput.value = '';
});

async function processFiles(files) {
    for (const file of files) {
        if (!file.type.includes('pdf') && !file.type.includes('image')) {
            addAIMessage(`⚠️ نوع الملف ${file.name} غير مدعوم.`);
            continue;
        }
        
        addAIMessage(`📄 جاري معالجة: ${file.name}...`);
        
        try {
            let extractedText = '';
            
            if (file.type.includes('pdf')) {
                extractedText = await extractPDFText(file);
            } else if (file.type.includes('image')) {
                extractedText = await extractImageText(file);
            }
            
            if (extractedText && extractedText.trim().length > 0) {
                currentFiles.push({
                    id: Date.now() + Math.random(),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: extractedText
                });
                fileContents[file.name] = extractedText;
                addAIMessage(`✅ تم معالجة ${file.name} بنجاح! (${extractedText.length} حرف)`);
            } else {
                addAIMessage(`⚠️ لم يتم استخراج نص من ${file.name}.`);
            }
            
        } catch (error) {
            addAIMessage(`❌ خطأ في معالجة ${file.name}: ${error.message}`);
        }
    }
    updateFilesList();
}

async function extractPDFText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const typedarray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function extractImageText(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            resolve(`[صورة: ${file.name}] تحتوي على محتوى مرئي. يمكنك وصف ما تراه وسأحاول مساعدتك.`);
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}

function updateFilesList() {
    if (currentFiles.length === 0) {
        filesList.innerHTML = `<div style="text-align:center;color:#aaa;padding:20px;"><i class="fas fa-inbox"></i><p>لا توجد ملفات مرفوعة</p></div>`;
        return;
    }
    
    filesList.innerHTML = currentFiles.map(file => `
        <div class="file-item" data-file="${file.name}">
            <div class="file-icon"><i class="fas ${file.type.includes('pdf') ? 'fa-file-pdf' : 'fa-file-image'}"></i></div>
            <div class="file-info">
                <div class="file-name">${file.name.substring(0, 30)}${file.name.length > 30 ? '...' : ''}</div>
                <div class="file-size">${(file.size / 1024).toFixed(1)} KB</div>
            </div>
            <button class="delete-file" data-name="${file.name}"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
    
    document.querySelectorAll('.delete-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileName = btn.dataset.name;
            currentFiles = currentFiles.filter(f => f.name !== fileName);
            delete fileContents[fileName];
            updateFilesList();
            addAIMessage(`🗑️ تم حذف: ${fileName}`);
        });
    });
}

function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `<div class="message-avatar"><i class="fas fa-user"></i></div><div class="message-content">${escapeHtml(text)}</div>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    conversations.push({ role: 'user', content: text });
}

function addAIMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.innerHTML = `<div class="message-avatar"><i class="fas fa-robot"></i></div><div class="message-content">${escapeHtml(text)}</div>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    conversations.push({ role: 'assistant', content: text });
}

function addLoadingMessage() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = 'loadingMessage';
    loadingDiv.innerHTML = `<div class="message-avatar"><i class="fas fa-robot"></i></div><div class="loading-indicator"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>`;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return loadingDiv;
}

function removeLoadingMessage(loadingDiv) {
    if (loadingDiv && loadingDiv.remove) loadingDiv.remove();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function buildContextFromFiles() {
    if (currentFiles.length === 0) return '';
    let context = 'المستندات المتاحة:\n';
    for (const file of currentFiles) {
        context += `\n--- ملف: ${file.name} ---\n${file.content.substring(0, 2000)}\n`;
    }
    return context;
}

async function generateResponse(userMessage) {
    if (!modelLoaded) return "⚠️ النموذج لا يزال قيد التحميل...";
    
    try {
        const context = buildContextFromFiles();
        let prompt = context ? `${context}\n\nسؤال المستخدم: ${userMessage}\n\nالإجابة:` : `سؤال: ${userMessage}\n\nالإجابة:`;
        
        const response = await model(prompt, {
            max_new_tokens: 512,
            temperature: 0.7,
            top_p: 0.9
        });
        
        let generated = response[0]?.generated_text || '';
        let answer = generated.replace(prompt, '').trim();
        return answer || "عذراً، لم أستطع توليد رد. حاول مرة أخرى.";
        
    } catch (error) {
        return `حدث خطأ: ${error.message}`;
    }
}

async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    chatInput.value = '';
    addUserMessage(message);
    
    const loadingDiv = addLoadingMessage();
    const response = await generateResponse(message);
    removeLoadingMessage(loadingDiv);
    addAIMessage(response);
}

sendBtn.addEventListener('click', handleSendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});

chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

loadModel();
