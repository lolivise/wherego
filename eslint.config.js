// Flat ESLint config (ESLint 9 + typescript-eslint 8). See docs/PLAN.md §2 and
// docs/plans/00-foundations/work/T01-monorepo-scaffold/plan.md for the decision record.
import tseslint from 'typescript-eslint';

// Shared across every bypass-specific rule below so each one names the replacement,
// per Scenario 4 of the T01 acceptance contract.
const DATE_BAN_MESSAGE =
  'Date is banned in packages/scheduler. A JS Date is an instant, not a date; ' +
  'use PlainDate integer day arithmetic from @wherego/domain. See docs/PLAN.md §2.';

// validation-02.md N2: `new Intl.DateTimeFormat().format()` with no argument formats
// the current date. packages/scheduler does no formatting at all — formatRoc() lives
// in packages/domain — so there is no legitimate use of Intl to break here.
const INTL_BAN_MESSAGE =
  'Intl is banned in packages/scheduler. new Intl.DateTimeFormat().format() with no ' +
  'argument formats the current date, and this package does no formatting; use ' +
  'PlainDate integer day arithmetic from @wherego/domain. See docs/PLAN.md §2.';

// validation-02.md N3: `performance.timeOrigin + performance.now()` reaches the
// clock the same way `Date.now()` does. Pure integer day arithmetic has no use for it.
const PERFORMANCE_BAN_MESSAGE =
  'performance is banned in packages/scheduler. performance.timeOrigin + ' +
  'performance.now() reaches the clock, and this package does pure day arithmetic; ' +
  'use PlainDate integer day arithmetic from @wherego/domain. See docs/PLAN.md §2.';

// validation-02.md N1: a date library reaches the clock or a calendar date the same
// way Date does, and pnpm installs devDependencies by default — this is the first
// thing an engineer reaches for when told they may not use Date. Belt and braces: the
// scheduler-purity guard (tools/guards/scheduler-purity.test.ts) catches declaring
// one; this catches importing one.
const DATE_LIBRARY_IMPORT_MESSAGE =
  'Date libraries are banned in packages/scheduler. They reach the clock or a ' +
  'calendar date the same way Date does; use PlainDate integer day arithmetic from ' +
  '@wherego/domain. See docs/PLAN.md §2.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.wrangler/**',
      '**/*.tsbuildinfo',
      'pnpm-lock.yaml',
    ],
  },
  tseslint.configs.recommended,
  {
    // The Date ban. packages/scheduler is pure calendar arithmetic in Asia/Taipei
    // executed on UTC-clocked machines; a JS Date is an instant, not a date, so it
    // is banned in favour of @wherego/domain's PlainDate. See docs/PLAN.md §2.
    //
    // `no-restricted-globals` alone only catches `Date` used as a bare identifier in
    // value position (`new Date()`). It does not see: property access on `globalThis`
    // / `self` / `window` (`globalThis.Date.now()` is the natural way to reach the
    // clock in a Worker, where there is no `window`), the same access via a computed
    // string key (`globalThis['Date']`), `Date` used in type position
    // (`type W = { d: Date }`), a `typeof Date` type query (`InstanceType<typeof
    // Date>`), the `Intl` and `performance` globals (both reach the clock without
    // ever naming `Date`), or importing a date library (`dayjs`, `moment`, …). The
    // rules below close all of those without attempting to catch dynamic-eval tricks
    // like `new (0, eval)('Date')()` or a runtime-computed property name
    // (`Reflect.get(globalThis, "Date")`, `globalThis['Da' + 'te']`), which are
    // statically undecidable and out of scope — see validation-02.md N5.
    files: ['packages/scheduler/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: DATE_BAN_MESSAGE },
        { name: 'Intl', message: INTL_BAN_MESSAGE },
        { name: 'performance', message: PERFORMANCE_BAN_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'globalThis', property: 'Date', message: DATE_BAN_MESSAGE },
        { object: 'self', property: 'Date', message: DATE_BAN_MESSAGE },
        { object: 'window', property: 'Date', message: DATE_BAN_MESSAGE },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // `Date` used as a type, e.g. `type W = { d: Date }`, a return type, or a
          // generic argument such as `Array<Date>`.
          selector: "TSTypeReference[typeName.name='Date']",
          message: DATE_BAN_MESSAGE,
        },
        {
          // `typeof Date` in type position, e.g. `InstanceType<typeof Date>`. This is
          // a `TSTypeQuery` node, which `TSTypeReference` above does not match.
          selector: "TSTypeQuery[exprName.name='Date']",
          message: DATE_BAN_MESSAGE,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'dayjs', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: 'date-fns', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: 'moment', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: 'luxon', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: 'js-joda', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: '@js-joda/core', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: 'dateformat', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: 'temporal-polyfill', message: DATE_LIBRARY_IMPORT_MESSAGE },
            { name: '@js-temporal/polyfill', message: DATE_LIBRARY_IMPORT_MESSAGE },
          ],
        },
      ],
    },
  },
);
