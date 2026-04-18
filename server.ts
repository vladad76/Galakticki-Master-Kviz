import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.csv');

// Ensure leaderboard file exists
if (!fs.existsSync(LEADERBOARD_FILE)) {
  fs.writeFileSync(LEADERBOARD_FILE, 'Name,Score,Timestamp\n');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Leaderboard API
  app.get('/api/leaderboard', (req, res) => {
    try {
      const data = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
      const lines = data.split('\n').filter(line => line.trim() !== '');
      const headers = lines[0].split(',');
      const rows = lines.slice(1).map(line => {
        const parts = line.split(',');
        return {
          name: parts[0],
          score: parseInt(parts[1], 10),
          timestamp: parts[2]
        };
      });

      // Sort by score (desc), then by timestamp (desc)
      const sorted = rows.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      res.json(sorted.slice(0, 100));
    } catch (error) {
      console.error('Leaderboard read error:', error);
      res.status(500).json({ error: 'Failed to read leaderboard' });
    }
  });

  app.post('/api/leaderboard', (req, res) => {
    const { name, score } = req.body;

    if (!name || typeof score !== 'number') {
      return res.status(400).json({ error: 'Name and score are required' });
    }

    const cleanName = name.replace(/,/g, '').slice(0, 15);
    const timestamp = new Date().toISOString();
    const entry = `${cleanName},${score},${timestamp}\n`;

    try {
      fs.appendFileSync(LEADERBOARD_FILE, entry);
      res.json({ success: true, timestamp });
    } catch (error) {
      console.error('Leaderboard write error:', error);
      res.status(500).json({ error: 'Failed to save score' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
