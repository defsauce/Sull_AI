#!/usr/bin/env node
/**
 * Loads PEM files into process env for local docker/dev launches.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const privateKey = readFileSync(resolve(root, 'infra/docker/secrets/jwt-private.pem'), 'utf8');
const publicKey = readFileSync(resolve(root, 'infra/docker/secrets/jwt-public.pem'), 'utf8');

const envPath = resolve(root, 'infra/docker/.env');
const contents = [
  `IDENTITY_JWT_PRIVATE_KEY_PEM=${JSON.stringify(privateKey)}`,
  `IDENTITY_JWT_PUBLIC_KEY_PEM=${JSON.stringify(publicKey)}`,
  '',
].join('\n');

writeFileSync(envPath, contents, 'utf8');
console.warn(`Wrote ${envPath}`);
