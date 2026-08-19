/* ════════════════════════════════════════════════════════
   MINDCRAFT — APP ENGINE
   Impromptu Speaking & Cognitive Training System
   ════════════════════════════════════════════════════════ */

// ── CONSTANTS & STATE ──────────────────────────────────
const API_BASE = window.location.origin + '/api';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let selectedMode = 'Think';
let currentTopic = null;
let transcript = '';
let timerInterval = null;
let timeLeft = 0;
let sessionCount = parseInt(localStorage.getItem('mc_sessions') || '0');
let speechMinutes = parseInt(localStorage.getItem('mc_speech') || '3');
let researchMinutes = parseInt(localStorage.getItem('mc_research') || '5');
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;

// ── SCREEN NAVIGATION ──────────────────────────────────
const screens = {
  home: $('#screen-home'),
  topic: $('#screen-topic'),
  research: $('#screen-research') || $('#screen-prepare'),
  record: $('#screen-record') || $('#screen-speak'),
  playback: $('#screen-playback') || $('#screen-eval'),
};

function navigate(key) {
  Object.values(screens).forEach(s => {
    if (s) s.classList.remove('is-active');
  });
  const target = screens[key] || $(`#screen-${key}`);
  if (target) {
    requestAnimationFrame(() => target.classList.add('is-active'));
  }
}

// ── WEB AUDIO — SPIN SOUNDS ────────────────────────────
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTick(pitch = 800, vol = 0.12) {
  try {
    const ctx = getAudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(pitch, ctx.currentTime);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.error('Audio tick error:', e);
  }
}

function playReveal() {
  try {
    const ctx = getAudioContext();
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      g.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch (e) {
    console.error('Audio reveal error:', e);
  }
}

// ── HELPERS ────────────────────────────────────────────
function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── DROPDOWN LOGIC ─────────────────────────────────────
const selBtn = $('#select-btn');
const selDrop = $('#select-dropdown');
const segBtns = $$('.seg-btn');

const OPTIONS = {
  quickfire: [
    { mode: 'Business', icon: '💼', desc: 'Startups, economics, and corporate strategy' },
    { mode: 'Tech', icon: '💻', desc: 'Software, AI, hardware, and engineering' },
    { mode: 'Politics', icon: '⚖️', desc: 'Government, laws, and societal systems' },
    { mode: 'Geography', icon: '🌍', desc: 'Countries, environments, and geopolitics' },
    { mode: 'History', icon: '🏛️', desc: 'Past events, cultures, and timelines' }
  ],
  investigate: [
    { mode: 'Think', icon: '💭', desc: 'Pure impromptu thinking' },
    { mode: 'Explain', icon: '📖', desc: 'Clarify a concept clearly' },
    { mode: 'Argue', icon: '⚔️', desc: 'Defend a position' },
    { mode: 'Defend', icon: '🛡️', desc: 'Defend an assigned idea' },
    { mode: 'Counter', icon: '🔄', desc: 'Challenge an opinion' },
    { mode: 'Scenario', icon: '🎯', desc: 'Handle a real-world situation' },
    { mode: 'Abstract', icon: '🌀', desc: 'Philosophical depth' },
    { mode: 'Research', icon: '🔬', desc: 'Research then explain' }
  ]
};

let selectedTab = 'quickfire';

function renderDropdown() {
  if (!selDrop) return;
  selDrop.innerHTML = '';
  const list = OPTIONS[selectedTab] || [];
  
  list.forEach((item, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `sel-option ${item.mode === selectedMode ? 'active' : ''}`;
    btn.dataset.mode = item.mode;
    btn.dataset.icon = item.icon;
    btn.dataset.desc = item.desc;
    btn.innerHTML = `<span class="sel-opt-icon">${item.icon}</span><span class="sel-opt-label">${item.mode}</span>`;
    
    btn.addEventListener('click', () => {
      $$('.sel-option').forEach(o => o.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = item.mode;
      updateSelectButton(item);
      selDrop.classList.add('hidden');
      selBtn.classList.remove('open');
    });
    
    selDrop.appendChild(btn);
  });
}

function updateSelectButton(item) {
  const selName = $('#sel-name');
  const selIcon = $('#sel-icon');
  const selDesc = $('#sel-desc');
  if (selName) selName.textContent = item.mode;
  if (selIcon) selIcon.textContent = item.icon;
  if (selDesc) selDesc.textContent = item.desc;
}

if (selBtn && selDrop) {
  // Initialize dropdown
  selectedMode = OPTIONS[selectedTab][0].mode;
  renderDropdown();
  updateSelectButton(OPTIONS[selectedTab][0]);

  selBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isHidden = selDrop.classList.contains('hidden');
    if (isHidden) {
      selDrop.classList.remove('hidden');
      selBtn.classList.add('open');
    } else {
      selDrop.classList.add('hidden');
      selBtn.classList.remove('open');
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.select-wrapper')) {
      selDrop.classList.add('hidden');
      selBtn.classList.remove('open');
    }
  });
}

