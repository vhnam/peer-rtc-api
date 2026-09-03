import type {
  ConsultRequestActor,
  RuleResult,
} from '../consult-requests/consult-request.types.js';
import type { CallSessionRow, CallSignalEvent } from './call-session.types.js';

type ConsultForCall = {
  id: string;
  consumerId: string;
  providerId: string | null;
  status: string;
};

export function canAccessCall(
  actor: ConsultRequestActor,
  consult: ConsultForCall,
): boolean {
  if (consult.status !== 'accepted') {
    return false;
  }
  if (actor.role === 'consumer') {
    return consult.consumerId === actor.id;
  }
  return consult.providerId === actor.id;
}

export function planCallSignal(
  actor: ConsultRequestActor,
  consult: ConsultForCall,
  event: CallSignalEvent,
  call: CallSessionRow | null,
): RuleResult<true> {
  if (consult.status !== 'accepted') {
    return {
      ok: false,
      status: 409,
      message:
        'Call signaling is only available for an accepted consult request',
    };
  }
  if (!canAccessCall(actor, consult)) {
    return { ok: false, status: 404, message: 'Consult request not found' };
  }

  if (event === 'provider_joined') {
    if (actor.role !== 'provider' || actor.id !== consult.providerId) {
      return {
        ok: false,
        status: 403,
        message: 'Only the assigned provider can start the call',
      };
    }
    if (call && call.status !== 'pending' && call.status !== 'accepted') {
      return {
        ok: false,
        status: 409,
        message: 'Call is no longer open',
      };
    }
    return { ok: true, value: true };
  }

  if (event === 'consumer_not_pickup') {
    if (actor.role !== 'provider' || actor.id !== consult.providerId) {
      return {
        ok: false,
        status: 403,
        message: 'Only the assigned provider can report a missed pickup',
      };
    }
    if (!call) {
      return {
        ok: false,
        status: 409,
        message: 'Provider has not started the call',
      };
    }
    if (call.status !== 'pending') {
      return {
        ok: false,
        status: 409,
        message: 'Call is no longer pending',
      };
    }
    return { ok: true, value: true };
  }

  if (event === 'provider_ended') {
    if (actor.role !== 'provider' || actor.id !== consult.providerId) {
      return {
        ok: false,
        status: 403,
        message: 'Only the assigned provider can end the call',
      };
    }
    if (!call) {
      return {
        ok: false,
        status: 409,
        message: 'Provider has not started the call',
      };
    }
    if (call.status !== 'pending' && call.status !== 'accepted') {
      return {
        ok: false,
        status: 409,
        message: 'Call is no longer open',
      };
    }
    return { ok: true, value: true };
  }

  if (event === 'consumer_ended') {
    if (actor.role !== 'consumer' || actor.id !== consult.consumerId) {
      return {
        ok: false,
        status: 403,
        message: 'Only the consumer can end the call',
      };
    }
    if (!call) {
      return {
        ok: false,
        status: 409,
        message: 'Provider has not started the call',
      };
    }
    if (call.status !== 'pending' && call.status !== 'accepted') {
      return {
        ok: false,
        status: 409,
        message: 'Call is no longer open',
      };
    }
    return { ok: true, value: true };
  }

  if (!call) {
    return {
      ok: false,
      status: 409,
      message: 'Provider has not started the call',
    };
  }

  if (actor.role !== 'consumer' || actor.id !== call.consumerId) {
    return {
      ok: false,
      status: 403,
      message: 'Only the consumer can accept or decline the call',
    };
  }
  if (call.status !== 'pending' && call.status !== 'accepted') {
    return {
      ok: false,
      status: 409,
      message: 'Call is no longer pending',
    };
  }
  return { ok: true, value: true };
}
