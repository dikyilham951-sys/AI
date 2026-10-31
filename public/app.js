const authView = document.querySelector('#auth-view');
const chatView = document.querySelector('#chat-view');
const authForm = document.querySelector('#auth-form');
const authTitle = document.querySelector('#auth-title');
const authDesc = document.querySelector('#auth-desc');
const authSubmit = document.querySelector('#auth-submit');
const authStatus = document.querySelector('#auth-status');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const loginTab = document.querySelector('#tab-login');
const registerTab = document.querySelector('#tab-register');
const chatForm = document.querySelector('#chat-form');
const messageInput = document.querySelector('#message-input');
const sendButton = document.querySelector('#send-button');
const messagesBox = document.querySelector('#messages');
const chatStatus = document.querySelector('#chat-status');
const userLabel = document.querySelector('#user-label');
const logoutButton = document.querySelector('#logout-button');

let authMode = 'login';
let busy = false;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request gagal (${response.status}).`);
  return data;
}

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === 'register';
  loginTab.classList.toggle('active', !register);
  registerTab.classList.toggle('active', register);
  loginTab.setAttribute('aria-selected', String(!register));
  registerTab.setAttribute('aria-selected', String(register));
  authTitle.textContent = register ? 'Buat akun baru' : 'Masuk ke akun';
  authDesc.textContent = register ? 'Akun lokal untuk menyimpan percakapanmu.' : 'Lanjutkan ke ruang chat pribadi.';
  authSubmit.innerHTML = register ? 'Buat akun <span>→</span>' : 'Masuk <span>→</span>';
  passwordInput.autocomplete = register ? 'new-password' : 'current-password';
  passwordInput.value = '';
  passwordInput.minLength = register ? 12 : 1;
  authStatus.textContent = '';
}

loginTab.addEventListener('click', () => setAuthMode('login'));
registerTab.addEventListener('click', () => setAuthMode('register'));

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  authSubmit.disabled = true;
  authStatus.textContent = authMode === 'register' ? 'Membuat akun...' : 'Memeriksa akun...';
  authStatus.style.color = '#b8aaff';

  try {
    const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value
      })
    });
    passwordInput.value = '';
    await showChat(data.username);
  } catch (error) {
    authStatus.textContent = error.message;
    authStatus.style.color = '#ff9d9d';
  } finally {
    busy = false;
    authSubmit.disabled = false;
  }
});

function addMessage(role, content) {
  const welcome = messagesBox.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const row = document.createElement('div');
  row.className = `message ${role === 'user' ? 'user' : 'assistant'}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'U' : 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  // textContent mencegah pesan pengguna diperlakukan sebagai HTML/script.
  bubble.textContent = content;
  row.append(avatar, bubble);
  messagesBox.append(row);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

function showWelcome() {
  messagesBox.innerHTML = '';
  const welcome = document.createElement('div');
  welcome.className = 'welcome-message';
  const symbol = document.createElement('div');
  symbol.className = 'welcome-symbol';
  symbol.textContent = '✦';
  const heading = document.createElement('h3');
  heading.textContent = 'Ada yang bisa dibantu?';
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Tulis pertanyaan atau tugas di bawah. Model AI berjalan di komputer ini.';
  welcome.append(symbol, heading, paragraph);
  messagesBox.append(welcome);
}

async function showChat(username) {
  authView.classList.add('hidden');
  chatView.classList.remove('hidden');
  userLabel.textContent = username || 'User';
  chatStatus.textContent = '';
  showWelcome();
  const data = await api('/api/chat/history');
  if (data.messages.length) {
    messagesBox.innerHTML = '';
    for (const message of data.messages) addMessage(message.role, message.content);
  }
  messageInput.focus();
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message || busy) return;

  busy = true;
  sendButton.disabled = true;
  messageInput.disabled = true;
  chatStatus.textContent = 'AI sedang berpikir...';
  addMessage('user', message);
  messageInput.value = '';

  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
    addMessage('assistant', data.reply);
    chatStatus.textContent = '';
  } catch (error) {
    chatStatus.textContent = error.message;
  } finally {
    busy = false;
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } finally {
    chatView.classList.add('hidden');
    authView.classList.remove('hidden');
    usernameInput.value = '';
    passwordInput.value = '';
    showWelcome();
    setAuthMode('login');
  }
});

async function start() {
  try {
    const data = await api('/api/me');
    if (data.user) await showChat(data.user.username);
  } catch {
    // Jika sesi belum ada, tampilan login tetap terbuka.
  }
}

start();
