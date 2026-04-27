// ─── AudioJot Frontend ──────────────────────────────────────

const API_BASE = '';
let currentSessionId = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = 0;
let recordingTimerInterval = null;
let audioBlob = null;
let isRecording = false;

// ─── DOM refs ───────────────────────────────────────────────

const els = {
  sessionList: document.getElementById('session-list'),
  btnNewSession: document.getElementById('btn-new-session'),
  btnRecord: document.getElementById('btn-record'),
  btnStop: document.getElementById('btn-stop'),
  btnPlay: document.getElementById('btn-play'),
  btnUpload: document.getElementById('btn-upload'),
  audioUpload: document.getElementById('audio-upload'),
  btnTranscribe: document.getElementById('btn-transcribe'),
  btnImport: document.getElementById('btn-import'),
  statusMsg: document.getElementById('status-msg'),
  timer: document.getElementById('timer'),
  audioPlayer: document.getElementById('audio-player'),
  sessionTitle: document.getElementById('session-title'),
  editor: document.getElementById('editor'),
  noteInputArea: document.getElementById('note-input-area'),
  noteInput: document.getElementById('note-input'),
  btnAddNote: document.getElementById('btn-add-note'),
  btnExportMd: document.getElementById('btn-export-md'),
};

// ─── Helpers ────────────────────────────────────────────────

function fmtTime(totalMs) {
  const totalSeconds = Math.floor(totalMs / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtTimeShort(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  if (h > 0) return `${h}:${m}:${s}`;
  return `${m}:${s}`;
}

function setStatus(msg, isError = false) {
  els.statusMsg.textContent = msg;
  els.statusMsg.style.color = isError ? '#c62828' : '#8e8e93';
}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body) {
    opts.body = body;
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`${res.status}: ${errText}`);
    }
    return res.status === 204 ? null : res.json();
  } catch (e) {
    setStatus(`Error: ${e.message || e}`, true);
    throw e;
  }
}

// ─── Session List ───────────────────────────────────────────

