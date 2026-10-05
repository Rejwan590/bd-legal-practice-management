import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/client.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req: Request, res: Response) => {
  const db = getDatabase();
  const dbHealthy = await db.isHealthy();

  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
    clientIp: req.ip,
    version: '1.0.0',
    phase: 'Step 3.0 Foundation',
  });
});