// Segment Tabs
if (segBtns) {
  segBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      segBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTab = btn.dataset.tab;
      
      selectedMode = OPTIONS[selectedTab][0].mode;
      renderDropdown();
      updateSelectButton(OPTIONS[selectedTab][0]);
    });
  });
}

// ── SETTINGS MODAL ─────────────────────────────────────
const btnSettings = $('#btn-settings');
const settingsModal = $('#settings-modal');
const settingsOverlay = $('#settings-overlay');
const btnSettingsDone = $('#btn-settings-done');
const speechRange = $('#speech-range');
const speechVal = $('#speech-val');
const researchRange = $('#research-range');
const researchVal = $('#research-val');

function openSettings() {
  if (settingsModal) settingsModal.classList.remove('hidden');
  if (settingsOverlay) settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
  if (settingsModal) settingsModal.classList.add('hidden');
  if (settingsOverlay) settingsOverlay.classList.add('hidden');
  localStorage.setItem('mc_speech', speechMinutes.toString());
  localStorage.setItem('mc_research', researchMinutes.toString());
}

if (btnSettings) {
  btnSettings.addEventListener('click', openSettings);
}
if (btnSettingsDone) {
  btnSettingsDone.addEventListener('click', closeSettings);
}
if (settingsOverlay) {
  settingsOverlay.addEventListener('click', closeSettings);
}

if (speechRange) {
  speechRange.value = speechMinutes;
  if (speechVal) speechVal.textContent = `${speechMinutes} min`;
  speechRange.addEventListener('input', e => {
    speechMinutes = parseInt(e.target.value, 10);
    if (speechVal) speechVal.textContent = `${speechMinutes} min`;
    localStorage.setItem('mc_speech', speechMinutes.toString());
  });
}

if (researchRange) {
  researchRange.value = researchMinutes;
  if (researchVal) researchVal.textContent = `${researchMinutes} min`;
  researchRange.addEventListener('input', e => {
    researchMinutes = parseInt(e.target.value, 10);
    if (researchVal) researchVal.textContent = `${researchMinutes} min`;
    localStorage.setItem('mc_research', researchMinutes.toString());
  });
}

// ── LOGO → HOME ────────────────────────────────────────
const logoHome = $('#logo-home');
if (logoHome) {
  logoHome.addEventListener('click', e => {
    e.preventDefault();
    clearInterval(timerInterval);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.stop();
      } catch (err) {
        console.error(err);
      }
    }
    navigate('home');
  });
}

