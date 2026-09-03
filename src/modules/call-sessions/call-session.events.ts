export const CALL_SOCKET_EVENTS = {
  providerJoined: 'provider_joined',
  providerEnded: 'provider_ended',
  consumerAccepted: 'consumer_accepted',
  consumerDeclined: 'consumer_declined',
  consumerEnded: 'consumer_ended',
  consumerNotPickup: 'consumer_not_pickup',
} as const;

export type CallSocketEvent =
  (typeof CALL_SOCKET_EVENTS)[keyof typeof CALL_SOCKET_EVENTS];
