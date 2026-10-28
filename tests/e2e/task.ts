import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const taskFile = readFileSync(resolve(__dirname, '../../tasks/current.md'), 'utf8');

/** 证据目录跟随 tasks/current.md，避免每个任务手工改路径。 */
export const TASK_ID = process.env.E2E_TASK ?? taskFile.match(/TASK-\d{3}/)?.[0] ?? 'TASK-000';
