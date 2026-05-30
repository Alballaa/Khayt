const { test } = require('node:test');
const assert = require('node:assert/strict');
const flows = require('../renderer/order-flows.js');

test('KhaytOrderFlows exports order lifecycle functions', () => {
  for (const name of [
    'logPrint',
    'updateStatus',
    'openOrderEditor',
    'openPaymentModal',
    'duplicateOrder',
    'recordOrderEdit',
    'splitOrderAcrossMachines',
    'openChangeOrderModal',
  ]) {
    assert.equal(typeof flows[name], 'function', name);
  }
});
