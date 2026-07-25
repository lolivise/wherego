// Scenarios 4 & 5 of docs/plans/00-foundations/work/T01-monorepo-scaffold/acceptance.md.
//
// Proves the `Date` ban both ways using ESLint's Node API with synthetic filePaths — no
// temp files are written, no subprocess is spawned, so this runs on every `pnpm test`.
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Byte-identical across both scenarios, per Scenario 5's wording.
const CODE_WITH_DATE = 'export const now = new Date();\n';

async function lint(relativeFilePath: string) {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(CODE_WITH_DATE, {
    filePath: path.join(repoRoot, relativeFilePath),
  });
  if (!result) {
    throw new Error('ESLint returned no result');
  }
  return result.messages.filter((message) => message.ruleId === 'no-restricted-globals');
}

describe('Date ban — packages/scheduler vs packages/domain', () => {
  it('Scenario 4: new Date() is rejected under packages/scheduler/src/, naming PlainDate', async () => {
    const errors = await lint('packages/scheduler/src/__probe.ts');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((message) => message.message.includes('Date'))).toBe(true);
    expect(errors.some((message) => message.message.includes('PlainDate'))).toBe(true);
  });

  it('Scenario 5: the byte-identical new Date() is accepted under packages/domain/src/', async () => {
    const errors = await lint('packages/domain/src/__probe.ts');
    expect(errors.length).toBe(0);
  });
});

// B1 (validation-01.md): no-restricted-globals only matches `Date` as a bare
// identifier in value position. These five forms bypassed the ban entirely before
// the fix — each must now report an error under packages/scheduler/src/, and every
// message must still name PlainDate and @wherego/domain as the replacement (Scenario
// 4's requirement extends to every bypass this closes, not just the bare identifier).
describe('Date ban — bypasses via globalThis/self/window and type position', () => {
  async function lintScheduler(code: string) {
    const eslint = new ESLint({ cwd: repoRoot });
    const [result] = await eslint.lintText(code, {
      filePath: path.join(repoRoot, 'packages/scheduler/src/__probe.ts'),
    });
    if (!result) {
      throw new Error('ESLint returned no result');
    }
    return result.messages;
  }

  function assertNamesReplacement(messages: { message: string }[]) {
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((message) => message.message.includes('PlainDate'))).toBe(true);
    expect(messages.some((message) => message.message.includes('@wherego/domain'))).toBe(true);
  }

  it('globalThis.Date.now() is rejected', async () => {
    assertNamesReplacement(await lintScheduler('export const n = globalThis.Date.now();\n'));
  });

  it("globalThis['Date'] (computed access) is rejected", async () => {
    assertNamesReplacement(await lintScheduler("export const D = globalThis['Date'];\n"));
  });

  it('self.Date is rejected', async () => {
    assertNamesReplacement(await lintScheduler('export const s = self.Date;\n'));
  });

  it('window.Date is rejected', async () => {
    assertNamesReplacement(await lintScheduler('export const w = window.Date;\n'));
  });

  it('Date used in type position is rejected', async () => {
    assertNamesReplacement(await lintScheduler('export type W = { d: Date };\n'));
  });
});

// validation-02.md N1–N4: four further bypasses found after B1 was closed. Each must
// be rejected under packages/scheduler/src/, naming PlainDate and @wherego/domain
// (Scenario 4's requirement), and — per the task's positive-control requirement —
// each construct must remain legal under packages/domain/src/, since that package is
// exactly where PlainDate, ROC math and any formatting are meant to live.
describe('Date ban — devDependencies import, Intl, performance, and typeof Date (N1–N4)', () => {
  async function lintScheduler(code: string) {
    const eslint = new ESLint({ cwd: repoRoot });
    const [result] = await eslint.lintText(code, {
      filePath: path.join(repoRoot, 'packages/scheduler/src/__probe.ts'),
    });
    if (!result) {
      throw new Error('ESLint returned no result');
    }
    return result.messages;
  }

  async function lintDomain(code: string) {
    const eslint = new ESLint({ cwd: repoRoot });
    const [result] = await eslint.lintText(code, {
      filePath: path.join(repoRoot, 'packages/domain/src/__probe.ts'),
    });
    if (!result) {
      throw new Error('ESLint returned no result');
    }
    return result.messages;
  }

  function assertNamesReplacement(messages: { message: string }[]) {
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((message) => message.message.includes('PlainDate'))).toBe(true);
    expect(messages.some((message) => message.message.includes('@wherego/domain'))).toBe(true);
  }

  it('N1: importing dayjs is rejected under packages/scheduler/src/', async () => {
    assertNamesReplacement(await lintScheduler("import dayjs from 'dayjs';\ndayjs();\n"));
  });

  it('N1: date-fns, moment, luxon, js-joda, dateformat and the Temporal polyfills are each rejected', async () => {
    const modules = [
      'date-fns',
      'moment',
      'luxon',
      'js-joda',
      '@js-joda/core',
      'dateformat',
      'temporal-polyfill',
      '@js-temporal/polyfill',
    ];
    for (const mod of modules) {
      const messages = await lintScheduler(`import x from '${mod}';\nx();\n`);
      assertNamesReplacement(messages);
    }
  });

  it("N2: `new Intl.DateTimeFormat().format()` is rejected under packages/scheduler/src/", async () => {
    assertNamesReplacement(await lintScheduler('export const s = new Intl.DateTimeFormat().format();\n'));
  });

  it('N3: `performance.timeOrigin + performance.now()` is rejected under packages/scheduler/src/', async () => {
    assertNamesReplacement(
      await lintScheduler('export const t = performance.timeOrigin + performance.now();\n'),
    );
  });

  it('N4: `InstanceType<typeof Date>` is rejected under packages/scheduler/src/', async () => {
    assertNamesReplacement(await lintScheduler('export type W = InstanceType<typeof Date>;\n'));
  });

  it('positive control: dayjs import, Intl, performance and typeof Date remain legal under packages/domain/src/', async () => {
    const importMessages = await lintDomain("import dayjs from 'dayjs';\ndayjs();\n");
    expect(importMessages.filter((m) => m.ruleId === 'no-restricted-imports')).toEqual([]);

    const intlMessages = await lintDomain('export const s = new Intl.DateTimeFormat().format();\n');
    expect(intlMessages.filter((m) => m.ruleId === 'no-restricted-globals')).toEqual([]);

    const perfMessages = await lintDomain(
      'export const t = performance.timeOrigin + performance.now();\n',
    );
    expect(perfMessages.filter((m) => m.ruleId === 'no-restricted-globals')).toEqual([]);

    const typeofMessages = await lintDomain('export type W = InstanceType<typeof Date>;\n');
    expect(typeofMessages.filter((m) => m.ruleId === 'no-restricted-syntax')).toEqual([]);
  });
});
