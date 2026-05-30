const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isBlockedHost } = require('../lib/host-guard');

test('blocks empty and localhost names', () => {
  assert.equal(isBlockedHost(''), true);
  assert.equal(isBlockedHost('localhost'), true);
  assert.equal(isBlockedHost('LOCALHOST'), true);
});

test('blocks private and loopback IPv4', () => {
  assert.equal(isBlockedHost('127.0.0.1'), true);
  assert.equal(isBlockedHost('10.0.0.1'), true);
  assert.equal(isBlockedHost('192.168.0.1'), true);
  assert.equal(isBlockedHost('169.254.169.254'), true);
});

test('allows public hostnames and IPs', () => {
  assert.equal(isBlockedHost('api.telegram.org'), false);
  assert.equal(isBlockedHost('8.8.8.8'), false);
});

test('blocks common IPv6 loopback and ULA prefixes', () => {
  assert.equal(isBlockedHost('::1'), true);
  assert.equal(isBlockedHost('fe80::1'), true);
  assert.equal(isBlockedHost('fc00::1'), true);
});
