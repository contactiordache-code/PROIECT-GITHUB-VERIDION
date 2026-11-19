import assert from 'node:assert/strict';
import test from 'node:test';
import { buildValidation, normalizeTechnology } from '../src/validate.js';

test('normalizes versions and known aliases', () => {
  assert.equal(normalizeTechnology('jQuery:3.7.1'), 'jquery');
  assert.equal(normalizeTechnology('Apache HTTP Server'), 'apache');
  assert.equal(normalizeTechnology('Matomo'), 'matomo analytics');
  assert.equal(normalizeTechnology('Microsoft IIS'), 'iis');
  assert.equal(normalizeTechnology('YouTube embed'), 'youtube');
  assert.equal(normalizeTechnology('HubSpot CMS'), 'hubspot cms hub');
});

test('measures same-domain independent agreement', () => {
  const report = buildValidation([{
    domain: 'example.com', status: 'detected', technologies: [{
      id: 'apache', name: 'Apache HTTP Server', category: 'Web servers', confidence: 'confirmed',
      evidence: [{ source: 'header', key: 'server', value: 'Apache', strength: 3 }],
    }],
  }], [{ input: 'example.com', tech: ['Apache:2.4.62'] }]);
  assert.equal(report.totals.independentlyCorroborated, 1);
  assert.equal(report.totals.agreementPercent, 100);
});