// ── DUMMY TOPICS FOR SPIN CYCLING ──────────────────────
const dummyTopics = [
  "Why do we defend bad decisions?",
  "Is certainty the enemy of knowledge?",
  "The paradox of choice",
  "Can boredom fuel creativity?",
  "Why do favors change how we feel?",
  "Is convenience making us weaker?",
  "The illusion of free will",
  "Why do people follow authority?",
  "Can competition destroy teams?",
  "Is truth always objective?",
  "The cost of perfectionism",
  "Why silence is powerful",
  "Is ambition overrated?",
  "The value of doing nothing",
  "Why do we resist change?",
  "Does social media improve relationships?",
  "Is privacy a right or a luxury?",
  "Can failure be an advantage?",
  "Why do humans need stories?",
  "Is morality universal?",
];

// ── SPIN LOGIC ─────────────────────────────────────────
const btnSpin = $('#btn-spin');
if (btnSpin) {
  btnSpin.addEventListener('click', () => doSpin());
}

async function doSpin() {
  // 1. Increment sessionCount, save to localStorage
  sessionCount++;
  localStorage.setItem('mc_sessions', sessionCount.toString());

  // 2. Navigate to 'topic' screen
  navigate('topic');

  // 3. Show #spin-text, #spin-underline, #spin-mode-label. Hide #topic-reveal.
  const spinText = $('#spin-text');
  const spinUnderline = $('#spin-underline');
  const spinModeLabel = $('#spin-mode-label');
  const topicReveal = $('#topic-reveal');

  if (spinText) spinText.style.display = '';
  if (spinUnderline) spinUnderline.style.display = '';
  if (spinModeLabel) spinModeLabel.style.display = '';
  if (topicReveal) topicReveal.classList.add('hidden');

  // 4. Reset spin-text classes (remove 'final', 'blur'). Set spin-mode-label text.
  if (spinText) {
    spinText.classList.remove('final', 'blur');
    spinText.textContent = '...';
  }
  if (spinUnderline) spinUnderline.classList.remove('show');
  if (spinModeLabel) spinModeLabel.textContent = selectedMode.toUpperCase();

  // 5. Fire fetchTopic() API call in parallel
  const apiPromise = fetchTopic();

  // 6 & 7. Fast cycling & Deceleration
  let interval = 60; // ms between swaps
  let cycleCount = 0;
  const totalFastCycles = 25;
  const totalSlowCycles = 12;

  const shuffled = [...dummyTopics];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  await new Promise(resolve => {
    function cycle() {
      const txt = shuffled[cycleCount % shuffled.length];
      if (spinText) {
        spinText.textContent = txt;
      }
      playTick(500 + Math.random() * 500, 0.06 + Math.random() * 0.04);
      cycleCount++;

      if (cycleCount < totalFastCycles) {
        // Fast phase
        if (spinText) spinText.classList.add('blur');
        setTimeout(cycle, interval);
      } else if (cycleCount < totalFastCycles + totalSlowCycles) {
        // Slow-down phase
        if (spinText) spinText.classList.remove('blur');
        interval = interval * 1.35;
        setTimeout(cycle, interval);
      } else {
        if (spinText) spinText.classList.remove('blur');
        resolve();
      }
    }
    cycle();
  });

  // 8. Await API result.
  const topicData = await apiPromise;

  // 9. playReveal(), set spin-text to real topic title, add .final class, show underline (.show)
  playReveal();

  if (topicData) {
    currentTopic = topicData;
  } else {
    currentTopic = {
      title: `[${selectedMode}] Why do favors change how we feel about people?`,
      type: 'Concept',
      category: 'Psychology',
      difficulty: 'Medium',
      hint: 'The Ben Franklin effect suggests that we like people more after doing them a favor.',
      speaking_task: 'Explain this effect as if you are speaking to someone intelligent who knows nothing about it.'
    };
  }

  if (spinText) {
    spinText.textContent = currentTopic.title;
    spinText.classList.remove('blur');
    spinText.classList.add('final');
  }
  if (spinUnderline) spinUnderline.classList.add('show');

  // 10. Wait 1800ms, then hide spin-text/underline/mode-label, show #topic-reveal
  await new Promise(r => setTimeout(r, 1800));

  if (spinText) spinText.style.display = 'none';
  if (spinUnderline) spinUnderline.style.display = 'none';
  if (spinModeLabel) spinModeLabel.style.display = 'none';
  if (topicReveal) topicReveal.classList.remove('hidden');

  // 11. Populate card
  if (currentTopic) {
    const cardTitle = $('#card-title');
    const cardHint = $('#card-hint');
    const cardCategory = $('#card-category');
    const cardType = $('#card-type');
    const cardSession = $('#card-session');
    const topicInstruction = $('#topic-instruction');
    const diffFill = $('#diff-fill');

    if (cardTitle) cardTitle.textContent = currentTopic.title;
    if (cardHint) cardHint.textContent = currentTopic.hint || currentTopic.speaking_task || '';
    if (cardCategory) cardCategory.textContent = `${(currentTopic.category || 'GENERAL').toUpperCase()} · ${(currentTopic.type || selectedMode).toUpperCase()}`;
    if (cardType) cardType.textContent = (currentTopic.type || 'PROMPT').toUpperCase();
    if (cardSession) cardSession.textContent = `SESSION ${String(sessionCount).padStart(3, '0')}`;
    if (topicInstruction) topicInstruction.textContent = currentTopic.speaking_task || 'Your brain has already started forming an explanation.';

    const diffMap = { Easy: 25, Medium: 50, Hard: 70, Brutal: 90 };
    if (diffFill) {
      diffFill.style.width = (diffMap[currentTopic.difficulty] || 50) + '%';
    }
  }
}

