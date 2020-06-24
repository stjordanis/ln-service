const {test} = require('tap');

const {addPeer} = require('./../../');
const {createCluster} = require('./../macros');
const {createInvoice} = require('./../../');
const {deleteForwardingReputations} = require('./../../');
const {getInvoice} = require('./../../');
const {getWalletInfo} = require('./../../');
const {getWalletVersion} = require('./../../');
const {hopsFromChannels} = require('./../../routing');
const {payViaPaymentRequest} = require('./../../');
const {subscribeToForwardRequests} = require('./../../');
const {routeFromHops} = require('./../../routing');
const {setupChannel} = require('./../macros');
const {waitForRoute} = require('./../macros');

const tokens = 100;

// Paying an invoice should settle the invoice
test(`Pay via payment request`, async ({deepIs, end, equal, rejects}) => {
  const cluster = await createCluster({});

  const {lnd} = cluster.control;

  try {
    const {version} = await getWalletVersion({lnd});

    switch (version) {
    case '0.10.1-beta':
    case '0.10.1-beta':
      await cluster.kill({});

      return end();

    default:
      break;
    }
  } catch (err) {
    await cluster.kill({});

    return end();
  }

  const channel = await setupChannel({
    lnd,
    generate: cluster.generate,
    to: cluster.target,
  });

  const remoteChan = await setupChannel({
    lnd: cluster.target.lnd,
    generate: cluster.generate,
    generator: cluster.target,
    to: cluster.remote,
  });

  await addPeer({
    lnd,
    public_key: cluster.remote.public_key,
    socket: cluster.remote.socket,
  });

  const {routes} = await waitForRoute({
    lnd,
    tokens,
    destination: cluster.remote.public_key,
  });

  const [route] = routes;

  {
    const invoice = await createInvoice({tokens, lnd: cluster.remote.lnd});

    const sub = subscribeToForwardRequests({lnd: cluster.target.lnd});

    sub.on('err', err => console.log("err", err));

    sub.on('forward_request', async forward => forward.reject());

    await rejects(
      payViaPaymentRequest({lnd, request: invoice.request}),
      [503, 'PaymentPathfindingFailedToFindPossibleRoute'],
      'Forward is rejected interactively'
    );

    sub.removeAllListeners();
  }

  await deleteForwardingReputations({lnd});

  {
    const invoice = await createInvoice({tokens, lnd: cluster.remote.lnd});

    const sub = subscribeToForwardRequests({lnd: cluster.target.lnd});

    sub.once('forward_request', async forward => {
      const info = await getWalletInfo({lnd: cluster.target.lnd});

      equal(forward.hash, invoice.id, 'Forward has payment hash');
      equal(forward.in_channel, channel.id, 'Forward has inbound channel')
      equal(forward.in_payment, 1, 'Forward has payment index');
      equal(forward.mtokens, invoice.mtokens, 'Forward has tokens out');
      equal(forward.timeout, info.current_block_height + 43, 'Has timeout');

      return forward.accept();
    });

    await payViaPaymentRequest({lnd, request: invoice.request});
  }

  {
    const invoice = await createInvoice({tokens, lnd: cluster.remote.lnd});

    const sub = subscribeToForwardRequests({lnd: cluster.target.lnd});

    sub.on('forward_request', async forward => {
      return forward.settle({secret: invoice.secret});
    });

    const paid = await payViaPaymentRequest({lnd, request: invoice.request});

    equal(paid.secret, invoice.secret, 'The sender gets the preimage');

    const inv = await getInvoice({id: invoice.id, lnd: cluster.remote.lnd});

    equal(inv.is_confirmed, false, 'Receiver does not get the payment');
  }

  await cluster.kill({});

  return end();
});
