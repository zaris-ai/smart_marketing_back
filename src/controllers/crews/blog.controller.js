import { runCrew } from '../../services/crewRunner.service.js';
import { validateBlogPayload } from '../../validators/crew.validator.js';

export async function runBlogCrew(req, res) {
  const inputs = validateBlogPayload(req.body);
  const result = await runCrew('blog', inputs);
  res.json({ ok: true, result });
}
