---
"peer-rtc-api": minor
---

Enrich Socket.IO call signaling: `consumer_accepted` includes the consumer, `consumer_declined` includes `consumerId`, and `provider_ended` / `consumer_ended` hang-up events are forwarded to the other party. Load a Temporal polyfill so Prisma timestamptz codecs work on Node 24.
