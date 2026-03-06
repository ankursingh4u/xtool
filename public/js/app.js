// --- Toast notifications ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// --- API helper ---
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// --- Tweet actions ---
async function updateTweet(id, updates) {
  try {
    await api(`/api/tweets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    showToast('Tweet updated');
    setTimeout(() => location.reload(), 500);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTweet(id) {
  if (!confirm('Delete this tweet?')) return;
  try {
    await api(`/api/tweets/${id}`, { method: 'DELETE' });
    document.getElementById(`tweet-${id}`).remove();
    showToast('Tweet deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function postNow(id) {
  if (!confirm('Post this tweet to X now?')) return;
  try {
    showToast('Posting... browser will open shortly');
    const result = await api(`/api/tweets/${id}/post`, { method: 'POST' });
    if (result.success) {
      showToast('Tweet posted!');
      setTimeout(() => location.reload(), 1000);
    } else {
      showToast(result.reason || 'Post failed', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Edit toggle ---
function toggleEdit(id) {
  const textEl = document.getElementById(`text-${id}`);
  const editEl = document.getElementById(`edit-${id}`);
  const countEl = document.getElementById(`count-${id}`);

  if (editEl.style.display === 'none') {
    // Show editor
    editEl.style.display = 'block';
    textEl.style.display = 'none';
    editEl.focus();

    // Update char count on input
    editEl.oninput = () => {
      const len = editEl.value.length;
      countEl.textContent = `${len}/280`;
      countEl.classList.toggle('over', len > 280);
    };

    // Save on blur
    editEl.onblur = () => {
      const newText = editEl.value.trim();
      if (newText && newText !== textEl.textContent.trim()) {
        updateTweet(id, { text: newText });
      } else {
        editEl.style.display = 'none';
        textEl.style.display = 'block';
      }
    };
  } else {
    editEl.style.display = 'none';
    textEl.style.display = 'block';
  }
}

// --- Filters ---
function applyFilters() {
  const status = document.getElementById('filterStatus').value;
  const topic = document.getElementById('filterTopic').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (topic) params.set('topic', topic);
  window.location.href = `/queue?${params.toString()}`;
}

// --- Copy tweet to clipboard ---
function copyTweet(btn) {
  const card = btn.closest('.tweet-card');
  const text = card.querySelector('.tweet-text').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('btn-copied');
    showToast('Tweet copied! Go paste it on X');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('btn-copied');
    }, 2000);
  });
}

// --- Generate all topics at once ---
async function generateAllTweets() {
  const btn = document.getElementById('genBtn');
  const result = document.getElementById('genResult');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';
  result.innerHTML = '';

  try {
    const data = await api('/api/generate-all', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    data.tweets.forEach((t) => {
      const tweetText = t.text || t;
      const topic = t.topic || '';
      result.innerHTML += `
        <div class="tweet-card copy-card">
          <div class="tweet-meta">
            <span class="badge badge-draft">${topic}</span>
            <span class="char-count">${tweetText.length}/280</span>
          </div>
          <div class="tweet-text">${tweetText}</div>
          <div class="tweet-actions">
            <button class="btn btn-copy" onclick="copyTweet(this)">Copy</button>
          </div>
        </div>`;
    });
    showToast(`${data.tweets.length} tweets ready to copy!`);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Tweets';
  }
}

async function generateThread() {
  const btn = document.getElementById('threadBtn');
  const result = document.getElementById('threadResult');
  const topic = document.getElementById('threadTopic').value;
  const count = document.getElementById('threadCount').value;

  if (!topic) {
    showToast('Enter a topic', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';
  result.innerHTML = '';

  try {
    const data = await api('/api/generate-thread', {
      method: 'POST',
      body: JSON.stringify({ topic, count: Number(count) }),
    });

    const tweet = data.tweet;
    result.innerHTML = `<p style="color:var(--success); margin-bottom:8px">Thread created!</p>`;
    result.innerHTML += `<div class="tweet-card"><div class="tweet-text">1/ ${tweet.text}</div></div>`;
    if (tweet.thread) {
      tweet.thread.forEach((t, i) => {
        result.innerHTML += `<div class="tweet-card" style="margin-left:16px"><div class="tweet-text">${i + 2}/ ${t.text}</div></div>`;
      });
    }
    showToast('Thread draft created');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Thread';
  }
}

// --- Trends ---
async function fetchTrends() {
  const btn = document.getElementById('fetchBtn');
  const keyword = document.getElementById('trendKeyword').value;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Fetching...';

  try {
    const data = await api('/api/trends/fetch', {
      method: 'POST',
      body: JSON.stringify({ keyword: keyword || undefined }),
    });
    showToast(`Fetched ${data.count} trend tweets`);
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch Trends';
  }
}

async function fetchAllTrends() {
  showToast('Fetching all topics... this may take a few minutes');
  try {
    const data = await api('/api/trends/fetch', { method: 'POST', body: '{}' });
    showToast(`Fetched ${data.count} total trend tweets`);
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Scheduler ---
async function toggleScheduler(action) {
  try {
    await api(`/api/scheduler/${action}`, { method: 'POST' });
    showToast(`Scheduler ${action === 'start' ? 'started' : 'stopped'}`);
    setTimeout(() => location.reload(), 500);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
