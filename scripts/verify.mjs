import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = new Date();
const currentTask = readFileSync(join(root, 'tasks/current.md'), 'utf8');
const taskId = process.env.VERIFY_TASK ?? currentTask.match(/TASK-\d{3}/)?.[0] ?? 'TASK-000';
const runDir = join(
  root,
  'artifacts/verification',
  taskId,
  'verify',
  startedAt.toISOString().replace(/[:.]/g, '-'),
);
mkdirSync(runDir, { recursive: true });

const steps = [
  { name: 'lint', command: 'pnpm', args: ['lint'] },
  { name: 'typecheck', command: 'pnpm', args: ['typecheck'] },
  { name: 'build', command: 'pnpm', args: ['build'] },
  { name: 'test:unit', command: 'pnpm', args: ['test:unit'] },
  { name: 'test:integration', command: 'pnpm', args: ['test:integration'] },
  { name: 'test:contract', command: 'pnpm', args: ['test:contract'] },
  { name: 'test:architecture', command: 'pnpm', args: ['test:architecture'] },
  { name: 'test:e2e', command: 'pnpm', args: ['test:e2e'] },
  { name: 'test:smoke', command: 'pnpm', args: ['test:smoke'] },
];

function runStep(step, index) {
  return new Promise((resolveStep) => {
    const logPath = join(runDir, `${String(index + 1).padStart(2, '0')}-${step.name.replace(/:/g, '-')}.log`);
    const logStream = createWriteStream(logPath);
    const started = Date.now();
    const child = spawn(step.command, step.args, { cwd: root, env: process.env });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - started;
      logStream.end();
      process.stdout.write(
        `\n[verify] ${code === 0 ? 'PASS' : 'FAIL'} ${step.name} (exit ${code ?? 'null'}, ${(durationMs / 1000).toFixed(1)}s)\n\n`,
      );
      resolveStep({ name: step.name, exitCode: code ?? 1, durationMs, logPath });
    });
  });
}

const summary = [];
for (let index = 0; index < steps.length; index += 1) {
  const step = steps[index];
  process.stdout.write(`\n[verify] ▶ ${step.name}\n`);
  summary.push(await runStep(step, index));
}

const failed = summary.filter((item) => item.exitCode !== 0);
const report = {
  task: taskId,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  worktree: root,
  steps: summary.map((item) => ({
    name: item.name,
    exitCode: item.exitCode,
    durationMs: item.durationMs,
    log: item.logPath,
  })),
  result: failed.length === 0 ? 'PASS' : 'FAIL',
};

writeFileSync(join(runDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write('\n[verify] 结果汇总\n');
for (const item of summary) {
  process.stdout.write(
    `  - ${item.name.padEnd(18, ' ')} ${item.exitCode === 0 ? 'PASS' : `FAIL (exit ${item.exitCode})`}  ${(item.durationMs / 1000).toFixed(1)}s\n`,
  );
}
process.stdout.write(`[verify] 证据目录：${runDir}\n`);
process.stdout.write(`[verify] 总结果：${report.result}\n`);

process.exit(failed.length === 0 ? 0 : 1);
