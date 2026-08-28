-- Migration 0046: targeted pairing invitations (issue #498)
--
-- The manual "type a phone number" path in Settings used to call addContact
-- directly, creating a routed whatsapp_contacts binding with no proof the
-- caller controls that number. It now mints a pairing code the same way the
-- existing "generate a code" flow does, but records the invited number here
-- so redeemPairingCode can refuse a redemption from any other phone. NULL
-- (the untargeted "generate a code" flow) keeps its current behaviour: the
-- first phone to send the code wins it.

ALTER TABLE "whatsapp_pairing_codes" ADD COLUMN "phone_number" text;