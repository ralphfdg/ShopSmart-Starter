import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function withEnv(name, value, run) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { return run(); } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test('proxy headers are not trusted by default (local development)', () => {
  withEnv('TRUST_PROXY', undefined, () => {
    assert.equal(createApp().get('trust proxy'), false);
  });
});

test('TRUST_PROXY sets the number of proxy hops for hosted deployments', () => {
  withEnv('TRUST_PROXY', '1', () => {
    assert.equal(createApp().get('trust proxy'), 1);
  });
});
