import { runCrew } from '../../services/crewRunner.service.js';
import { validateResearchPayload } from '../../validators/crew.validator.js';

export async function runResearchCrew(req, res) {
  const inputs = validateResearchPayload(req.body);
  const result = await runCrew('research', inputs);
  res.json({ ok: true, result });
}
