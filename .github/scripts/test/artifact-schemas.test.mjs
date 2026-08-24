#!/usr/bin/env node
/**
 * Contract tests for the structured revision artifacts introduced in Phase 2 of
 * the harness migration: orchestration-decision.json, visual-analysis.json,
 * architecture-plan.json and visual-review.json.
 *
 * These live next to validate-schemas.mjs because that is where ajv is
 * installed. The dependency-free half of the contract — that the failure
 * category vocabulary agrees across config/pipeline.json and both schemas that
 * spell it out — is asserted in scripts/test/pipeline-config.test.mjs instead.
 *
 *   cd .github/scripts && npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SCHEMAS = path.join(ROOT, 'schemas');

// Same options as validate-schemas.mjs, so a schema that compiles here cannot
// fail in CI for a strict-mode reason the tests never saw.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats.default(ajv);

const compile = (name) =>
  ajv.compile(JSON.parse(fs.readFileSync(path.join(SCHEMAS, `${name}.schema.json`), 'utf8')));

const validators = {
  orchestration: compile('orchestration'),
  'visual-analysis': compile('visual-analysis'),
  'architecture-plan': compile('architecture-plan'),
  'visual-review': compile('visual-review'),
};

/** Smallest document each schema accepts — the required-field floor. */
const MINIMAL = {
  orchestration: {
    schemaVersion: 1,
    intent: 'REVISION',
    scope: 'data-only',
    parentRevision: 'revision-008',
    stages: ['orchestrator', 'testRender', 'visualReview'],
  },
  'visual-analysis': {
    schemaVersion: 1,
    page: { format: 'A4' },
    regions: [{ id: 'header', label: 'Header' }],
  },
  'architecture-plan': {
    schemaVersion: 1,
    targetGraphComposeVersion: '1.9.0',
    templateSurface: { lane: 'V2 layered', documentKind: 'cv' },
    componentMapping: [{ region: 'header', renderMethod: 'renderHeader' }],
  },
  'visual-review': {
    schemaVersion: 1,
    verdict: 'REVISE',
    mismatches: [{ id: 'header-height', severity: 'MAJOR', reason: 'taller than reference', action: 'reduce padding' }],
  },
};

test('every artifact schema accepts its minimal document', () => {
  for (const [name, validate] of Object.entries(validators)) {
    const ok = validate(MINIMAL[name]);
    assert.ok(ok, `${name} rejected its own minimal document: ${JSON.stringify(validate.errors)}`);
  }
});

test('every artifact schema rejects an empty document', () => {
  for (const [name, validate] of Object.entries(validators)) {
    assert.ok(!validate({}), `${name} accepted an empty document`);
  }
});

test('visual-review enforces the loop-control rules', () => {
  const v = validators['visual-review'];
  const cases = [
    ['BLOCKED without a failure category', { schemaVersion: 1, verdict: 'BLOCKED', mismatches: [] }],
    ['REVISE with nothing to revise', { schemaVersion: 1, verdict: 'REVISE', mismatches: [] }],
    ['a verdict outside the enum', { schemaVersion: 1, verdict: 'RECOMMEND_APPROVE', mismatches: [] }],
    [
      'a severity outside the contract',
      { schemaVersion: 1, verdict: 'REVISE', mismatches: [{ id: 'x', severity: 'OK', reason: 'r' }] },
    ],
    [
      'a mismatch id that is not kebab-case',
      { schemaVersion: 1, verdict: 'REVISE', mismatches: [{ id: 'Header_Height', severity: 'MAJOR', reason: 'r' }] },
    ],
    [
      'a mismatch with no reason',
      { schemaVersion: 1, verdict: 'REVISE', mismatches: [{ id: 'header-height', severity: 'MAJOR' }] },
    ],
  ];
  for (const [name, doc] of cases) {
    assert.ok(!v(doc), `visual-review accepted ${name}`);
  }
  // And the shapes it must accept.
  assert.ok(
    v({ schemaVersion: 1, verdict: 'BLOCKED', failureCategory: 'ITERATION_LIMIT', mismatches: [] }),
    'visual-review rejected a properly categorised BLOCKED verdict',
  );
  assert.ok(
    v({ schemaVersion: 1, verdict: 'READY_FOR_APPROVAL', recommendation: 'APPROVE', score: 98, mismatches: [] }),
    'visual-review rejected a clean READY_FOR_APPROVAL',
  );
});

