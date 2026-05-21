/**
 * CreatorlyAI Chatbot & Strategy Assistant
 * Floating trigger, side panel / bottom sheet drawer, and SSE text streaming.
 */

(function () {
  // Styles configuration
  const cssStyles = `
    /* Floating button & Panel Styles */
    .creatorly-chat-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #a855f7, #6366f1);
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 10px 25px -5px rgba(168, 85, 247, 0.4), 0 8px 10px -6px rgba(99, 102, 241, 0.4);
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .creatorly-chat-trigger:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 20px 25px -5px rgba(168, 85, 247, 0.5), 0 10px 10px -5px rgba(99, 102, 241, 0.5);
    }
    .creatorly-chat-trigger:active {
      transform: translateY(0) scale(0.98);
    }

    .creatorly-chat-panel {
      position: fixed;
      z-index: 10000;
      background: rgba(15, 12, 30, 0.95);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: -10px 0 50px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      font-family: 'Inter', sans-serif;
      overflow: hidden;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
      opacity: 0;
      pointer-events: none;
    }

    /* Desktop View Panel (Right Sidebar) */
    @media (min-width: 768px) {
      .creatorly-chat-panel {
        top: 0;
        right: 0;
        width: 420px;
        height: 100%;
        transform: translateX(100%);
        border-radius: 16px 0 0 16px;
      }
      .creatorly-chat-panel.expanded {
        transform: translateX(0);
        opacity: 1;
        pointer-events: auto;
      }
    }

    /* Mobile View Panel (Bottom Sheet) */
    @media (max-width: 767px) {
      .creatorly-chat-panel {
        bottom: 0;
        left: 0;
        width: 100%;
        height: 50vh;
        transform: translateY(100%);
        border-radius: 20px 20px 0 0;
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
      }
      .creatorly-chat-panel.expanded {
        transform: translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
    }

    /* Drag Handle for Mobile bottom sheet */
    .creatorly-chat-drag-handle {
      display: none;
      width: 100%;
      height: 24px;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
    }
    .creatorly-chat-drag-handle::after {
      content: '';
      width: 40px;
      height: 4px;
      background: rgba(255, 255, 255, 0.25);
      border-radius: 99px;
    }
    @media (max-width: 767px) {
      .creatorly-chat-drag-handle {
        display: flex;
      }
    }

    /* Chat Elements Layout */
    .creatorly-chat-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.01);
    }
    .creatorly-chat-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .creatorly-chat-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #a855f7, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      color: #fff;
    }
    .creatorly-chat-header-text h4 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #f8fafc;
    }
    .creatorly-chat-header-text span {
      font-size: 11px;
      color: #94a3b8;
    }
    .creatorly-chat-header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .creatorly-chat-btn-clear {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 11px;
      cursor: pointer;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .creatorly-chat-btn-clear:hover {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.08);
    }
    .creatorly-chat-btn-close {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
      transition: color 0.2s;
    }
    .creatorly-chat-btn-close:hover {
      color: #f8fafc;
    }

    .creatorly-chat-messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      scroll-behavior: smooth;
    }
    .creatorly-chat-messages-container::-webkit-scrollbar {
      width: 5px;
    }
    .creatorly-chat-messages-container::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 99px;
    }

    /* Message Bubbles */
    .creatorly-msg-row {
      display: flex;
      width: 100%;
      margin-bottom: 2px;
    }
    .creatorly-msg-row.user {
      justify-content: flex-end;
    }
    .creatorly-msg-row.assistant {
      justify-content: flex-start;
      gap: 10px;
    }
    .creatorly-msg-bubble {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 13.5px;
      line-height: 1.5;
      word-wrap: break-word;
      font-weight: 400;
    }
    .creatorly-msg-row.user .creatorly-msg-bubble {
      background: #4f46e5;
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }
    .creatorly-msg-row.assistant .creatorly-msg-bubble {
      background: rgba(255, 255, 255, 0.05);
      color: #e2e8f0;
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }
    
    .creatorly-msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #a855f7, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #fff;
      flex-shrink: 0;
    }

    /* Greeting State & suggested prompt chips */
    .creatorly-chat-greeting {
      padding: 10px 0;
      text-align: center;
      color: #94a3b8;
    }
    .creatorly-chat-greeting-title {
      font-size: 16px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 6px;
    }
    .creatorly-chat-greeting-desc {
      font-size: 12px;
      margin-bottom: 20px;
      line-height: 1.4;
      padding: 0 20px;
    }
    .creatorly-chat-chips-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 0 10px;
    }
    .creatorly-chat-chip {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 12.5px;
      color: #cbd5e1;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
    }
    .creatorly-chat-chip:hover {
      background: rgba(168, 85, 247, 0.08);
      border-color: rgba(168, 85, 247, 0.4);
      color: #f8fafc;
      transform: translateY(-1px);
    }
    .creatorly-chat-chip:active {
      transform: translateY(0);
    }

    /* Inline Data Card Widgets */
    .creatorly-inline-card {
      margin-top: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 14px;
      color: #f8fafc;
      font-family: 'Inter', sans-serif;
    }
    .creatorly-inline-card-header {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .creatorly-inline-card-value {
      font-size: 20px;
      font-weight: 800;
      color: #22c55e;
      margin-bottom: 6px;
    }
    .creatorly-inline-card-bar-bg {
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .creatorly-inline-card-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #a855f7, #6366f1);
      border-radius: 99px;
    }
    .creatorly-inline-card-benchmark {
      font-size: 11px;
      color: #94a3b8;
    }

    /* Follow-up Quick Reply Chips */
    .creatorly-chat-quickreplies {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 4px 0 10px 38px;
    }
    .creatorly-quick-chip {
      background: rgba(168, 85, 247, 0.06);
      border: 1px solid rgba(168, 85, 247, 0.2);
      border-radius: 99px;
      padding: 6px 12px;
      font-size: 11.5px;
      color: #c084fc;
      cursor: pointer;
      transition: all 0.2s;
    }
    .creatorly-quick-chip:hover {
      background: rgba(168, 85, 247, 0.15);
      border-color: rgba(168, 85, 247, 0.4);
      color: #f8fafc;
    }

    /* Input Area */
    .creatorly-chat-input-area {
      padding: 16px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.005);
    }
    .creatorly-chat-input-form {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .creatorly-chat-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 13.5px;
      color: #f8fafc;
      outline: none;
      transition: border-color 0.2s, background 0.2s;
    }
    .creatorly-chat-input:focus {
      border-color: rgba(168, 85, 247, 0.5);
      background: rgba(255, 255, 255, 0.06);
    }
    .creatorly-chat-input::placeholder {
      color: #64748b;
    }
    .creatorly-chat-btn-send {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #a855f7, #6366f1);
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .creatorly-chat-btn-send:hover {
      transform: scale(1.03);
    }
    .creatorly-chat-btn-send:disabled {
      background: rgba(255, 255, 255, 0.05);
      color: #64748b;
      cursor: not-allowed;
      transform: none;
    }

    /* Typist effect container styling */
    .creatorly-streaming-cursor {
      display: inline-block;
      width: 2px;
      height: 14px;
      background: var(--accent2);
      margin-left: 2px;
      animation: creatorly-cursor-blink 1s infinite;
    }
    @keyframes creatorly-cursor-blink {
      0%, 100% { opacity: 0; }
      50% { opacity: 1; }
    }
  `;

  // Declaring elements in IIFE scope
  let triggerBtn, chatPanel, messagesContainer, chatForm, chatInput, chatSendBtn, chatClearBtn, chatCloseBtn, dragHandle;
  let isDragging = false;
  let dragStartY = 0;
  let dragStartHeight = 0;

  // Safe storage utility to prevent crashes in private mode or if storage is blocked
  const storage = {
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.warn('Storage read blocked/failed:', e);
        return null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('Storage write blocked/failed:', e);
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn('Storage remove blocked/failed:', e);
      }
    }
  };

  // Safe parse function
  function safeParseHistory() {
    try {
      const val = storage.getItem('creatorly_chatbot_history');
      if (val) {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse chatbot history:', e);
    }
    return [];
  }

  // Initialize Chatbot global state
  const state = {
    isExpanded: false,
    messages: safeParseHistory(),
  };

  // Helper: Get cached creator profile
  function getCreatorProfile() {
    try {
      const data = storage.getItem('creatorly_last_profile');
      return data ? JSON.parse(data) : null;
    } catch (_) {
      return null;
    }
  }

  // Toggle Minimize/Expand handlers
  function togglePanel(open = null) {
    if (!chatPanel || !triggerBtn || !chatInput) return;
    const shouldOpen = open !== null ? open : !state.isExpanded;
    state.isExpanded = shouldOpen;
    
    if (shouldOpen) {
      chatPanel.classList.add('expanded');
      triggerBtn.classList.add('hidden');
      if (state.messages.length === 0) {
        showFirstTimeGreeting();
      } else {
        renderAllMessages();
      }
      setTimeout(() => chatInput.focus(), 300);
    } else {
      chatPanel.classList.remove('expanded');
      triggerBtn.classList.remove('hidden');
      chatPanel.style.height = '';
    }
  }

  // Initialize and inject DOM elements safely
  function initChatbot() {
    console.log("[CreatorlyAI Chatbot] Initializing chatbot DOM components...");
    if (document.getElementById('creatorlyChatTrigger')) {
      console.log("[CreatorlyAI Chatbot] Chatbot trigger already exists. Skipping init.");
      return; // Avoid double init
    }

    const body = document.body;
    const head = document.head;
    if (!body || !head) {
      console.warn("[CreatorlyAI Chatbot] document.body or document.head is missing!");
      return;
    }

    // Inject Custom Styles
    const styleEl = document.createElement('style');
    styleEl.textContent = cssStyles;
    head.appendChild(styleEl);

    // Create & Inject Floating Button + Panel
    triggerBtn = document.createElement('button');
    triggerBtn.className = 'creatorly-chat-trigger animate-pulse';
    triggerBtn.id = 'creatorlyChatTrigger';
    triggerBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span>Ask CreatorlyAI</span>
    `;
    body.appendChild(triggerBtn);

    chatPanel = document.createElement('div');
    chatPanel.className = 'creatorly-chat-panel';
    chatPanel.id = 'creatorlyChatPanel';
    chatPanel.innerHTML = `
      <!-- Drag Handle (Mobile) -->
      <div class="creatorly-chat-drag-handle" id="creatorlyChatDragHandle"></div>
      
      <!-- Header -->
      <div class="creatorly-chat-header">
        <div class="creatorly-chat-title-group">
          <div class="creatorly-chat-avatar">🤖</div>
          <div class="creatorly-chat-header-text">
            <h4>CreatorlyAI Strategist</h4>
            <span>Instagram Growth Advisor</span>
          </div>
        </div>
        <div class="creatorly-chat-header-actions">
          <button class="creatorly-chat-btn-clear" id="creatorlyChatClearBtn">Clear Chat</button>
          <button class="creatorly-chat-btn-close" id="creatorlyChatCloseBtn" aria-label="Close">✕</button>
        </div>
      </div>

      <!-- Messages Area -->
      <div class="creatorly-chat-messages-container" id="creatorlyChatMessages"></div>

      <!-- Input Area -->
      <div class="creatorly-chat-input-area">
        <form class="creatorly-chat-input-form" id="creatorlyChatForm">
          <input type="text" class="creatorly-chat-input" id="creatorlyChatInput" placeholder="Ask about hooks, rates, captions..." autocomplete="off" />
          <button type="submit" class="creatorly-chat-btn-send" id="creatorlyChatSendBtn" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>
    `;
    body.appendChild(chatPanel);
    console.log("[CreatorlyAI Chatbot] Chatbot DOM components appended to body successfully!");

    messagesContainer = document.getElementById('creatorlyChatMessages');
    chatForm = document.getElementById('creatorlyChatForm');
    chatInput = document.getElementById('creatorlyChatInput');
    chatSendBtn = document.getElementById('creatorlyChatSendBtn');
    chatClearBtn = document.getElementById('creatorlyChatClearBtn');
    chatCloseBtn = document.getElementById('creatorlyChatCloseBtn');
    dragHandle = document.getElementById('creatorlyChatDragHandle');

    // Input state observer
    chatInput.addEventListener('input', () => {
      chatSendBtn.disabled = !chatInput.value.trim();
    });

    triggerBtn.addEventListener('click', () => togglePanel(true));
    chatCloseBtn.addEventListener('click', () => togglePanel(false));

    // Minimize on click outside the panel
    document.addEventListener('click', (e) => {
      if (state.isExpanded && 
          !chatPanel.contains(e.target) && 
          !triggerBtn.contains(e.target) &&
          !e.target.closest('#askAiErBtn') &&
          !e.target.closest('#askAiRateBtn') &&
          !e.target.closest('.ask-ai-trigger-btn')) {
        togglePanel(false);
      }
    });

    // Mobile Bottom Sheet Drag Gestures
    dragHandle.addEventListener('pointerdown', (e) => {
      dragStartY = e.clientY;
      dragStartHeight = chatPanel.getBoundingClientRect().height;
      isDragging = true;
      chatPanel.style.transition = 'none';
      chatPanel.setPointerCapture(e.pointerId);
    });

    dragHandle.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaY = e.clientY - dragStartY;
      const newHeight = dragStartHeight - deltaY;
      const viewportHeight = window.innerHeight;
      const minHeight = viewportHeight * 0.25;
      const maxHeight = viewportHeight * 0.95;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        chatPanel.style.height = `${newHeight}px`;
      }
    });

    dragHandle.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      chatPanel.style.transition = '';
      chatPanel.releasePointerCapture(e.pointerId);

      const currentHeight = chatPanel.getBoundingClientRect().height;
      const viewportHeight = window.innerHeight;

      if (currentHeight > viewportHeight * 0.75) {
        chatPanel.style.height = '95vh';
      } else if (currentHeight < viewportHeight * 0.35) {
        togglePanel(false);
      } else {
        chatPanel.style.height = '50vh';
      }
    });

    // Wiping Chat history
    chatClearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear your strategy chat history?')) {
        state.messages = [];
        storage.removeItem('creatorly_chatbot_history');
        showFirstTimeGreeting();
      }
    });

    // Form submit listener
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const prompt = chatInput.value.trim();
      if (!prompt) return;

      chatInput.value = '';
      chatSendBtn.disabled = true;

      sendPromptMessage(prompt);
    });
  }

  // Load handler to wait for document body
  console.log("[CreatorlyAI Chatbot] Current document readystate:", document.readyState);
  if (document.readyState === 'loading') {
    console.log("[CreatorlyAI Chatbot] Document is loading, waiting for DOMContentLoaded event...");
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    console.log("[CreatorlyAI Chatbot] Document is already interactive/complete. Initializing immediately...");
    initChatbot();
  }

  // Calculate weakest metric and return targeted suggested prompt chips
  function getWeakestMetricPrompts(p) {
    const defaultPrompts = [
      { text: "Calculate my collab rates based on views & engagement.", label: "Rate Card" },
      { text: "Write high-converting captions matching my niche vibe.", label: "Caption Options" }
    ];

    if (!p) {
      return [
        { text: "What are 3 scroll-stopping hook templates for Reels?", label: "Hook Ideas" },
        { text: "How can I boost my engagement rate past 3%?", label: "Boost ER" },
        ...defaultPrompts
      ];
    }

    // Benchmark targets
    const erRatio = (p.engagementRate || p.erByViews || 0) / 3.0; // Benchmark 3%
    const hookRatio = (p.hookScore || 0) / 6.5; // Benchmark 6.5
    
    // Parse reels per week to a float
    let reelsNum = 0.5;
    if (p.postingFrequency) {
      const match = p.postingFrequency.match(/[\d.]+/);
      if (match) reelsNum = parseFloat(match[0]);
    } else if (p.reelsPerWeek) {
      reelsNum = p.reelsPerWeek;
    }
    const consistencyRatio = reelsNum / 3.0; // Benchmark 3/wk

    const metrics = [
      { key: 'engagement', ratio: erRatio, label: 'Engagement Rate' },
      { key: 'hook', ratio: hookRatio, label: 'Hook Score' },
      { key: 'consistency', ratio: consistencyRatio, label: 'Posting Consistency' }
    ];

    // Find the minimum ratio (weakest metric)
    metrics.sort((a, b) => a.ratio - b.ratio);
    const weakest = metrics[0];

    let customPrompts = [];
    if (weakest.key === 'hook') {
      customPrompts = [
        { text: "My hook score is low. Can you rewrite my latest reel hook to grab retention?", label: "Hook Rewrite" },
        { text: "Give me 3 scroll-stopping hook templates for my niche.", label: "Hook Templates" }
      ];
    } else if (weakest.key === 'engagement') {
      customPrompts = [
        { text: "My engagement is below average. How can I get viewers to comment?", label: "Increase Comments" },
        { text: "What engagement hacks work best for Indian Instagram creators?", label: "ER Strategy" }
      ];
    } else { // consistency
      customPrompts = [
        { text: "I struggle with consistency. Show me a content calendar to post more.", label: "Content Plan" },
        { text: "How can I batch-create reels so I post every 2 days?", label: "Batch Creating" }
      ];
    }

    return [...customPrompts, ...defaultPrompts];
  }

  // Display Greeting state with prompt chips
  function showFirstTimeGreeting() {
    messagesContainer.innerHTML = '';
    const p = getCreatorProfile();
    const prompts = getWeakestMetricPrompts(p);
    
    const name = p ? p.fullName || p.username : 'Creator';
    const weakLabel = p ? `Analyzing your profile metrics, we noticed your weakest link is **${getWeakestMetricPrompts(p)[0].label === 'Hook Rewrite' ? 'Hook Score' : getWeakestMetricPrompts(p)[0].label === 'Increase Comments' ? 'Engagement Rate' : 'Posting Consistency'}**.` : "Ready to plan your next growth move?";

    const greetingHTML = `
      <div class="creatorly-chat-greeting">
        <div class="creatorly-chat-greeting-title">Namaste, ${name}! 👋</div>
        <div class="creatorly-chat-greeting-desc">
          I am CreatorlyAI, your personal Instagram growth strategist. ${weakLabel} Select a prompt below to get tailored recommendations:
        </div>
        <div class="creatorly-chat-chips-grid" id="creatorlyGreetingChips"></div>
      </div>
    `;
    messagesContainer.innerHTML = greetingHTML;

    const chipsContainer = document.getElementById('creatorlyGreetingChips');
    prompts.forEach(pr => {
      const chip = document.createElement('button');
      chip.className = 'creatorly-chat-chip';
      chip.textContent = pr.text;
      chip.addEventListener('click', () => sendPromptMessage(pr.text));
      chipsContainer.appendChild(chip);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Render all messages from history
  function renderAllMessages() {
    messagesContainer.innerHTML = '';
    state.messages.forEach(msg => {
      appendMessageBubble(msg.role, msg.content);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Append a visual message bubble to UI
  function appendMessageBubble(role, content, isStreaming = false) {
    // If it's a first time open and we're showing the greeting block, clear it
    if (messagesContainer.querySelector('.creatorly-chat-greeting')) {
      messagesContainer.innerHTML = '';
    }

    const row = document.createElement('div');
    row.className = `creatorly-msg-row ${role}`;
    
    if (role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'creatorly-msg-avatar';
      avatar.textContent = '🤖';
      row.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'creatorly-msg-bubble';
    
    if (isStreaming) {
      bubble.innerHTML = formatMarkdown(content) + '<span class="creatorly-streaming-cursor"></span>';
    } else {
      bubble.innerHTML = formatMarkdown(content);
      // Append inline visual cards if keywords exist
      appendInlineCards(bubble, content);
    }

    row.appendChild(bubble);
    messagesContainer.appendChild(row);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return bubble;
  }

  // Parse basic bold markdown elements
  function formatMarkdown(text) {
    if (!text) return '';
    // Replace markdown bold **text** with HTML bold
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  // Check text content and dynamically append specific visual metrics cards
  function appendInlineCards(bubble, text) {
    const lowercaseText = text.toLowerCase();
    const p = getCreatorProfile();
    if (!p) return;

    // 1. Engagement Rate Card
    if (lowercaseText.includes('engagement rate') || lowercaseText.includes('engagement') || lowercaseText.includes(' er ')) {
      const erVal = p.engagementRate || p.erByViews || 0;
      const benchmark = p.nicheBenchmark || 3.0;
      const card = document.createElement('div');
      card.className = 'creatorly-inline-card';
      card.innerHTML = `
        <div class="creatorly-inline-card-header">📊 Metric Insight: Engagement Rate</div>
        <div class="creatorly-inline-card-value" style="color: ${erVal >= benchmark ? '#22c55e' : '#f97316'};">${erVal}%</div>
        <div class="creatorly-inline-card-bar-bg">
          <div class="creatorly-inline-card-bar-fill" style="width: ${Math.min((erVal / Math.max(erVal, benchmark)) * 100, 100)}%;"></div>
        </div>
        <div class="creatorly-inline-card-benchmark">Your ER vs Niche Average (${benchmark}%)</div>
      `;
      bubble.appendChild(card);
    }

    // 2. Hook Score Card
    if (lowercaseText.includes('hook score') || lowercaseText.includes(' hook ') || lowercaseText.includes('hooks')) {
      const score = p.hookScore || 7.0;
      const card = document.createElement('div');
      card.className = 'creatorly-inline-card';
      card.innerHTML = `
        <div class="creatorly-inline-card-header">🪝 Content Rating: Hook Score</div>
        <div class="creatorly-inline-card-value" style="color: ${score >= 7.5 ? '#22c55e' : score >= 5.5 ? '#eab308' : '#ef4444'};">${score}/10</div>
        <div class="creatorly-inline-card-bar-bg">
          <div class="creatorly-inline-card-bar-fill" style="width: ${score * 10}%; background: ${score >= 7.5 ? '#22c55e' : score >= 5.5 ? '#eab308' : '#ef4444'};"></div>
        </div>
        <div class="creatorly-inline-card-benchmark">Based on visual timing and retention markers</div>
      `;
      bubble.appendChild(card);
    }

    // 3. Consistency Card
    if (lowercaseText.includes('consistency') || lowercaseText.includes('posting frequency') || lowercaseText.includes('frequency')) {
      let reelsNum = p.reelsPerWeek || 0;
      if (!reelsNum && p.postingFrequency) {
        const match = p.postingFrequency.match(/[\d.]+/);
        if (match) reelsNum = parseFloat(match[0]);
      }
      
      const card = document.createElement('div');
      card.className = 'creatorly-inline-card';
      card.innerHTML = `
        <div class="creatorly-inline-card-header">📅 Publishing Consistency</div>
        <div class="creatorly-inline-card-value" style="color: ${reelsNum >= 3 ? '#22c55e' : '#eab308'};">${reelsNum >= 1 ? reelsNum.toFixed(1) + ' reels/wk' : 'Inactive'}</div>
        <div class="creatorly-inline-card-benchmark">Niche Benchmark Recommendation: 3.0 per week</div>
      `;
      bubble.appendChild(card);
    }

    // 4. Brand Sponsorship Rates Card
    if (lowercaseText.includes('brand rates') || lowercaseText.includes('collab rate') || lowercaseText.includes('sponsorship') || lowercaseText.includes(' rate ')) {
      let minRate = Math.round(p.avgViews * 0.12 + (p.followersCount * (p.erByViews / 100)) * 1.0);
      let maxRate = Math.round(p.avgViews * 0.30 + (p.followersCount * (p.erByViews / 100)) * 2.5);
      
      if (minRate < 1000) minRate = 1000;
      if (maxRate < 2000) maxRate = 2000;

      const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
      };
      const rangeText = `${formatCurrency(minRate)} - ${formatCurrency(maxRate)}`;

      const card = document.createElement('div');
      card.className = 'creatorly-inline-card';
      card.innerHTML = `
        <div class="creatorly-inline-card-header">💳 Collaboration Valuation Range</div>
        <div class="creatorly-inline-card-value">${rangeText}</div>
        <div class="creatorly-inline-card-benchmark">Valuation based on ER (${p.erByViews || p.engagementRate}%) & views (${p.avgViews})</div>
      `;
      bubble.appendChild(card);
    }
  }

  // Quick reply chip suggestions
  function renderQuickReplies(lastMessageText) {
    // Remove any previous quick replies container
    const oldContainer = document.querySelector('.creatorly-chat-quickreplies');
    if (oldContainer) oldContainer.remove();

    const repliesRow = document.createElement('div');
    repliesRow.className = 'creatorly-chat-quickreplies';

    const lowercaseText = lastMessageText.toLowerCase();
    let choices = ["Analyze my profile.", "Best posting day?"];

    if (lowercaseText.includes('hook') || lowercaseText.includes('retention')) {
      choices = ["Give hook templates.", "Write script intro."];
    } else if (lowercaseText.includes('rates') || lowercaseText.includes('brand') || lowercaseText.includes('collab')) {
      choices = ["How to pitch brands?", "Get negotiation tips."];
    } else if (lowercaseText.includes('caption') || lowercaseText.includes('tags')) {
      choices = ["Trending hashtags?", "Write hook options."];
    } else if (lowercaseText.includes('engagement') || lowercaseText.includes('er')) {
      choices = ["CTA ideas to boost ER.", "Best time to post?"];
    }

    choices.forEach(c => {
      const chip = document.createElement('button');
      chip.className = 'creatorly-quick-chip';
      chip.textContent = c;
      chip.addEventListener('click', () => sendPromptMessage(c));
      repliesRow.appendChild(chip);
    });

    messagesContainer.appendChild(repliesRow);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Trigger submission of a prompt choice
  function sendPromptMessage(promptText) {
    // Remove dynamic replies UI
    const repliesRow = document.querySelector('.creatorly-chat-quickreplies');
    if (repliesRow) repliesRow.remove();

    appendMessageBubble('user', promptText);
    state.messages.push({ role: 'user', content: promptText });
    localStorage.setItem('creatorly_chatbot_history', JSON.stringify(state.messages));
    
    streamAIResponse();
  }



  // Call the Streaming endpoint and read chunks word-by-word
  async function streamAIResponse() {
    const profile = getCreatorProfile();
    const apiPayload = {
      messages: state.messages,
      creatorProfile: profile
    };

    // Prepare container for model reply
    const streamBubble = appendMessageBubble('assistant', '', true);
    let fullResponse = '';

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload)
      });

      if (!response.ok) {
        throw new Error('API server returned error ' + response.status);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        fullResponse += textChunk;
        
        // Update stream bubble HTML using formatted text and scroll
        streamBubble.innerHTML = formatMarkdown(fullResponse) + '<span class="creatorly-streaming-cursor"></span>';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      // Finish streaming layout
      streamBubble.innerHTML = formatMarkdown(fullResponse);
      appendInlineCards(streamBubble, fullResponse);
      
      // Save message in state & storage
      state.messages.push({ role: 'assistant', content: fullResponse });
      localStorage.setItem('creatorly_chatbot_history', JSON.stringify(state.messages));

      // Append quick replies
      renderQuickReplies(fullResponse);

    } catch (err) {
      console.error('Chatbot SSE stream error:', err);
      const errMsg = `I'm having trouble connecting to my strategy brain right now. Please make sure my server key is configured, or try again in a bit. Next action: retry asking or inspect server connections.`;
      streamBubble.innerHTML = errMsg;
      state.messages.push({ role: 'assistant', content: errMsg });
      localStorage.setItem('creatorly_chatbot_history', JSON.stringify(state.messages));
    }
  }

  // Global window helper function for opening the chat pre-loaded with message
  window.openCreatorlyChat = function (message) {
    togglePanel(true);
    sendPromptMessage(message);
  };

})();