async function loadSessions() {
  const sessions = await api('GET', '/sessions');
  els.sessionList.innerHTML = '';
  sessions.forEach(s => {
    const item = document.createElement('div');
    item.className = `session-item ${s.id === currentSessionId ? 'active' : ''}`;
    item.innerHTML = `
      <span class="session-title">${escapeHtml(s.title)}</span>
      <span class="session-status status-badge status-${s.status}">${s.status}</span>
    `;
    item.onclick = () => selectSession(s.id);
    els.sessionList.appendChild(item);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Select / Load Session ──────────────────────────────────

async function selectSession(id) {
  currentSessionId = id;
  setStatus('');
  await loadSessions();

  const session = await api('GET', `/sessions/${id}`);
  els.sessionTitle.value = session.title;
  els.sessionTitle.disabled = false;

  // Audio controls state
  const hasAudio = !!session.audio_file_path;
  els.btnPlay.disabled = !hasAudio;
  els.btnTranscribe.disabled = !hasAudio || session.status === 'transcribing';
  els.btnImport.disabled = !hasAudio;
  els.btnExportMd.disabled = false;

  if (hasAudio) {
    els.audioPlayer.src = `${API_BASE}/sessions/${id}/audio`;
    els.audioPlayer.hidden = false;
  } else {
    els.audioPlayer.hidden = true;
    els.audioPlayer.src = '';
  }

  // Note input visible when a session is selected
  els.noteInputArea.hidden = false;
  els.noteInput.placeholder = isRecording ? 'Type a note (timestamped to recording)...' : 'Type a note and press Enter...';

  // Load aligned view or notes
  await loadEditor();

  // Check transcription status if transcribing
  if (session.status === 'transcribing') {
    pollTranscriptionStatus();
  } else {
    els.transcribeStatus.textContent = '';
  }
}

async function loadEditor() {
  if (!currentSessionId) {
    els.editor.innerHTML = `
      <div class="empty-state">
        <h2>No session selected</h2>
        <p>Create a new session or select one from the sidebar.</p>
      </div>
    `;
    return;
  }

  try {
    const aligned = await api('GET', `/sessions/${currentSessionId}/aligned`);
    renderAligned(aligned.items);
  } catch (e) {
    // If no transcript yet, just show notes
    const notes = await api('GET', `/sessions/${currentSessionId}/notes`);
    renderNotesOnly(notes);
  }
}

function renderAligned(items) {
  els.editor.innerHTML = '';
  if (!items || items.length === 0) {
    els.editor.innerHTML = '<div class="empty-state"><p>No transcript or notes yet.</p></div>';
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = `document-item ${item.type}`;
    if (item.type === 'segment') {
      div.innerHTML = `
        <div class="timestamp">[${fmtTimeShort(item.data.start_time)} → ${fmtTimeShort(item.data.end_time)}]</div>
        <div>${escapeHtml(item.data.text)}</div>
      `;
    } else {
      div.innerHTML = `
        <div class="label">Note</div>
        <div class="timestamp">[${fmtTimeShort(item.data.audio_offset_ms / 1000)}]</div>
        <div>${escapeHtml(item.data.text)}</div>
      `;
    }
    els.editor.appendChild(div);
  });
}

function renderNotesOnly(notes) {
  els.editor.innerHTML = '';
  if (!notes || notes.length === 0) {
    els.editor.innerHTML = '<div class="empty-state"><p>No notes yet. Start recording or upload audio.</p></div>';
    return;
  }
  notes.forEach(note => {
    const div = document.createElement('div');
    div.className = 'document-item note';
    div.innerHTML = `
      <div class="label">Note</div>
      <div class="timestamp">[${fmtTimeShort(note.audio_offset_ms / 1000)}]</div>
      <div>${escapeHtml(note.text)}</div>
    `;
    els.editor.appendChild(div);
  });
}

// ─── New Session ────────────────────────────────────────────

els.btnNewSession.onclick = async () => {
  const session = await api('POST', '/sessions', { title: null });
  await selectSession(session.id);
};

// ─── Title editing ──────────────────────────────────────────

els.sessionTitle.onchange = async () => {
  if (!currentSessionId) return;
  await api('PATCH', `/sessions/${currentSessionId}`, { title: els.sessionTitle.value });
  await loadSessions();
};

// ─── Recording ──────────────────────────────────────────────
// Primary: Python backend recorder (works in pywebview desktop)
// Fallback: Browser MediaRecorder (for development in real browsers)

async function startBrowserRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  recordedChunks = [];

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    await api('POST', `/sessions/${currentSessionId}/audio/upload`, formData);
    await finishRecording();
  };

  mediaRecorder.onerror = () => {
    alert('Recording error occurred');
    finishRecording();
  };

  mediaRecorder.start();
}

async function finishRecording() {
  stopTimer();
  els.btnRecord.disabled = false;
  els.btnStop.disabled = true;
  isRecording = false;
  await selectSession(currentSessionId);
}

els.btnRecord.onclick = async () => {
  if (!currentSessionId) {
    setStatus('Select or create a session first', true);
    return;
  }
  setStatus('Starting recording...');

  try {
    await api('POST', `/sessions/${currentSessionId}/audio/record-start`);
    isRecording = true;
    recordingStartTime = Date.now();
    startTimer();
    els.btnRecord.disabled = true;
    els.btnStop.disabled = false;
    els.btnPlay.disabled = true;
    setStatus('Recording...');
    await loadSessions();
  } catch (err) {
    setStatus('Backend recorder failed, trying browser...', true);
    try {
      await startBrowserRecording();
      isRecording = true;
      recordingStartTime = Date.now();
      startTimer();
      els.btnRecord.disabled = true;
      els.btnStop.disabled = false;
      els.btnPlay.disabled = true;
      setStatus('Recording (browser mode)...');
    } catch (browserErr) {
      setStatus('Could not start recording: ' + (browserErr.message || browserErr), true);
    }
  }
};

els.btnStop.onclick = async () => {
  setStatus('Stopping...');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    mediaRecorder = null;
  } else {
    try {
      await api('POST', `/sessions/${currentSessionId}/audio/record-stop`);
      await finishRecording();
      setStatus('Recording saved');
    } catch (err) {
      setStatus('Failed to stop: ' + (err.message || err), true);
      finishRecording();
    }
  }
};

function startTimer() {
  els.timer.textContent = '00:00:00';
  recordingTimerInterval = setInterval(() => {
    const elapsed = Date.now() - recordingStartTime;
    els.timer.textContent = fmtTime(elapsed);
  }, 1000);
}

function stopTimer() {
  clearInterval(recordingTimerInterval);
  recordingTimerInterval = null;
  els.timer.textContent = '00:00:00';
}

