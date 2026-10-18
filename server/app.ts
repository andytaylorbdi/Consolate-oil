import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.ts';
import { workerRouter } from './routes/worker.ts';
import { adminRouter } from './routes/admin.ts';

export function createApp() {
  const app = express();

  // Trust reverse proxy (e.g. Cloud Run, AI Studio iframe) for correct secure/proto detection
  app.set('trust proxy', 1);

  // Core parsing middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Mount API Domain Routes
  app.use('/api/auth', authRouter);
  app.use('/api/worker', workerRouter);
  app.use('/api/admin', adminRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'Consolate Oil Backend API',
    });
  });

  return app;
}
