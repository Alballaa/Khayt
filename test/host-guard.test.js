const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isBlockedHost, isAllowedPrinterHost, isBlockedLoopbackOrMetadata } = require('../lib/host-guard');

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

test('isAllowedPrinterHost allows LAN printer addresses', () => {
  assert.equal(isAllowedPrinterHost('192.168.1.50'), true);
  assert.equal(isAllowedPrinterHost('10.0.0.42'), true);
  assert.equal(isAllowedPrinterHost('172.16.0.8'), true);
  assert.equal(isAllowedPrinterHost('octopi.local'), true);
  assert.equal(isAllowedPrinterHost('169.254.1.1'), true);
});

test('isBlockedLoopbackOrMetadata blocks loopback but allows LAN SMTP relays', () => {
  assert.equal(isBlockedLoopbackOrMetadata('127.0.0.1'), true);
  assert.equal(isBlockedLoopbackOrMetadata('169.254.169.254'), true);
  assert.equal(isBlockedLoopbackOrMetadata('192.168.1.10'), false);
  assert.equal(isBlockedLoopbackOrMetadata('mail.example.com'), false);
});

test('isAllowedPrinterHost blocks loopback and metadata', () => {
  assert.equal(isAllowedPrinterHost(''), false);
  assert.equal(isAllowedPrinterHost('localhost'), false);
  assert.equal(isAllowedPrinterHost('127.0.0.1'), false);
  assert.equal(isAllowedPrinterHost('169.254.169.254'), false);
  assert.equal(isAllowedPrinterHost('0.0.0.0'), false);
});
