import express from 'express';
import path from 'path';
import estimateRouter from './routes/estimate';
import optionsRouter from './routes/options';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/estimate', estimateRouter);
app.use('/api/options', optionsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Car Price Checker running at http://localhost:${PORT}`);
});
