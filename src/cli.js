import 'dotenv/config';
import { runCrew } from './services/crewRunner.service.js';

const crewName = process.argv[2];
const mainArg = process.argv.slice(3).join(' ').trim();

if (!crewName || !mainArg) {
  console.error('Usage: node src/cli.js <blog|pricing|research> "main prompt text"');
  process.exit(1);
}

const payloads = {
  blog: { topic: mainArg, audience: 'general readers', tone: 'direct and practical' },
  pricing: { product: mainArg, segment: 'B2B SaaS', goal: 'improve monetization' },
  research: { topic: mainArg, depth: 'brief', audience: 'technical stakeholder' },
};

const inputs = payloads[crewName];
if (!inputs) {
  console.error(`Unknown crew: ${crewName}`);
  process.exit(1);
}

