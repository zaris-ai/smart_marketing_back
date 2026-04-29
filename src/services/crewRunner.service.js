import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

function resolvePythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

  const candidates = [
    path.join(projectRoot, '.venv', 'bin', 'python'),
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(projectRoot, '.venv', 'Scripts', 'python'),
    'python3',
    'python',
  ];

  for (const candidate of candidates) {
    if (candidate === 'python3' || candidate === 'python') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'python3';
}

export function runCrew(crewName, inputs) {
  return new Promise((resolve, reject) => {
    const pythonBin = resolvePythonBin();
    const scriptPath = path.resolve(projectRoot, 'python/crew_runner.py');
    const child = spawn(pythonBin, [scriptPath], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const payload = JSON.stringify({ crew_name: crewName, inputs });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (error) => {
      reject(new Error(`Failed to start Python child process (${pythonBin}): ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Crew runner exited with code ${code} using Python: ${pythonBin}

STDERR:
${stderr || '(empty)'}

STDOUT:
${stdout || '(empty)'}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Crew runner returned invalid JSON using Python: ${pythonBin}

Parse error: ${error.message}

Raw stdout:
${stdout}

Stderr:
${stderr}`));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
