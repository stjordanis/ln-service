const {test} = require('tap');

const {createCluster} = require('./../macros');
const {createInvoice} = require('./../../');
const {delay} = require('./../macros');
const {getPayments} = require('./../../');
const {getWalletInfo} = require('./../../');
const {openChannel} = require('./../../');
const {pay} = require('./../../');
const {setupChannel} = require('./../macros');
const {waitForChannel} = require('./../macros');
const {waitForPendingChannel} = require('./../macros');

const channelCapacityTokens = 1e6;
const confirmationCount = 20;
const defaultFee = 1e3;
const mtokPadding = '000';
const tokens = 100;

// Getting payments should return the list of payments
test('Get payments', async ({end, equal}) => {
  const cluster = await createCluster({is_remote_skipped: true});

  const {lnd} = cluster.control;

  await setupChannel({
    lnd,
    generate: cluster.generate,
    to: cluster.target,
  });

  const invoice = await createInvoice({tokens, lnd: cluster.target.lnd});

  const paid = await pay({lnd, request: invoice.request});

  const [payment] = (await getPayments({lnd})).payments;

  equal(payment.destination, cluster.target_node_public_key, 'Destination');
  equal(payment.created_at.length, 24, 'Created at time');
  equal(payment.fee, 0, 'Fee paid');
  equal(payment.hops.length, 0, 'Hops');
  equal(payment.id, invoice.id, 'Id');
  equal(payment.is_confirmed, true, 'Confirmed');
  equal(payment.is_outgoing, true, 'Outgoing');
  equal(payment.mtokens, `${tokens}${mtokPadding}`, 'Millitokens');
  equal(payment.secret, invoice.secret, 'Payment secret');
  equal(payment.tokens, tokens, 'Paid tokens');

  if (!!payment.request) {
    equal(payment.request, invoice.request, 'Returns original pay request');
  }

  await cluster.kill({});

  return end();
});
