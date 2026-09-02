# peer-rtc-api

## 0.1.1

### Patch Changes

- Add GET `/api/consult-requests/:id` so authenticated consumers and providers can fetch a consult request they are allowed to see.

## 0.1.0

### Minor Changes

- d448052: Add consult request APIs for consumers and providers, with Prisma models for consult requests and call sessions. Move auth into `src/modules` and store timestamps as native DateTime values.