// ─── Playback ───────────────────────────────────────────────

els.btnPlay.onclick = () => {
  if (els.audioPlayer.paused) {
    els.audioPlayer.play();
    els.btnPlay.textContent = 'Pause';
  } else {
    els.audioPlayer.pause();
    els.btnPlay.textContent = 'Play';
  }
};

els.audioPlayer.onended = () => {
  els.btnPlay.textContent = 'Play';
};

// ─── Upload Audio ───────────────────────────────────────────

els.btnUpload.onclick = () => els.audioUpload.click();

els.audioUpload.onchange = async () => {
  const file = els.audioUpload.files[0];
  if (!file || !currentSessionId) return;
  const formData = new FormData();
  formData.append('file', file);
  await api('POST', `/sessions/${currentSessionId}/audio/upload`, formData);
  await selectSession(currentSessionId);
};

// ─── Notes ──────────────────────────────────────────────────

async function addNote() {
  const text = els.noteInput.value.trim();
  if (!text || !currentSessionId) return;

  let offsetMs = 0;
  let modeLabel = '';
  if (isRecording) {
    offsetMs = Date.now() - recordingStartTime;
    modeLabel = 'live';
  } else if (!els.audioPlayer.paused && els.audioPlayer.currentTime > 0) {
    offsetMs = Math.floor(els.audioPlayer.currentTime * 1000);
    modeLabel = 'playback';
  } else {
    offsetMs = 0;
    modeLabel = 'manual';
  }

  await api('POST', `/sessions/${currentSessionId}/notes`, {
    text,
    audio_offset_ms: offsetMs,
  });
  els.noteInput.value = '';
  if (modeLabel) {
    setStatus(`Note added (${modeLabel} at ${fmtTimeShort(offsetMs / 1000)})`);
  }
  await loadEditor();
}

els.btnAddNote.onclick = addNote;
els.noteInput.onkeydown = e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    addNote();
  }
};

// ─── Transcription ──────────────────────────────────────────

els.btnTranscribe.onclick = async () => {
  if (!currentSessionId) return;
  setStatus('Starting transcription...');
  await api('POST', `/sessions/${currentSessionId}/transcribe`);
  els.btnTranscribe.disabled = true;
  setStatus('Transcribing...');
  pollTranscriptionStatus();
};

function pollTranscriptionStatus() {
  if (!currentSessionId) return;
  const interval = setInterval(async () => {
    if (!currentSessionId) { clearInterval(interval); return; }
    try {
      const status = await api('GET', `/sessions/${currentSessionId}/transcribe-status`);
      if (status.status === 'done') {
        clearInterval(interval);
        setStatus('Transcription complete');
        els.btnTranscribe.disabled = false;
        await selectSession(currentSessionId);
      } else if (status.status === 'error') {
        clearInterval(interval);
        setStatus('Transcription error: ' + (status.error || 'unknown'), true);
        els.btnTranscribe.disabled = false;
      } else if (status.status === 'transcribing') {
        const pct = Math.round((status.progress || 0) * 100);
        setStatus(`Transcribing... ${pct}%`);
      }
    } catch (e) {
      clearInterval(interval);
      setStatus('Failed to check status', true);
      els.btnTranscribe.disabled = false;
    }
  }, 2000);
}

// ─── Import Transcript ──────────────────────────────────────

els.btnImport.onclick = async () => {
  if (!currentSessionId) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await api('POST', `/sessions/${currentSessionId}/transcript/import`, data);
    await selectSession(currentSessionId);
  };
  input.click();
};

// ─── Export ─────────────────────────────────────────────────

els.btnExportMd.onclick = async () => {
  if (!currentSessionId) return;
  const aligned = await api('GET', `/sessions/${currentSessionId}/aligned`);
  let md = `# ${els.sessionTitle.value}\n\n`;
  aligned.items.forEach(item => {
    if (item.type === 'segment') {
      md += `[${fmtTimeShort(item.data.start_time)}] ${item.data.text}\n\n`;
    } else {
      md += `> **Note** [${fmtTimeShort(item.data.audio_offset_ms / 1000)}]: ${item.data.text}\n\n`;
    }
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${els.sessionTitle.value.replace(/\s+/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Init ───────────────────────────────────────────────────

loadSessions();
setStatus('Welcome to AudioJot. Create a session to begin.');