// ── FETCH TOPIC ────────────────────────────────────────
async function fetchTopic() {
  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: selectedMode, type: selectedTab, difficulty: 'Medium' }),
    });
    const result = await res.json();
    if (result.status === 'success') return result.data;
  } catch (e) {
    console.error(e);
  }
  return null;
}

// ── START RESEARCH ─────────────────────────────────────
function startResearch() {
  // 1. Navigate to 'research' screen
  navigate('research');

  // 2. Reset spin text display properties for next time
  const spinText = $('#spin-text');
  const spinUnderline = $('#spin-underline');
  const spinModeLabel = $('#spin-mode-label');
  if (spinText) spinText.style.display = '';
  if (spinUnderline) spinUnderline.style.display = '';
  if (spinModeLabel) spinModeLabel.style.display = '';

  // 3. Set #research-topic text
  const researchTopic = $('#research-topic') || $('#prepare-topic');
  if (researchTopic) {
    researchTopic.textContent = currentTopic?.title || 'Topic';
  }

  // 4. Start countdown timer using researchMinutes * 60 seconds
  const total = researchMinutes * 60;
  const circ = 2 * Math.PI * 90; // 565.48
  const ring = $('#ring-progress');
  if (ring) {
    ring.style.strokeDashoffset = '0';
  }

  timeLeft = total;
  const researchDigits = $('#research-digits') || $('#prepare-digits');
  if (researchDigits) {
    researchDigits.textContent = fmt(timeLeft);
  }

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    // 6. Update #research-digits text
    if (researchDigits) {
      researchDigits.textContent = fmt(timeLeft);
    }
    // 5. Update SVG ring progress
    if (ring) {
      ring.style.strokeDashoffset = (circ * (1 - timeLeft / total)).toString();
    }
    // 7. When timer hits 0: auto-navigate to record screen via goToRecord()
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      goToRecord();
    }
  }, 1000);
}

const btnStartResearch = $('#btn-start-research') || $('#btn-to-prepare');
if (btnStartResearch) {
  btnStartResearch.addEventListener('click', startResearch);
}

// ── SKIP RESEARCH ──────────────────────────────────────
const btnSkipResearch = $('#btn-skip-research') || $('#btn-skip-prep');
if (btnSkipResearch) {
  btnSkipResearch.addEventListener('click', () => {
    clearInterval(timerInterval);
    goToRecord();
  });
}

