// ─── AudioJot Frontend ──────────────────────────────────────

const API_BASE = '';

// State
let currentSessionId = null;
let sessions = [];
let selectedSessionIdx = -1;
let isRecording = false;
let recordingStartTime = 0;
let recordingTimerInterval = null;
let mediaRecorder = null;
let viewMode = 'notes'; // 'notes' | 'document'
let ctxSessionId = null;

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
  documentView: document.getElementById('document-view'),
  btnViewNotes: document.getElementById('btn-view-notes'),
  btnViewDoc: document.getElementById('btn-view-doc'),
  btnExportMd: document.getElementById('btn-export-md'),
  contextMenu: document.getElementById('context-menu'),
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

function setStatus(msg, type = '') {
  els.statusMsg.textContent = msg;
  els.statusMsg.className = type;
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
      // Try to parse FastAPI error JSON
      let detail = errText;
      try {
        const errJson = JSON.parse(errText);
        detail = errJson.detail || errText;
      } catch (_) {}
      throw new Error(`${res.status}: ${detail}`);
    }
    return res.status === 204 ? null : res.json();
  } catch (e) {
    setStatus(`${e.message || e}`, 'error');
    throw e;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Session List ───────────────────────────────────────────

async function loadSessions() {
  sessions = await api('GET', '/sessions');
  renderSessionList();
}

function renderSessionList() {
  els.sessionList.innerHTML = '';
  sessions.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = `session-item ${s.id === currentSessionId ? 'active' : ''}`;
    item.dataset.id = s.id;
    item.dataset.idx = idx;
    item.tabIndex = -1;
    item.innerHTML = `
      <span class="session-title">${escapeHtml(s.title)}</span>
      <span class="session-status status-badge status-${s.status}">${s.status}</span>
    `;
    item.onclick = () => selectSession(s.id);
    item.oncontextmenu = (e) => showContextMenu(e, s.id);
    els.sessionList.appendChild(item);
  });

  // Restore selection highlight
  if (selectedSessionIdx >= 0 && selectedSessionIdx < sessions.length) {
    const items = els.sessionList.querySelectorAll('.session-item');
    if (items[selectedSessionIdx]) items[selectedSessionIdx].classList.add('active');
  }
}

// ─── Context Menu ───────────────────────────────────────────

function showContextMenu(e, sessionId) {
  e.preventDefault();
  ctxSessionId = sessionId;
  const menu = els.contextMenu;
  menu.hidden = false;
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
}

function hideContextMenu() {
  els.contextMenu.hidden = true;
  ctxSessionId = null;
}

els.contextMenu.querySelectorAll('.ctx-item').forEach(el => {
  el.onclick = async () => {
    const action = el.dataset.action;
    const sid = ctxSessionId;
    hideContextMenu();
    if (!sid) return;

    if (action === 'delete') {
      if (!confirm('Delete this session?')) return;
      await api('DELETE', `/sessions/${sid}`);
      if (currentSessionId === sid) {
        currentSessionId = null;
        selectedSessionIdx = -1;
        resetMain();
      }
      await loadSessions();
    } else if (action === 'rename') {
      const session = sessions.find(s => s.id === sid);
      const newTitle = prompt('New title:', session?.title || '');
      if (newTitle) {
        await api('PATCH', `/sessions/${sid}`, { title: newTitle });
        await loadSessions();
      }
    } else if (action === 'export') {
      await exportSessionMarkdown(sid);
    }
  };
});

document.addEventListener('click', (e) => {
  if (!els.contextMenu.contains(e.target)) hideContextMenu();
});

// ─── Arrow Key Navigation ───────────────────────────────────

els.sessionList.addEventListener('keydown', (e) => {
  if (sessions.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedSessionIdx = Math.min(selectedSessionIdx + 1, sessions.length - 1);
    selectSessionByIndex(selectedSessionIdx);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedSessionIdx = Math.max(selectedSessionIdx - 1, 0);
    selectSessionByIndex(selectedSessionIdx);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedSessionIdx >= 0) {
      selectSession(sessions[selectedSessionIdx].id);
    }
  }
});

function selectSessionByIndex(idx) {
  const items = els.sessionList.querySelectorAll('.session-item');
  items.forEach((item, i) => {
    item.classList.toggle('active', i === idx);
    if (i === idx) item.scrollIntoView({ block: 'nearest' });
  });
}

// ─── Select Session ─────────────────────────────────────────

