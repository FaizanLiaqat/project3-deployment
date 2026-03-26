const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'supersecret';
const USERS = [{ id: 1, username: 'admin', password: 'password123' }];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth' }));

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '1h' });
  res.json({ token });
});

app.get('/auth/verify', (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ valid: false });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`));
