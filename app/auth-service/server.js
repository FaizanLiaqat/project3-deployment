const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

// ─── DB CONNECTION ────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'docvault',
  user:     process.env.DB_USER     || 'docvault_user',
  password: process.env.DB_PASSWORD || 'changeme',
});

const SECRET = process.env.JWT_SECRET || 'supersecret-change-in-prod';

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth' }));

// ─── REGISTER ────────────────────────────────────────────────────────────────
app.post('/auth/register', async (req, res) => {
  const { first_name, last_name, email, username, password } = req.body;

  if (!first_name || !last_name || !email || !username || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  try {
    // Check duplicates
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username.toLowerCase(), email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (first_name, last_name, email, username, password_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [first_name.trim(), last_name.trim(), email.toLowerCase(), username.toLowerCase(), password_hash]
    );

    return res.status(201).json({ message: 'Account created successfully.' });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, username, password_hash, created_at
       FROM users WHERE username = $1`,
      [username.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      SECRET,
      { expiresIn: '6h' }
    );

    return res.json({
      token,
      user: {
        id:         user.id,
        first_name: user.first_name,
        last_name:  user.last_name,
        email:      user.email,
        username:   user.username,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ─── VERIFY TOKEN ─────────────────────────────────────────────────────────────
app.get('/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    return res.json({ valid: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ valid: false, error: 'Token invalid or expired.' });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`[auth-service] Listening on port ${PORT}`));