import { auth } from '../src/modules/auth/auth.js';
import {
  consultRequestDatePrefix,
  nextConsultRequestId,
} from '../src/modules/consult-requests/consult-request.id.js';
import { CONSULT_REQUEST_STATUSES } from '../src/modules/consult-requests/consult-request.types.js';
import { db } from '../src/prisma/db.js';

const consumerEmail =
  process.env.SEED_CONSUMER_EMAIL ?? 'consumer@example.com';
const consumerPassword =
  process.env.SEED_CONSUMER_PASSWORD ?? 'Password123!';
const consumerName = process.env.SEED_CONSUMER_NAME ?? 'Seed Consumer';

const providerEmail =
  process.env.SEED_PROVIDER_EMAIL ?? 'provider@example.com';
const providerPassword =
  process.env.SEED_PROVIDER_PASSWORD ?? 'Password123!';
const providerName = process.env.SEED_PROVIDER_NAME ?? 'Seed Provider';

const NOTE_PREFIX = '[seed]';

type SeedStatus = (typeof CONSULT_REQUEST_STATUSES)[number];

function seedNote(status: SeedStatus): string {
  return `${NOTE_PREFIX} ${status} consult`;
}

async function ensureCredentialUser(input: {
  email: string;
  password: string;
  name: string;
  role: 'consumer' | 'provider';
}) {
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(input.email);
  if (existing) {
    return existing.user;
  }

  const user = await context.internalAdapter.createUser(
    {
      email: input.email,
      name: input.name,
      role: input.role,
      emailVerified: true,
    },
    { method: 'admin' },
  );
  const hashed = await context.password.hash(input.password);
  await context.internalAdapter.createAccount({
    userId: user.id,
    accountId: user.id,
    providerId: 'credential',
    password: hashed,
    issuer: 'local:credential',
  });
  return user;
}

async function allocateRequestId(): Promise<string> {
  const prefix = consultRequestDatePrefix();
  const latest = await db.orm.public.ConsultRequest.select('requestId')
    .where((row) => row.requestId.gte(`${prefix}001`))
    .where((row) => row.requestId.lte(`${prefix}999`))
    .orderBy((row) => row.requestId.desc())
    .first();
  return nextConsultRequestId(latest?.requestId, prefix);
}

async function seedConsultRequest(input: {
  consumerId: string;
  providerId: string;
  status: SeedStatus;
}) {
  const note = seedNote(input.status);
  const existing = await db.orm.public.ConsultRequest.first({ note });
  if (existing) {
    return { created: false, row: existing };
  }

  const now = Temporal.Now.instant();
  const assigned =
    input.status === 'accepted' || input.status === 'closed'
      ? input.providerId
      : null;

  const row = await db.orm.public.ConsultRequest.create({
    id: crypto.randomUUID(),
    requestId: await allocateRequestId(),
    consumerId: input.consumerId,
    providerId: assigned,
    status: input.status,
    note,
    acceptedAt: assigned ? now : null,
    closedAt: input.status === 'closed' ? now : null,
  });
  return { created: true, row };
}

const consumer = await ensureCredentialUser({
  email: consumerEmail,
  password: consumerPassword,
  name: consumerName,
  role: 'consumer',
});
const provider = await ensureCredentialUser({
  email: providerEmail,
  password: providerPassword,
  name: providerName,
  role: 'provider',
});

const results = [];
for (const status of CONSULT_REQUEST_STATUSES) {
  const result = await seedConsultRequest({
    consumerId: consumer.id,
    providerId: provider.id,
    status,
  });
  results.push({
    created: result.created,
    id: result.row.id,
    requestId: result.row.requestId,
    status: result.row.status,
    note: result.row.note,
    providerId: result.row.providerId,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      consumer: { id: consumer.id, email: consumer.email },
      provider: { id: provider.id, email: provider.email },
      requests: results,
    },
    null,
    2,
  ),
);

await db.close();
