import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const certDir = resolve(root, 'certs');
const keyPath = resolve(certDir, 'dev-key.pem');
const certPath = resolve(certDir, 'dev-cert.pem');

const force = process.argv.includes('--force');

if (!force && existsSync(keyPath) && existsSync(certPath)) {
  // Replace legacy OpenSSL self-signed certs with mkcert when available.
  const issuer = spawnSync(
    'openssl',
    ['x509', '-in', certPath, '-noout', '-issuer'],
    { encoding: 'utf8' },
  );
  const isMkcert = issuer.stdout?.includes('mkcert') ?? false;
  const hasMkcert = spawnSync('mkcert', ['-help'], { encoding: 'utf8' }).status === 0;
  if (isMkcert || !hasMkcert) {
    process.exit(0);
  }
  unlinkSync(keyPath);
  unlinkSync(certPath);
}

mkdirSync(certDir, { recursive: true });

const mkcert = spawnSync(
  'mkcert',
  ['-key-file', keyPath, '-cert-file', certPath, 'localhost', '127.0.0.1', '::1'],
  { stdio: 'inherit' },
);

if (mkcert.status === 0) {
  console.log(`Wrote trusted mkcert pair: ${certPath}`);
  process.exit(0);
}

console.warn('mkcert unavailable; falling back to self-signed openssl certs.');

const result = spawnSync(
  'openssl',
  [
    'req',
    '-x509',
    '-nodes',
    '-newkey',
    'rsa:2048',
    '-days',
    '365',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1',
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error('Failed to generate TLS certs.');
  process.exit(result.status ?? 1);
}

console.log(`Wrote self-signed pair: ${certPath}`);
console.log(
  'Browser will show ERR_CERT_AUTHORITY_INVALID until you trust this cert or install mkcert.',
);
