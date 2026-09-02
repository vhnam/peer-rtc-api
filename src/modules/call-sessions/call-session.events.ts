export const CALL_SOCKET_EVENTS = {
  providerJoined: 'provider_joined',
  consumerAccepted: 'consumer_accepted',
  consumerDeclined: 'consumer_declined',
} as const;

export type CallSocketEvent =
  (typeof CALL_SOCKET_EVENTS)[keyof typeof CALL_SOCKET_EVENTS];
