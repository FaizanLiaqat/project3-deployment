const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
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

const SECRET       = process.env.JWT_SECRET   || 'supersecret-change-in-prod';
const UPLOAD_DIR   = process.env.UPLOAD_DIR   || '/mnt/pdfs';
const MAX_FILE_MB  = 10;

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── JWT MIDDLEWARE ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired.' });
  }
}

// ─── MULTER SETUP ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Per-user folder
    const userDir = path.join(UPLOAD_DIR, String(req.user.id));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safe}`);
  },
});

function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed.'), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'backend' }));

// ─── PROFILE ─────────────────────────────────────────────────────────────────
app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, username, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[profile]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── UPLOAD PDF ───────────────────────────────────────────────────────────────
app.post('/api/upload', requireAuth, (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_MB} MB.` });
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO documents (user_id, original_name, stored_name, file_path, file_size)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, original_name, file_size, created_at`,
        [
          req.user.id,
          req.file.originalname,
          req.file.filename,
          req.file.path,
          req.file.size,
        ]
      );

      return res.status(201).json({
        message: 'PDF uploaded successfully.',
        document: result.rows[0],
      });
    } catch (dbErr) {
      // Clean up file if DB insert fails
      fs.unlink(req.file.path, () => {});
      console.error('[upload]', dbErr);
      return res.status(500).json({ error: 'Server error saving document.' });
    }
  });
});

// ─── LIST DOCUMENTS ───────────────────────────────────────────────────────────
app.get('/api/documents', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, original_name, file_size, created_at
       FROM documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('[documents]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DOWNLOAD DOCUMENT ────────────────────────────────────────────────────────
app.get('/api/documents/:id/download', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, original_name, file_path
       FROM documents
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = result.rows[0];

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'File not found on server.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', 'application/pdf');
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) {
    console.error('[download]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DELETE DOCUMENT ──────────────────────────────────────────────────────────
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM documents
       WHERE id = $1 AND user_id = $2
       RETURNING file_path`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Remove file from disk
    const filePath = result.rows[0].file_path;
    fs.unlink(filePath, (err) => {
      if (err) console.warn('[delete] File not found on disk:', filePath);
    });

    return res.json({ message: 'Document deleted.' });
  } catch (err) {
    console.error('[delete]', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[backend] Listening on port ${PORT}`));