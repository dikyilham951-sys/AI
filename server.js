require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit').rateLimit;
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });

// Secret sesi dibuat acak dan disimpan lokal agar sesi tidak berubah setiap server restart.
const secretPath = path.join(DATA_DIR, 'session-secret.txt');
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (fs.existsSync(secretPath)) {
    sessionSecret = fs.readFileSync(secretPath, 'utf8').trim();
  } else {
    sessionSecret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretPath, sessionSecret, { mode: 0o600 });
  }
}

const db = new DatabaseSync(path.join(DATA_DIR, 'agent.sqlite'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '12kb' }));
app.use(session({
  name: 'agent.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Tunggu 15 menit lalu coba lagi.' }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Batas chat sementara tercapai. Coba lagi sebentar.' }
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  }
  next();
}

function regenerateSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.userId = userId;
      req.session.save((saveError) => {
        if (saveError) return reject(saveError);
        resolve();
      });
    });
  });
}

app.post('/api/register', authLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string'
    ? req.body.username.trim().toLowerCase()
    : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({
      error: 'Username harus 3–24 karakter: huruf kecil, angka, atau garis bawah.'
    });
  }
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({
      error: 'Password harus minimal 12 karakter dan maksimal 72 byte.'
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).run(username, passwordHash);

    await regenerateSession(req, Number(result.lastInsertRowid));
    return res.status(201).json({ username });
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT_UNIQUE')) {
      return res.status(409).json({ error: 'Username sudah digunakan.' });
    }
    console.error('Register error:', error.message);
    return res.status(500).json({ error: 'Pendaftaran gagal. Coba lagi.' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string'
    ? req.body.username.trim().toLowerCase()
    : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password || password.length > 256) {
    return res.status(400).json({ error: 'Username atau password salah.' });
  }

  try {
    const user = db.prepare(
      'SELECT id, username, password_hash FROM users WHERE username = ?'
    ).get(username);

    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    await regenerateSession(req, user.id);
    return res.json({ username: user.username });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Login gagal. Coba lagi.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'Gagal logout.' });
    res.clearCookie('agent.sid', { httpOnly: true, sameSite: 'strict' });
    return res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT username FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) return res.json({ user: null });
  return res.json({ user });
});

app.get('/api/chat/history', requireLogin, (req, res) => {
  const rows = db.prepare(
    'SELECT id, role, content, created_at FROM messages WHERE user_id = ? ORDER BY id ASC LIMIT 100'
  ).all(req.session.userId);
  return res.json({ messages: rows });
});


app.post('/api/chat', requireLogin, async (req, res) => {
  const content = typeof req.body?.message === 'string'
    ? req.body.message.trim()
    : '';

  if (!content || content.length > 2000) {
    return res.status(400).json({
      error: 'Pesan harus berisi 1–2000 karakter.'
    });
  }

  const aiApiUrl = process.env.AI_API_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  const previous = db.prepare(
    'SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 12'
  ).all(req.session.userId).reverse();

  const messages = [
     {
      role: 'system',
      content: 'Kamu adalah asisten AI yang membantu, jujur, dan menjawab dalam bahasa pengguna. Jelaskan dengan bahasa sederhana. Jangan pernah meminta, mengulang, atau menyimpan password, kode OTP, atau rahasia akun.'
    },
    ...previous,
    { role: 'user', content }
  ];

  try {
    if (!aiApiUrl || !apiKey || !model) {
      return res.status(503).json({
        error: 'Konfigurasi AI API belum lengkap.'
      });
    }

    const response = await fetch(aiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('AI API response:', response.status, details.slice(0, 400));

      return res.status(502).json({
        error: 'AI API gagal merespons. Periksa konfigurasi API.'
      });
    }

    const data = await response.json();

    const reply = typeof data.choices?.[0]?.message?.content === 'string'
      ? data.choices[0].message.content.trim()
      : '';

    if (!reply) {
      return res.status(502).json({
        error: 'AI mengirim jawaban kosong. Coba lagi.'
      });
    }

    const insert = db.prepare(
      'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)'
    );

    db.exec('BEGIN');

    try {
      insert.run(req.session.userId, 'user', content);
      insert.run(req.session.userId, 'assistant', reply.slice(0, 4000));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return res.json({ reply: reply.slice(0, 4000) });

  } catch (error) {
    const timeout = error.name === 'TimeoutError' ||
      error.name === 'AbortError';

    console.error('Chat error:', error.message);

    return res.status(502).json({
      error: timeout
        ? 'AI terlalu lama merespons. Coba pesan yang lebih singkat.'
        : 'Tidak bisa menghubungi AI API. Periksa koneksi dan konfigurasi.'
    });
  }
});

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use((error, req, res, next) => {
  console.error('Server error:', error.message);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`AI Agent aktif: http://localhost:${PORT}`);
});
console.log(`AI model: ${process.env.AI_MODEL || '(belum diatur)'}`);
