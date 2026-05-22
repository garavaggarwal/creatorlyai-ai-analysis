/**
 * CreatorlyAI Chatbot & Strategy Assistant
 * Full-screen interface implementation.
 */

(function () {
  const cssStyles = `
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
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 13.5px;
      line-height: 1.5;
      word-wrap: break-word;
      font-weight: 400;
      white-space: pre-wrap;
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

    /* Typist effect container styling */
    .creatorly-streaming-cursor {
      display: inline-block;
      width: 2px;
      height: 14px;
      background: #a855f7;
      margin-left: 2px;
      animation: creatorly-cursor-blink 1s infinite;
    }
    @keyframes creatorly-cursor-blink {
      0%, 100% { opacity: 0; }
      50% { opacity: 1; }
    }

    /* List styling */
    .chat-ul {
      list-style-type: disc;
      padding-left: 20px;
      margin: 8px 0;
    }
    .chat-ol {
      list-style-type: decimal;
      padding-left: 20px;
      margin: 8px 0;
    }
    .chat-ul li, .chat-ol li {
      margin-bottom: 4px;
    }
  `;

  let messagesContainer, chatForm, chatInput, chatSendBtn, chatClearBtn;

  // Safe storage utility
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

  // Check session limit (unlimited for hrithikgarg2017@gmail.com, max 15 for others)
  function checkMessageLimit() {
    const user = typeof getUser === 'function' ? getUser() : null;
    const email = user ? user.email : '';
    const isNoLimitUser = email && email.toLowerCase() === 'hrithikgarg2017@gmail.com';
    const limit = 15;

    const userMessageCount = state.messages.filter(m => m.role === 'user').length;
    if (!isNoLimitUser && userMessageCount >= limit) {
      chatInput.disabled = true;
      chatSendBtn.disabled = true;
      chatInput.placeholder = `Session limit reached (max ${limit} queries). Click 'Clear Chat' to reset.`;
      chatInput.value = "";
      return true;
    } else {
      chatInput.disabled = false;
      chatInput.placeholder = "Ask about hooks, rates, captions...";
      chatSendBtn.disabled = !chatInput.value.trim();
      return false;
    }
  }

  // Initialize and inject styles, mount event handlers
  function initChatbot() {
    console.log("[CreatorlyAI Chatbot] Initializing chatbot...");
    
    messagesContainer = document.getElementById('creatorlyChatMessages');
    chatForm = document.getElementById('creatorlyChatForm');
    chatInput = document.getElementById('creatorlyChatInput');
    chatSendBtn = document.getElementById('creatorlyChatSendBtn');
    chatClearBtn = document.getElementById('creatorlyChatClearBtn');

    if (!messagesContainer || !chatForm || !chatInput || !chatSendBtn) {
      console.error("[CreatorlyAI Chatbot] Required DOM elements not found!");
      return;
    }

    // Inject styles
    const head = document.head;
    if (head) {
      const styleEl = document.createElement('style');
      styleEl.textContent = cssStyles;
      head.appendChild(styleEl);
    }

    // Input state observer
    chatInput.addEventListener('input', () => {
      const user = typeof getUser === 'function' ? getUser() : null;
      const email = user ? user.email : '';
      const isNoLimitUser = email && email.toLowerCase() === 'hrithikgarg2017@gmail.com';
      const limit = 15;
      if (isNoLimitUser || state.messages.filter(m => m.role === 'user').length < limit) {
        chatSendBtn.disabled = !chatInput.value.trim();
      }
    });

    // Wiping Chat history
    if (chatClearBtn) {
      chatClearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your strategy chat history?')) {
          state.messages = [];
          storage.removeItem('creatorly_chatbot_history');
          showFirstTimeGreeting();
          checkMessageLimit();
        }
      });
    }

    // Form submit listener
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const prompt = chatInput.value.trim();
      if (!prompt) return;

      const user = typeof getUser === 'function' ? getUser() : null;
      const email = user ? user.email : '';
      const isNoLimitUser = email && email.toLowerCase() === 'hrithikgarg2017@gmail.com';
      const limit = 15;
      if (!isNoLimitUser && state.messages.filter(m => m.role === 'user').length >= limit) {
        checkMessageLimit();
        return;
      }

      chatInput.value = '';
      chatSendBtn.disabled = true;

      sendPromptMessage(prompt);
    });

    // Initial render
    if (state.messages.length === 0) {
      showFirstTimeGreeting();
    } else {
      renderAllMessages();
    }

    // Mobile Visual Viewport Handling — move input bar when keyboard opens
    const inputBar = document.getElementById('chatInputBar');
    if (window.visualViewport && inputBar) {
      const adjustForKeyboard = () => {
        const vv = window.visualViewport;
        const windowHeight = window.innerHeight;
        const viewportHeight = vv.height;
        const keyboardHeight = windowHeight - viewportHeight - vv.offsetTop;
        
        if (keyboardHeight > 100) {
          // Keyboard is open — lift input bar above keyboard
          document.body.classList.add('keyboard-open');
          inputBar.style.bottom = `${keyboardHeight + Math.max(0, vv.offsetTop)}px`;
          // Adjust messages bottom accordingly
          if (messagesContainer) {
            const inputBarHeight = inputBar.offsetHeight || 68;
            messagesContainer.style.bottom = `${keyboardHeight + inputBarHeight + Math.max(0, vv.offsetTop)}px`;
            setTimeout(() => {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 50);
          }
        } else {
          // Keyboard closed — reset to defaults (CSS handles it)
          document.body.classList.remove('keyboard-open');
          inputBar.style.bottom = '';
          if (messagesContainer) {
            messagesContainer.style.bottom = '';
          }
        }
      };

      window.visualViewport.addEventListener('resize', adjustForKeyboard);
      window.visualViewport.addEventListener('scroll', adjustForKeyboard);
    }

    // Scroll to bottom on focus as well
    chatInput.addEventListener('focus', () => {
      setTimeout(() => {
        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 150);
    });

    // Enforce initial check of query limits
    checkMessageLimit();

    // Focus input
    setTimeout(() => chatInput.focus(), 300);

    // Check for incoming query parameter prompts
    const urlParams = new URLSearchParams(window.location.search);
    const incomingPrompt = urlParams.get('prompt');
    if (incomingPrompt) {
      console.log("[CreatorlyAI Chatbot] Executing incoming query prompt:", incomingPrompt);
      // Clean query string from browser URL to prevent resubmit on refresh
      history.replaceState(null, '', window.location.pathname);
      sendPromptMessage(incomingPrompt);
    }
  }

  // Calculate weakest metric and return targeted suggested prompt chips
  function getWeakestMetricPrompts(p) {
    const defaultPrompts = [
      { text: "Suggest 3 ways to improve my profile's engagement.", label: "Engagement Ideas" },
      { text: "How should I pitch to brand sponsors and determine my brand rates?", label: "Pitching Brands" }
    ];

    if (!p) {
      return [
        { text: "How can I boost my engagement rate past 3%?", label: "Boost ER" },
        { text: "Show me a content calendar to post more consistently.", label: "Content Plan" },
        ...defaultPrompts
      ];
    }

    // Benchmark targets
    const erRatio = (p.engagementRate || p.erByViews || 0) / 3.0; // Benchmark 3%
    
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
      { key: 'consistency', ratio: consistencyRatio, label: 'Posting Consistency' }
    ];

    // Find the minimum ratio (weakest metric)
    metrics.sort((a, b) => a.ratio - b.ratio);
    const weakest = metrics[0];

    let customPrompts = [];
    if (weakest.key === 'engagement') {
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
    let weakLabel = "Ready to plan your next growth move?";
    if (p) {
      const weakestLabel = prompts[0].label;
      const metricName = weakestLabel === 'Increase Comments' ? 'Engagement Rate' : 'Posting Consistency';
      weakLabel = `Analyzing your profile metrics, we noticed your weakest link is **${metricName}**.`;
    }

    const greetingHTML = `
      <div class="creatorly-chat-greeting">
        <div class="creatorly-chat-greeting-title">Namaste, ${name}! 👋</div>
        <div class="creatorly-chat-greeting-desc">
          I am Ask AI, your personal Instagram growth strategist. ${weakLabel} Select a prompt below to get tailored recommendations:
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
      appendInlineCards(bubble, content);
    }

    row.appendChild(bubble);
    messagesContainer.appendChild(row);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return bubble;
  }

  // Parse basic bold markdown and lists
  function formatMarkdown(text) {
    if (!text) return '';
    
    // Simple HTML escape
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold tags
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Lists parsing
    const lines = html.split('\n');
    let inList = false;
    let listType = null; // 'ul' or 'ol'
    const resultLines = [];

    for (let line of lines) {
      const trimmed = line.trim();
      const ulMatch = trimmed.match(/^[\*\-]\s+(.*)$/);
      const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) resultLines.push(`</${listType}>`);
          resultLines.push('<ul class="chat-ul">');
          inList = true;
          listType = 'ul';
        }
        resultLines.push(`<li>${ulMatch[1]}</li>`);
      } else if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) resultLines.push(`</${listType}>`);
          resultLines.push('<ol class="chat-ol">');
          inList = true;
          listType = 'ol';
        }
        resultLines.push(`<li>${olMatch[2]}</li>`);
      } else {
        if (inList) {
          resultLines.push(`</${listType}>`);
          inList = false;
          listType = null;
        }
        resultLines.push(line);
      }
    }
    if (inList) {
      resultLines.push(`</${listType}>`);
    }

    return resultLines.join('\n');
  }

  // Check text content and dynamically append specific visual metrics cards
  function appendInlineCards(bubble, text) {
    // Disabled per user request (no metric card overlays/images in response/input)
    return;
  }

  // Quick reply chip suggestions
  function renderQuickReplies(lastMessageText) {
    const oldContainer = document.querySelector('.creatorly-chat-quickreplies');
    if (oldContainer) oldContainer.remove();

    const repliesRow = document.createElement('div');
    repliesRow.className = 'creatorly-chat-quickreplies';

    const lowercaseText = lastMessageText.toLowerCase();
    let choices = ["Analyze my profile.", "Best posting day?"];

    if (lowercaseText.includes('rates') || lowercaseText.includes('brand') || lowercaseText.includes('collab')) {
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
    const repliesRow = document.querySelector('.creatorly-chat-quickreplies');
    if (repliesRow) repliesRow.remove();

    appendMessageBubble('user', promptText);
    state.messages.push({ role: 'user', content: promptText });
    localStorage.setItem('creatorly_chatbot_history', JSON.stringify(state.messages));
    
    // Check if the user is asking about rates/pricing/valuation/sponsorships
    const lowercasePrompt = promptText.toLowerCase().trim();
    const isRatesQuery = 
      (lowercasePrompt.includes('rate') && (lowercasePrompt.includes('brand') || lowercasePrompt.includes('collab') || lowercasePrompt.includes('my') || lowercasePrompt.includes('sponsor') || lowercasePrompt.includes('charge') || lowercasePrompt.includes('creator') || lowercasePrompt.includes('est') || lowercasePrompt.includes('estimated'))) ||
      lowercasePrompt.includes('how much should i charge') ||
      lowercasePrompt.includes('what is my valuation') ||
      lowercasePrompt.includes('how much to charge') ||
      lowercasePrompt.includes('brand valuation') ||
      lowercasePrompt.includes('brand rates') ||
      lowercasePrompt.includes('collab rate') ||
      lowercasePrompt.includes('sponsorship rate') ||
      lowercasePrompt.includes('collab valuation') ||
      lowercasePrompt.includes('how much i should charge') ||
      lowercasePrompt.includes('how much money can i make') ||
      lowercasePrompt.includes('earnings') ||
      lowercasePrompt.includes('pricing') ||
      lowercasePrompt.includes('worth');

    if (isRatesQuery) {
      setTimeout(() => {
        const streamBubble = appendMessageBubble('assistant', '', true);
        const staticReply = "Please check your profile page to generate your brand rate card.";
        streamBubble.innerHTML = formatMarkdown(staticReply);
        state.messages.push({ role: 'assistant', content: staticReply });
        localStorage.setItem('creatorly_chatbot_history', JSON.stringify(state.messages));
        renderQuickReplies(staticReply);
        checkMessageLimit();
      }, 500);
      return;
    }

    streamAIResponse();
  }

  // Call the Streaming endpoint and read chunks word-by-word
  async function streamAIResponse() {
    const profile = getCreatorProfile();
    const apiPayload = {
      messages: state.messages,
      creatorProfile: profile
    };

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
        
        streamBubble.innerHTML = formatMarkdown(fullResponse) + '<span class="creatorly-streaming-cursor"></span>';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      streamBubble.innerHTML = formatMarkdown(fullResponse);
      appendInlineCards(streamBubble, fullResponse);
      
      state.messages.push({ role: 'assistant', content: fullResponse });
      localStorage.setItem('creatorly_chatbot_history', JSON.stringify(state.messages));

      renderQuickReplies(fullResponse);
      checkMessageLimit();

    } catch (err) {
      console.error('Chatbot SSE stream error:', err);
      const errMsg = `I'm having trouble connecting to my strategy brain right now. Please make sure my server key is configured, or try again in a bit.`;
      streamBubble.innerHTML = errMsg;
      state.messages.push({ role: 'assistant', content: errMsg });
      localStorage.setItem('creatorly_chatbot_history', JSON.stringify(state.messages));
      checkMessageLimit();
    }
  }

  // Load handler
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }
})();
