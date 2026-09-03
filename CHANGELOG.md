# peer-rtc-api

## Unreleased

### Minor Changes

- Enrich Socket.IO call signaling: `consumer_accepted` includes the consumer, `consumer_declined` includes `consumerId`, and `provider_ended` / `consumer_ended` hang-up events are forwarded to the other party. Load a Temporal polyfill so Prisma timestamptz codecs work on Node 24.

## 0.2.0

### Minor Changes

- cd6d9b2: Add Socket.IO call signaling (`provider_joined`, `consumer_accepted`, `consumer_declined`) keyed by `consultRequestId`. Include the assigned provider on consult-request responses. Limit consult and call statuses to pending, accepted, canceled, and closed.

## 0.1.1

### Patch Changes

- Add GET `/api/consult-requests/:id` so authenticated consumers and providers can fetch a consult request they are allowed to see.

## 0.1.0

### Minor Changes

- d448052: Add consult request APIs for consumers and providers, with Prisma models for consult requests and call sessions. Move auth into `src/modules` and store timestamps as native DateTime values.