test('orchestration ties NEW_GENERATION to the new scope and no parent', () => {
  const v = validators.orchestration;
  const base = { schemaVersion: 1, intent: 'NEW_GENERATION', stages: ['orchestrator'] };
  assert.ok(!v({ ...base, scope: 'data-only', parentRevision: null }), 'accepted NEW_GENERATION on a revision scope');
  assert.ok(!v({ ...base, scope: 'new', parentRevision: 'revision-001' }), 'accepted NEW_GENERATION with a parent');
  assert.ok(v({ ...base, scope: 'new', parentRevision: null }), 'rejected a well-formed NEW_GENERATION');
});

test('architecture-plan holds the lane rules and the component-mapping shape', () => {
  const v = validators['architecture-plan'];
  const base = {
    schemaVersion: 1,
    targetGraphComposeVersion: '1.9.0',
    componentMapping: [{ region: 'header', renderMethod: 'renderHeader' }],
  };
  assert.ok(
    !v({ ...base, templateSurface: { lane: 'V1 classic', documentKind: 'invoice' }, layerSplit: [{ layer: 'theme', content: 'x', status: 'new' }] }),
    'accepted a layer split on the V1 classic lane',
  );
  assert.ok(
    !v({ ...base, templateSurface: { lane: 'V2 layered', documentKind: 'cv' }, widgetReuseAudit: [{ need: 'badge', verdict: 'new' }] }),
    'accepted a new widget with no justification',
  );
  assert.ok(
    !v({ ...base, templateSurface: { lane: 'V2 layered', documentKind: 'cv' }, componentMapping: [{ region: 'h', renderMethod: 'render_header' }] }),
    'accepted a render method that is not camelCase',
  );
  assert.ok(
    !v({ ...base, templateSurface: { lane: 'layered', documentKind: 'cv' } }),
    'accepted a lane outside the enum',
  );
});

test('visual-analysis requires named regions and well-formed sub-records', () => {
  const v = validators['visual-analysis'];
  const base = { schemaVersion: 1, page: { format: 'A4' } };
  assert.ok(!v({ ...base, regions: [] }), 'accepted an analysis with no regions');
  assert.ok(!v({ ...base, regions: [{ id: 'Header', label: 'H' }] }), 'accepted a region id that is not kebab-case');
  assert.ok(
    !v({ ...base, regions: [{ id: 'h', label: 'H' }], shapeOwnership: [{ container: 'circle' }] }),
    'accepted a shape-ownership entry missing ownedContent and relationship',
  );
  assert.ok(
    !v({ ...base, regions: [{ id: 'h', label: 'H' }], unclearParts: [{ item: 'x', reason: 'y' }] }),
    'accepted an unclear part with no proposed assumption',
  );
});

test('the validator binds every artifact schema to a filename', () => {
  const source = fs.readFileSync(path.join(HERE, '..', 'validate-schemas.mjs'), 'utf8');
  for (const [filename, schemaFile] of [
    ['orchestration-decision.json', 'orchestration.schema.json'],
    ['visual-analysis.json', 'visual-analysis.schema.json'],
    ['architecture-plan.json', 'architecture-plan.schema.json'],
    ['visual-review.json', 'visual-review.schema.json'],
  ]) {
    assert.match(source, new RegExp(filename.replace('.', '\\.')), `validate-schemas.mjs does not bind ${filename}`);
    assert.match(source, new RegExp(schemaFile.replace('.', '\\.')), `validate-schemas.mjs does not reference ${schemaFile}`);
  }
});
