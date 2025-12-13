import { LightningAddress } from '@getalby/lightning-tools';
import { LN } from '@getalby/sdk';

/**
 * Send a zap to a lightning address using NWC
 *
 * @param lud16 - The recipient's lightning address (e.g., "user@getalby.com")
 * @param amountSats - Amount to send in satoshis
 * @param nwcConnectionString - NWC connection string for payment
 * @param comment - Optional zap comment
 * @returns Payment result with preimage
 */
export async function sendPrizeZap(
  lud16: string,
  amountSats: number,
  nwcConnectionString: string,
  comment?: string
): Promise<{ preimage: string; invoice: string }> {
  // Create NWC client
  const nwcClient = new LN(nwcConnectionString);

  // Resolve the lightning address
  const ln = new LightningAddress(lud16);
  await ln.fetch();

  // Request an invoice from the recipient's LNURL endpoint
  const invoice = await ln.requestInvoice({
    satoshi: amountSats,
    comment: comment || `Lottery prize: ${amountSats} sats`,
  });

  if (!invoice.paymentRequest) {
    throw new Error('Failed to get invoice from lightning address');
  }

  // Pay the invoice using NWC
  const result = await nwcClient.pay(invoice.paymentRequest);

  return {
    preimage: result.preimage,
    invoice: invoice.paymentRequest,
  };
}

/**
 * Get a user's lightning address from their Nostr profile (kind 0)
 */
export function getLightningAddressFromMetadata(
  metadata: { lud06?: string; lud16?: string } | undefined
): string | null {
  if (!metadata) return null;

  // Prefer lud16 (email-like format) over lud06 (bech32)
  if (metadata.lud16) {
    return metadata.lud16;
  }

  // lud06 is a bech32-encoded LNURL, which we'd need to decode
  // For simplicity, we'll require lud16 for prize payouts
  if (metadata.lud06) {
    console.warn('lud06 found but lud16 preferred for payouts');
    return null;
  }

  return null;
}

/**
 * Validate a lightning address format
 */
export function isValidLightningAddress(address: string): boolean {
  // Basic email-like format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(address);
}

/**
 * Get wallet balance using NWC
 * Note: Balance checking may not be available on all NWC implementations
 */
export async function getWalletBalance(
  _nwcConnectionString: string
): Promise<{ balance: number }> {
  // The LN class from @getalby/sdk doesn't expose a getBalance method directly
  // Balance would need to be checked via the wallet UI or a different NWC call
  // For now, return -1 to indicate balance is not available
  console.warn('Balance checking not implemented - check wallet directly');
  return { balance: -1 };
}