// ── GO TO RECORD ───────────────────────────────────────
function goToRecord() {
  navigate('record');
  const recordTopic = $('#record-topic') || $('#speak-topic');
  if (recordTopic) recordTopic.textContent = currentTopic?.title || 'Topic';

  const total = speechMinutes * 60;
  timeLeft = total;
  const recordDigits = $('#record-digits') || $('#speak-digits');
  const recordTimerFill = $('#record-timer-fill') || $('#speak-timer-fill');

  if (recordDigits) recordDigits.textContent = fmt(timeLeft);
  if (recordTimerFill) recordTimerFill.style.width = '100%';

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      // Find a supported mime type for the browser
      let mime = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mime = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mime = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mime = 'audio/ogg';
      }

      mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      audioChunks = [];
      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        // Explicitly attach the MIME type so the Data URI has the correct header
        recordedBlob = new Blob(audioChunks, { type: mime });
        stream.getTracks().forEach(t => t.stop());
        showPlayback();
      };
      
      mediaRecorder.start();
    }).catch(err => {
      console.error('Microphone access denied or error:', err);
    });
  }

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    if (recordDigits) recordDigits.textContent = fmt(timeLeft);
    if (recordTimerFill) recordTimerFill.style.width = ((timeLeft / total) * 100) + '%';
    if (timeLeft <= 0) {
      stopRecording();
    }
  }, 1000);
}

// ── STOP RECORDING ─────────────────────────────────────
const btnStopRecord = $('#btn-stop-record') || $('#btn-finish');
if (btnStopRecord) {
  btnStopRecord.addEventListener('click', () => stopRecording());
}

function stopRecording() {
  clearInterval(timerInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else {
    showPlayback();
  }
}

// ── SHOW PLAYBACK ──────────────────────────────────────
function showPlayback() {
  navigate('playback');
  const playbackTopic = $('#playback-topic') || $('#eval-topic') || $('#speak-topic');
  if (playbackTopic) playbackTopic.textContent = currentTopic?.title || 'Topic';

  if (recordedBlob) {
    // Bypassing Blob URLs completely! We read it into a Data URI base64 string.
    // This fixes strict browser security / Brave Shield bugs that block blob:// media playback.
    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      const audioWrapper = $('.audio-player-wrapper');
      
      if (audioWrapper) {
        audioWrapper.innerHTML = '';
        
        const audioPlayer = document.createElement('audio');
        audioPlayer.id = 'audio-player';
        audioPlayer.className = 'audio-player';
        audioPlayer.controls = true;
        // Load the base64 data directly into the audio tag
        audioPlayer.src = dataUrl;
        
        audioWrapper.appendChild(audioPlayer);

        let dbg = document.createElement('div');
        dbg.style.fontSize = '0.8rem';
        dbg.style.color = 'var(--text-muted)';
        dbg.style.marginTop = '0.5rem';
        dbg.textContent = `File size: ${(recordedBlob.size / 1024).toFixed(2)} KB | Type: ${recordedBlob.type} | DataURI`;
        audioWrapper.appendChild(dbg);
      }
    };
    reader.readAsDataURL(recordedBlob);
  }
}

// ── DOWNLOAD ───────────────────────────────────────────
const btnDownload = $('#btn-download');
if (btnDownload) {
  btnDownload.addEventListener('click', () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindcraft-session-${sessionCount}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// ── SPIN AGAIN ─────────────────────────────────────────
const btnSpinAgain = $('#btn-spin-again') || $('#btn-again');
if (btnSpinAgain) {
  btnSpinAgain.addEventListener('click', () => {
    clearInterval(timerInterval);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.stop();
      } catch (e) {}
    }
    currentTopic = null;
    transcript = '';
    audioChunks = [];
    recordedBlob = null;
    navigate('home');
  });
}
