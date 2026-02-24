/* ══════════════════════════════════════════════════════════
   AI CHATBOT — chatbot.js
   Nexus AI v1.0.0
   Requires: Storage utility (inline in index.html)
══════════════════════════════════════════════════════════ */
(function() {
  const messagesContainer = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const fileInput = document.getElementById('chat-file-input');
  const statusEl = document.getElementById('chat-status');
  const historyList = document.getElementById('chat-history-list');
  const newChatBtn = document.getElementById('new-chat-btn');
  const clearBtn = document.getElementById('chat-clear-btn');
  const imagePreview = document.getElementById('chat-image-preview');
  const imagePreviewName = document.getElementById('chat-image-preview-name');
  const imageRemoveBtn = document.getElementById('chat-image-remove');

  if (!messagesContainer) return;

  const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL = 'llama-3.3-70b-versatile';
  const VISION_MODEL = 'llama-3.2-90b-vision-preview';

  let currentChatId = null;
  let currentImage = null;
  let isProcessing = false;

  /* ── Storage helpers ── */
  function getChatStore() { return Storage.get('chat-store', {}); }
  function saveChatStore(store) { Storage.set('chat-store', store); }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

  function formatTs(ts) {
    const d = new Date(ts), now = new Date(), diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /* ── Key Manager ── */
  class KeyManager {
    constructor() {
      this.keys = Storage.get('groq-api-keys', []);
      this.idx = 0;
    }
    addKey(key) {
      if (!this.keys.find(k => k.key === key)) {
        this.keys.push({ key, active: true, failCount: 0 });
        this.save();
      }
    }
    removeKey(key) {
      this.keys = this.keys.filter(k => k.key !== key);
      this.save();
    }
    getActiveKey() {
      const active = this.keys.filter(k => k.active);
      if (!active.length) throw new Error('No active API keys. Add one in Settings.');
      const k = active[this.idx % active.length];
      this.idx++;
      return k.key;
    }
    markFailed(key) {
      const k = this.keys.find(x => x.key === key);
      if (k) { k.failCount++; if (k.failCount >= 3) k.active = false; this.save(); }
    }
    markOk(key) {
      const k = this.keys.find(x => x.key === key);
      if (k) { k.failCount = 0; k.active = true; this.save(); }
    }
    getAll() { return this.keys; }
    save() {
      Storage.set('groq-api-keys', this.keys);
      if (window.Settings?.renderApiKeys) window.Settings.renderApiKeys();
    }
  }
  const keyManager = new KeyManager();

  /* ── Status ── */
  function setStatus(text, type = 'ready') {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'chat-status';
    if (type === 'thinking') statusEl.classList.add('thinking');
    if (type === 'error') statusEl.classList.add('error');
  }

  /* ── Groq API call ── */
  async function callGroq(messages, imageData = null) {
    const apiKey = keyManager.getActiveKey();
    const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const lastIdx = apiMessages.length - 1;
    if (imageData && lastIdx >= 0) {
      const lastContent = apiMessages[lastIdx].content;
      apiMessages[lastIdx].content = [
        { type: 'text', text: lastContent },
        { type: 'image_url', image_url: { url: imageData } }
      ];
    }
    const resp = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: imageData ? VISION_MODEL : MODEL,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 401 || resp.status === 429) {
        keyManager.markFailed(apiKey);
        throw new Error(resp.status === 401 ? 'Invalid API key.' : 'Rate limit hit. Try another key.');
      }
      throw new Error(err.error?.message || 'API error');
    }
    keyManager.markOk(apiKey);
    const data = await resp.json();
    return data.choices[0].message.content;
  }

  /* ── Message formatting ── */
  function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  function formatMessage(text) {
    return text
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^#{1,3}\s+(.+)$/gm, (_, h) => `<strong style="font-size:1.05em;display:block;margin:0.5em 0 0.25em;">${h}</strong>`)
      .replace(/\n/g, '<br>');
  }

  function createMsgEl(msg) {
    const div = document.createElement('div');
    div.className = `chat-message ${msg.role}`;
    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = msg.role === 'user' ? '👤' : '✦';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (msg.image) {
      const img = document.createElement('img');
      img.src = msg.image;
      img.className = 'chat-image-preview';
      img.alt = 'Attached';
      bubble.appendChild(img);
    }
    const content = document.createElement('div');
    content.className = 'chat-bubble-content';
    content.innerHTML = formatMessage(msg.content);
    const ts = document.createElement('div');
    ts.className = 'chat-timestamp';
    ts.textContent = formatTs(msg.timestamp);
    bubble.appendChild(content);
    bubble.appendChild(ts);
    div.appendChild(avatar);
    div.appendChild(bubble);
    return div;
  }

  function showThinking() {
    const div = document.createElement('div');
    div.className = 'chat-message assistant';
    div.id = 'thinking-indicator';
    const av = document.createElement('div');
    av.className = 'chat-avatar';
    av.textContent = '✦';
    const b = document.createElement('div');
    b.className = 'chat-thinking-bubble';
    b.innerHTML = '<div class="chat-thinking-dots"><div class="chat-thinking-dot"></div><div class="chat-thinking-dot"></div><div class="chat-thinking-dot"></div></div>';
    div.appendChild(av);
    div.appendChild(b);
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function hideThinking() {
    document.getElementById('thinking-indicator')?.remove();
  }

  /* ── Render ── */
  function renderEmpty() {
    // Use the cool hero animation if available, otherwise fall back
    if (window.buildChatHero) {
      window.buildChatHero(messagesContainer, (prompt) => {
        chatInput.value = prompt;
        chatInput.focus();
      });
    } else {
      messagesContainer.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon">✦</div>
          <div class="chat-empty-title">What's on your mind?</div>
          <div class="chat-empty-text">Powered by Groq · llama-3.3-70b · Attach images · Full history</div>
          <div class="chat-suggestions">
            <span class="chat-suggestion" data-prompt="Explain integration by parts with examples">Integration by parts</span>
            <span class="chat-suggestion" data-prompt="Explain laws of thermodynamics for JEE">Thermodynamics laws</span>
            <span class="chat-suggestion" data-prompt="Give me important organic reactions for JEE">Organic reactions</span>
            <span class="chat-suggestion" data-prompt="What are the key concepts in electrostatics?">Electrostatics</span>
          </div>
        </div>
      `;
      messagesContainer.querySelectorAll('.chat-suggestion').forEach(s => {
        s.addEventListener('click', () => { chatInput.value = s.dataset.prompt; chatInput.focus(); });
      });
    }
  }

  function loadChatView(chatId) {
    const store = getChatStore();
    currentChatId = chatId;
    messagesContainer.innerHTML = '';
    const chat = store[chatId];
    if (!chat || chat.messages.length === 0) {
      renderEmpty();
    } else {
      chat.messages.forEach(m => messagesContainer.appendChild(createMsgEl(m)));
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    renderHistory();
  }

  function createNewChat() {
    const id = genId();
    const store = getChatStore();
    store[id] = { id, title: 'New Chat', messages: [], created: Date.now(), updated: Date.now() };
    saveChatStore(store);
    loadChatView(id);
    return id;
  }

  function renderHistory() {
    if (!historyList) return;
    const store = getChatStore();
    const chats = Object.values(store).sort((a, b) => b.updated - a.updated);
    if (chats.length === 0) {
      historyList.innerHTML = '<div class="chat-history-empty">no chats yet</div>';
      return;
    }
    historyList.innerHTML = '';
    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'chat-history-item' + (chat.id === currentChatId ? ' active' : '');
      item.innerHTML = `
        <div class="chat-history-item-icon">💬</div>
        <div class="chat-history-item-body">
          <div class="chat-history-item-title">${escapeHtml(chat.title)}</div>
          <div class="chat-history-item-meta">
            <span>${chat.messages.length} msg${chat.messages.length !== 1 ? 's' : ''}</span>
            <span>${formatTs(chat.updated)}</span>
          </div>
        </div>
        <button class="chat-history-delete" title="Delete chat" data-id="${chat.id}">✕</button>
      `;
      item.addEventListener('click', e => {
        if (!e.target.closest('.chat-history-delete')) loadChatView(chat.id);
      });
      item.querySelector('.chat-history-delete').addEventListener('click', e => {
        e.stopPropagation();
        const store2 = getChatStore();
        delete store2[chat.id];
        saveChatStore(store2);
        if (currentChatId === chat.id) {
          const remaining = Object.keys(store2);
          if (remaining.length) loadChatView(remaining[0]);
          else createNewChat();
        } else {
          renderHistory();
        }
      });
      historyList.appendChild(item);
    });
  }

  /* ── Send message ── */
  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text && !currentImage) return;
    if (isProcessing) return;

    if (!currentChatId) createNewChat();
    const store = getChatStore();
    const chat = store[currentChatId];

    const userMsg = {
      role: 'user',
      content: text || 'Please analyze this image.',
      image: currentImage,
      timestamp: Date.now()
    };
    chat.messages.push(userMsg);
    if (chat.messages.length === 1) chat.title = (text || 'Image').slice(0, 40) || 'New Chat';
    chat.updated = Date.now();
    saveChatStore(store);

    const emptyEl = messagesContainer.querySelector('.chat-empty');
    if (emptyEl) emptyEl.remove();

    messagesContainer.appendChild(createMsgEl(userMsg));
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const imgForApi = currentImage;
    currentImage = null;
    if (imagePreview) imagePreview.style.display = 'none';
    chatInput.value = '';
    chatInput.style.height = 'auto';

    try {
      isProcessing = true;
      if (sendBtn) sendBtn.disabled = true;
      setStatus('Thinking...', 'thinking');
      showThinking();
      renderHistory();

      const response = await callGroq(chat.messages.slice(-20), imgForApi);

      hideThinking();
      const aiMsg = { role: 'assistant', content: response, timestamp: Date.now() };
      chat.messages.push(aiMsg);
      chat.updated = Date.now();
      saveChatStore(store);
      messagesContainer.appendChild(createMsgEl(aiMsg));
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      setStatus('Ready');
      renderHistory();
    } catch (err) {
      console.error(err);
      hideThinking();
      setStatus('Error', 'error');
      const errMsg = {
        role: 'assistant',
        content: `Sorry, I ran into an issue: **${err.message}**\n\nPlease check your API key in Settings (⚙️).`,
        timestamp: Date.now()
      };
      chat.messages.push(errMsg);
      saveChatStore(store);
      messagesContainer.appendChild(createMsgEl(errMsg));
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      setTimeout(() => setStatus('Ready'), 4000);
    } finally {
      isProcessing = false;
      if (sendBtn) sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  /* ── Event listeners ── */
  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 180) + 'px';
  });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (newChatBtn) newChatBtn.addEventListener('click', createNewChat);
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!currentChatId) return;
      if (!confirm('Clear this chat?')) return;
      const store = getChatStore();
      if (store[currentChatId]) {
        store[currentChatId].messages = [];
        store[currentChatId].title = 'New Chat';
        store[currentChatId].updated = Date.now();
        saveChatStore(store);
      }
      renderEmpty();
      renderHistory();
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Please select an image'); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        currentImage = ev.target.result;
        if (imagePreviewName) imagePreviewName.textContent = file.name;
        if (imagePreview) imagePreview.style.display = 'flex';
        chatInput.focus();
      };
      reader.readAsDataURL(file);
    });
  }
  if (imageRemoveBtn) {
    imageRemoveBtn.addEventListener('click', () => {
      currentImage = null;
      if (fileInput) fileInput.value = '';
      if (imagePreview) imagePreview.style.display = 'none';
    });
  }

  /* ── Init ── */
  const store = getChatStore();
  const existing = Object.keys(store);
  if (existing.length) {
    const latest = Object.values(store).sort((a, b) => b.updated - a.updated)[0];
    loadChatView(latest.id);
  } else {
    createNewChat();
  }

  /* ── Public API ── */
  window.ChatBot = { keyManager, createNewChat, renderHistory };
})();
