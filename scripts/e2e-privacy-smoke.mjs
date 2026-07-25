/**
 * E2E smoke — Privacy / PDPL data-subject features in a real Electron window.
 *
 * 1) Intake consent gate: a submission without consent is rejected; with consent it is
 *    stored together with an auditable consent record (timestamp + notice version/text).
 * 2) DSAR export bundles only that customer's data.
 * 3) Erasure plan: unlink keeps orders; full erase purges intake + comms.
 *
 * Run: npm run test:e2e:privacy   (CI wraps it in xvfb-run)
 */
import { launchApp, dismissWizard, makeUserDataDir, E2E_LAN_PORT, E2E_LAN_PIN } from './e2e/helpers.mjs';

const INTAKE_TOKEN = 'e2e-intake-token';
// The intake POST is public but authenticated by an intake session cookie OR this token
// header; the token keeps the test independent of cookie handling.
async function postIntake(body) {
  const res = await fetch(`http://127.0.0.1:${E2E_LAN_PORT}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-khayt-intake-token': INTAKE_TOKEN },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

const ok = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); };

const { electronApp, window } = await launchApp(makeUserDataDir());
let failed = false;
try {
  await dismissWizard(window);

  // Start the LAN server so the public intake endpoint is reachable.
  await window.evaluate(async ({ port, pin }) => {
    settings.lanApi = { ...(settings.lanApi || {}), enabled: true, port, pin, intakePin: '', bindLan: false, intakeToken: 'e2e-intake-token' };
    settings.shopName = 'Test Shop';
    saveAll();
    await window.hubAPI.startLanServer({ port, pin, bindLan: false });
  }, { port: E2E_LAN_PORT, pin: E2E_LAN_PIN });
  await new Promise(r => setTimeout(r, 1200));

  // 1a) Intake WITHOUT consent → rejected.
  const noConsent = await postIntake({ name: 'Ali', description: 'A vase please', email: 'ali@example.com' });
  ok(noConsent.status === 400, `intake without consent rejected (${noConsent.status})`);

  // 1b) Intake WITH consent → accepted + consent recorded.
  const withConsent = await postIntake({ name: 'Ali', description: 'A vase please', email: 'ali@example.com', consent: true });
  ok(withConsent.status === 200, 'intake with consent accepted');
  await window.waitForFunction(() => (waitingList || []).some(r => r.email === 'ali@example.com'), { timeout: 10000 });
  const row = await window.evaluate(() => waitingList.find(r => r.email === 'ali@example.com'));
  ok(row.consent && row.consent.agreed === true, 'consent recorded on the intake row');
  ok(!!row.consent.at && typeof row.consent.version === 'number', 'consent has timestamp + version');
  ok(/Test Shop/.test(row.consent.text), 'consent stores the exact notice wording shown');

  // 2) DSAR export bundles only this subject.
  const exp = await window.evaluate(() => {
    clients.push({ id: 'PC1', nameEn: 'Ali', email: 'ali@example.com', commLog: [{ type: 'call', note: 'hi', at: '2026-01-01' }] });
    printLog.unshift({ id: 'PO1', clientId: 'PC1', date: '2026-03-01', project: 'Vase', status: 'completed', price: 100 });
    printLog.unshift({ id: 'PO2', clientId: 'OTHER', date: '2026-03-02', project: 'Cup', status: 'pending', price: 50 });
    saveAll();
    return KhaytPrivacy.buildClientDataExport('PC1', { clients, printLog, waitingList, waitingListHistory });
  });
  ok(exp.subject.nameEn === 'Ali' && exp.orders.length === 1, 'export contains only this customer’s order');
  ok(exp.intakeSubmissions.length === 1, 'export matched the intake submission by email');
  ok(exp.communications.length === 1, 'export includes the communication log');
  ok(JSON.stringify(exp).includes('apiKey') === false, 'export leaks no shop secrets');

  // 3) Erasure plan distinguishes unlink vs full erase.
  const plans = await window.evaluate(() => ({
    unlink: KhaytPrivacy.planClientErasure('PC1', { clients, printLog, waitingList, waitingListHistory }, 'unlink'),
    full: KhaytPrivacy.planClientErasure('PC1', { clients, printLog, waitingList, waitingListHistory }, 'full'),
  }));
  ok(plans.unlink.orderIds.length === 1 && plans.unlink.blankOrderNames === false, 'unlink keeps the order record');
  ok(plans.full.blankOrderNames === true && plans.full.purgeIntakeIds.length === 1, 'full erase purges intake + blanks names');

  // 4) AI consent renders, and the privacy screen's on-device claim stays honest.
  //    The unit tests cover the logic; this is the only place the panel is
  //    actually built, so a template error would otherwise ship unnoticed.
  const consent = await window.evaluate(() => {
    settings.ai = { enabled: true, apiKey: 'sk-ant-test', model: 'claude-opus-4-8' };
    renderAiSettings();
    const rows = [...document.querySelectorAll('#aiFeatureList .ai-feat')];
    return {
      rowCount: rows.length,
      // Every row must state what it sends — that is the disclosure.
      allDisclose: rows.every((r) => (r.querySelector('.ai-feat-sends')?.textContent || '').trim().length > 20),
      // Migrating an owner who only ever saw the old "AI quote" toggle.
      replyChecked: !!document.querySelector('.ai-feat-toggle[data-feature="reply"]')?.checked,
      quoteChecked: !!document.querySelector('.ai-feat-toggle[data-feature="quote"]')?.checked,
      piiBadges: document.querySelectorAll('.ai-feat-pii').length,
      reconsentShown: document.querySelectorAll('.ai-feat-reconsent').length,
    };
  });
  ok(consent.rowCount === 4, `all four AI features are listed (got ${consent.rowCount})`);
  ok(consent.allDisclose, 'every feature row states what it sends');
  ok(consent.quoteChecked === true, 'quote inherits the old global toggle');
  ok(consent.replyChecked === false, 'reply does NOT inherit consent to send a customer name');
  ok(consent.piiBadges === 1, 'exactly the customer-data feature is badged');
  ok(consent.reconsentShown === 1, 'the owner is told why reply turned off');

  const claim = await window.evaluate(() => {
    const read = () => {
      renderPrivacySettings();
      return !!document.querySelector('.priv-ai-caveat');
    };
    settings.ai = { enabled: true, apiKey: 'k', features: { quote: true, price: true, reply: false, assistant: true } };
    const withoutPii = read();
    settings.ai.features.reply = true;
    const withPii = read();
    settings.ai.enabled = false;
    const masterOff = read();
    return { withoutPii, withPii, masterOff };
  });
  ok(claim.withoutPii === false, '"stays on this machine" is unqualified while no customer data leaves');
  ok(claim.withPii === true, 'enabling reply drafting qualifies the on-device claim');
  ok(claim.masterOff === false, 'turning AI off restores the unqualified claim');

  console.log('\n✅ Privacy smoke: all assertions passed');
} catch (e) {
  failed = true;
  console.error('\n❌ ' + e.message);
} finally {
  await electronApp.close();
}
process.exit(failed ? 1 : 0);
