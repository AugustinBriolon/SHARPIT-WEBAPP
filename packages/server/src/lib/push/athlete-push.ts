import { prisma } from '@sharpit/db/client';
import { currentLocale } from '@sharpit/server/lib/locale/locale-context';
import { englishDeep } from '@sharpit/server/lib/locale/translate-copy';
import {
  apnsConfigFor,
  isTokenExpiredOrInvalid,
  sendApnsNotification,
  type ApnsPayload,
} from '@sharpit/server/lib/push/apns';

export type PushDevice = { token: string; environment: string };
export type PushDeliveryResult = { sent: number; failed: number; deactivated: number };

/**
 * Sends one payload to each device, each on its own APNs environment. A device APNs says is
 * gone is switched off; a device that received it has its last use stamped. Never throws.
 */
export async function sendPushToDevices(
  devices: readonly PushDevice[],
  payload: ApnsPayload,
): Promise<PushDeliveryResult> {
  const result: PushDeliveryResult = { sent: 0, failed: 0, deactivated: 0 };
  // Pushes are written in French like the rest of the server's copy (ADR-096).
  const worded = currentLocale() === 'en' ? englishDeep(payload) : payload;
  for (const device of devices) {
    const delivery = await sendApnsNotification({
      deviceToken: device.token,
      payload: worded,
      config: apnsConfigFor(device.environment),
    });
    if (delivery.success) {
      result.sent += 1;
      await prisma.deviceToken
        .update({ where: { token: device.token }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
    } else {
      result.failed += 1;
      // Status and APNs reason only — never the token. Without it a push that never arrives
      // leaves nothing to read.
      console.warn('[push] APNs refused', {
        environment: device.environment,
        status: delivery.status,
        reason: delivery.reason,
      });
      if (isTokenExpiredOrInvalid(delivery.status, delivery.reason)) {
        result.deactivated += 1;
        await prisma.deviceToken
          .update({ where: { token: device.token }, data: { enabled: false } })
          .catch(() => {});
      }
    }
  }
  return result;
}

/** Every enabled device of the athlete, then `sendPushToDevices`. */
export async function sendPushToAthlete(
  athleteId: string,
  payload: ApnsPayload,
): Promise<PushDeliveryResult> {
  const devices = await prisma.deviceToken.findMany({
    where: { athleteId, enabled: true },
    select: { token: true, environment: true },
  });
  return sendPushToDevices(devices, payload);
}
