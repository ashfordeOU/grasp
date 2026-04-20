import type { Request, Response } from 'express';

export async function handleWebhook(_req: Request, res: Response): Promise<void> {
  res.status(202).json({ received: true });
}
