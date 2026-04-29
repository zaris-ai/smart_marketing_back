import { runCrew } from '../../services/crewRunner.service.js';
import { validatePricingPayload } from '../../validators/crew.validator.js';

export async function runPricingCrew(req, res) {
  const inputs = validatePricingPayload(req.body);
  const result = await runCrew('pricing', inputs);
  res.json({ ok: true, result });
}