async function selectSession(id) {
  if (!id) return;
  currentSessionId = id;
  selectedSessionIdx = sessions.findIndex(s => s.id === id);
  setStatus('');
  renderSessionList();

  const session = await api('GET', `/sessions/${id}`);
  els.sessionTitle.value = session.title;
  els.sessionTitle.disabled = false;

  // Audio state
  const hasAudio = !!session.audio_file_path;
  els.btnPlay.disabled = !hasAudio;
  els.btnTranscribe.disabled = !hasAudio || session.status === 'transcribing';
  els.btnImport.disabled = false;
  els.btnExportMd.disabled = false;

  if (hasAudio) {
    els.audioPlayer.src = `${API_BASE}/sessions/${id}/audio`;
    els.audioPlayer.hidden = false;
  } else {
    els.audioPlayer.hidden = true;
    els.audioPlayer.src = '';
  }

  // Enable editor
  els.editor.disabled = false;
  els.editor.placeholder = isRecording
    ? 'Type your notes here. Press Enter to timestamp a line...'
    : 'Type your notes here...';

  // Load notes into textarea
  const notes = await api('GET', `/sessions/${id}/notes`);
  els.editor.value = notes.map(n => n.text).join('\n\n');

  // Show document view button if transcript exists
  const hasTranscript = session.status === 'transcribed' || session.status === 'imported';
  els.btnViewDoc.hidden = !hasTranscript;

  if (hasTranscript && viewMode === 'document') {
    await showDocumentView();
  } else {
    showNotesView();
  }

  if (session.status === 'transcribing') {
    pollTranscriptionStatus();
  }
}

function resetMain() {
  els.sessionTitle.value = '';
  els.sessionTitle.disabled = true;
  els.editor.value = '';
  els.editor.disabled = true;
  els.editor.placeholder = 'Select or create a session to start taking notes...';
  els.documentView.innerHTML = '';
  els.documentView.hidden = true;
  els.editor.hidden = false;
  els.btnViewDoc.hidden = true;
  els.btnViewNotes.classList.add('active');
  els.btnViewDoc.classList.remove('active');
  els.btnPlay.disabled = true;
  els.btnTranscribe.disabled = true;
  els.btnImport.disabled = true;
  els.btnExportMd.disabled = true;
  els.audioPlayer.hidden = true;
  els.audioPlayer.src = '';
  viewMode = 'notes';
}

// ─── View Toggle ────────────────────────────────────────────

els.btnViewNotes.onclick = () => {
  viewMode = 'notes';
  els.btnViewNotes.classList.add('active');
  els.btnViewDoc.classList.remove('active');
  showNotesView();
};

els.btnViewDoc.onclick = async () => {
  viewMode = 'document';
  els.btnViewDoc.classList.add('active');
  els.btnViewNotes.classList.remove('active');
  await showDocumentView();
};

function showNotesView() {
  els.editor.hidden = false;
  els.documentView.hidden = true;
}

async function showDocumentView() {
  if (!currentSessionId) return;
  const aligned = await api('GET', `/sessions/${currentSessionId}/aligned`);
  els.editor.hidden = true;
  els.documentView.hidden = false;
  renderDocument(aligned.items);
}

function renderDocument(items) {
  els.documentView.innerHTML = '';
  if (!items || items.length === 0) {
    els.documentView.innerHTML = '<div class="empty-state"><p>No content yet.</p></div>';
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
    els.documentView.appendChild(div);
  });
}

// ─── New Session ────────────────────────────────────────────

els.btnNewSession.onclick = async () => {
  const session = await api('POST', '/sessions', { title: null });
  await loadSessions();
  await selectSession(session.id);
  els.editor.focus();
};

// ─── Title editing ──────────────────────────────────────────

els.sessionTitle.onchange = async () => {
  if (!currentSessionId) return;
  await api('PATCH', `/sessions/${currentSessionId}`, { title: els.sessionTitle.value });
  await loadSessions();
};

// ─── Textarea: Note Capture & Sync ──────────────────────────

els.editor.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !e.shiftKey && isRecording && currentSessionId) {
    // Get the line that was just completed (text before cursor)
    const text = els.editor.value;
    const cursorPos = els.editor.selectionStart;
    const beforeCursor = text.substring(0, cursorPos);
    const lines = beforeCursor.split('\n\n');
    const currentLine = lines[lines.length - 1].trim();

    if (currentLine) {
      const offsetMs = Date.now() - recordingStartTime;
      try {
        await api('POST', `/sessions/${currentSessionId}/notes`, {
          text: currentLine,
          audio_offset_ms: offsetMs,
        });
        setStatus(`Note saved at ${fmtTimeShort(offsetMs / 1000)}`, 'success');
      } catch (err) {
        // error already shown by api()
      }
    }
  }
});

// Sync textarea to notes on blur
els.editor.addEventListener('blur', async () => {
  if (!currentSessionId || isRecording) return;
  await syncNotesFromTextarea();
});

