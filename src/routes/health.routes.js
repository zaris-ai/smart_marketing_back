import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, service: 'node-crewai-multi-crews' });
});

export default router;
