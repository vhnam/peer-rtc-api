import { auth } from '../src/modules/auth/auth.js';

const email = process.env.SEED_PROVIDER_EMAIL ?? 'provider@example.com';
const password = process.env.SEED_PROVIDER_PASSWORD ?? 'Password123!';
const name = process.env.SEED_PROVIDER_NAME ?? 'Seed Provider';

const context = await auth.$context;
const existing = await context.internalAdapter.findUserByEmail(email);

if (existing) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        created: false,
        email: existing.user.email,
        role: existing.user.role,
        id: existing.user.id,
        message: 'Provider account already exists',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const user = await context.internalAdapter.createUser(
  {
    email,
    name,
    role: 'provider',
    emailVerified: true,
  },
  { method: 'admin' },
);

const hashed = await context.password.hash(password);
await context.internalAdapter.createAccount({
  userId: user.id,
  accountId: user.id,
  providerId: 'credential',
  password: hashed,
  issuer: 'local:credential',
});

console.log(
  JSON.stringify(
    {
      ok: true,
      created: true,
      email: user.email,
      role: user.role,
      id: user.id,
      password,
      login: {
        url: 'https://localhost:8080/api/auth/sign-in/email',
        origin: 'https://localhost:4000',
        body: { email, password, role: 'provider' },
      },
    },
    null,
    2,
  ),
);