async function syncNotesFromTextarea() {
  const text = els.editor.value.trim();
  const paragraphs = text ? text.split(/\n\n+/) : [];

  // Get existing notes
  const existing = await api('GET', `/sessions/${currentSessionId}/notes`);

  // Delete all existing notes
  for (const note of existing) {
    await api('DELETE', `/notes/${note.id}`);
  }

  // Recreate from paragraphs (preserve timestamps where possible)
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;
    const timestamp = existing[i] ? existing[i].audio_offset_ms : 0;
    await api('POST', `/sessions/${currentSessionId}/notes`, {
      text: p,
      audio_offset_ms: timestamp,
    });
  }
}

// ─── Recording ──────────────────────────────────────────────

els.btnRecord.onclick = async () => {
  if (!currentSessionId) {
    setStatus('Select or create a session first', 'error');
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
    els.editor.placeholder = 'Type your notes here. Press Enter to timestamp a line...';
    setStatus('Recording...');
    await loadSessions();
  } catch (err) {
    setStatus('Backend recorder failed, trying browser...', 'error');
    try {
      await startBrowserRecording();
      isRecording = true;
      recordingStartTime = Date.now();
      startTimer();
      els.btnRecord.disabled = true;
      els.btnStop.disabled = false;
      els.btnPlay.disabled = true;
      els.editor.placeholder = 'Type your notes here. Press Enter to timestamp a line...';
      setStatus('Recording (browser mode)...');
    } catch (browserErr) {
      setStatus('Could not start recording: ' + (browserErr.message || browserErr), 'error');
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
      setStatus('Failed to stop: ' + (err.message || err), 'error');
      finishRecording();
    }
  }
};

async function startBrowserRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  const chunks = [];

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    await api('POST', `/sessions/${currentSessionId}/audio/upload`, formData);
    await finishRecording();
  };

  mediaRecorder.onerror = () => {
    setStatus('Recording error occurred', 'error');
    finishRecording();
  };

  mediaRecorder.start();
}

async function finishRecording() {
  stopTimer();
  els.btnRecord.disabled = false;
  els.btnStop.disabled = true;
  isRecording = false;
  els.editor.placeholder = 'Type your notes here...';
  await loadSessions();        // refresh cached sessions array
  await selectSession(currentSessionId);
}

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
  await loadSessions();
  await selectSession(currentSessionId);
};

// ─── Transcription ──────────────────────────────────────────

els.btnTranscribe.onclick = async () => {
  if (!currentSessionId) {
    setStatus('Select a session first', 'error');
    return;
  }

  setStatus('Starting transcription...');
  try {
    await api('POST', `/sessions/${currentSessionId}/transcribe`);
    els.btnTranscribe.disabled = true;
    setStatus('Transcribing...');
    pollTranscriptionStatus();
  } catch (e) {
    // If it was a 400/404, the session likely has no audio
    if (e.message && e.message.includes('400')) {
      setStatus('No audio recorded for this session', 'error');
    }
    console.error('Transcribe failed:', e);
  }
};

function pollTranscriptionStatus() {
  if (!currentSessionId) return;
  const interval = setInterval(async () => {
    if (!currentSessionId) { clearInterval(interval); return; }
    try {
      const status = await api('GET', `/sessions/${currentSessionId}/transcribe-status`);
      if (status.status === 'done') {
        clearInterval(interval);
        setStatus('Transcription complete', 'success');
        els.btnTranscribe.disabled = false;
        await selectSession(currentSessionId);
      } else if (status.status === 'error') {
        clearInterval(interval);
        setStatus('Transcription error: ' + (status.error || 'unknown'), 'error');
        els.btnTranscribe.disabled = false;
      } else if (status.status === 'transcribing') {
        const pct = Math.round((status.progress || 0) * 100);
        setStatus(`Transcribing... ${pct}%`);
      }
    } catch (e) {
      clearInterval(interval);
      setStatus('Failed to check status', 'error');
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
  await exportSessionMarkdown(currentSessionId);
};

async function exportSessionMarkdown(sessionId) {
  const session = await api('GET', `/sessions/${sessionId}`);
  let md = `# ${session.title}\n\n`;

  try {
    const aligned = await api('GET', `/sessions/${sessionId}/aligned`);
    aligned.items.forEach(item => {
      if (item.type === 'segment') {
        md += `[${fmtTimeShort(item.data.start_time)}] ${item.data.text}\n\n`;
      } else {
        md += `> **Note** [${fmtTimeShort(item.data.audio_offset_ms / 1000)}]: ${item.data.text}\n\n`;
      }
    });
  } catch (e) {
    // No transcript yet, just export notes
    const notes = await api('GET', `/sessions/${sessionId}/notes`);
    notes.forEach(note => {
      md += `> **Note** [${fmtTimeShort(note.audio_offset_ms / 1000)}]: ${note.text}\n\n`;
    });
  }

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.title.replace(/\s+/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Exported Markdown', 'success');
}

// ─── Init ───────────────────────────────────────────────────

loadSessions();
setStatus('Welcome to AudioJot. Create a session to begin.');
