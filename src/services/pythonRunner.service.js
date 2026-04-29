import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../');
const pythonDir = path.join(projectRoot, 'python');
//const pythonExecutable = path.join(pythonDir, '.venv', 'bin', 'python3');
const pythonExecutable = process.env.PYTHON_BIN || '/opt/venv/bin/python3';
const runnerPath = path.join(pythonDir, 'crew_runner.py');

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error(`No JSON object found in stdout:\n${text}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  throw new Error(`Incomplete JSON object in stdout:\n${text}`);
}

export function runPythonCrew({ crewName, payload = {} }) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      crew_name: crewName,
      payload,
    });

    const child = spawn(pythonExecutable, [runnerPath], {
      cwd: pythonDir,
      env: {
        ...process.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            [
              `Python process exited with code ${code}`,
              `STDERR:`,
              stderr || '(empty)',
              `STDOUT:`,
              stdout || '(empty)',
            ].join('\n')
          )
        );
      }

      try {
        const jsonText = extractFirstJsonObject(stdout);
        const parsed = JSON.parse(jsonText);
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            [
              `Failed to parse Python JSON output: ${error.message}`,
              `STDERR:`,
              stderr || '(empty)',
              `RAW STDOUT:`,
              stdout || '(empty)',
            ].join('\n')
          )
        );
      }
    });

    child.stdin.write(requestBody);
    child.stdin.end();
  });
}
