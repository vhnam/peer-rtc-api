---
"peer-rtc-api": minor
---

Add Socket.IO call signaling (`provider_joined`, `consumer_accepted`, `consumer_declined`) keyed by `consultRequestId`. Include the assigned provider on consult-request responses. Limit consult and call statuses to pending, accepted, canceled, and closed.
