import { describe, expect, it } from 'vitest';

import { accountDeletedEmail } from './account-deleted-email';

describe('account deleted email', () => {
  it('confirms the deletion by name', () => {
    const email = accountDeletedEmail({ firstName: ' Zoé ', renewingSubscription: null });
    expect(email.subject).toBe('Suppression programmée de ton compte SharpIt');
    expect(email.text.startsWith('Bonjour Zoé,')).toBe(true);
    expect(email.text).not.toContain('Abonnements');
  });

  it('says how to stop an App Store subscription, which deletion cannot', () => {
    const email = accountDeletedEmail({ firstName: null, renewingSubscription: 'apple' });
    expect(email.text.startsWith('Bonjour,')).toBe(true);
    expect(email.text).toContain("Réglages de l'iPhone › ton nom › Abonnements › SharpIt");
  });
});
