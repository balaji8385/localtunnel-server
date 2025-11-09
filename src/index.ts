#!/usr/bin/env node -r esm

import dotenv from 'dotenv';
dotenv.config();
import log from './utils/logger';

import CreateServer from './server';

const secure = process.env.SECURE === 'true';  // Convert to boolean
let key: string, cert: string;
if(secure){
    key = process.env.HTTPS_KEY;
    cert = process.env.HTTPS_CERT;
    if (!key || !cert) {
        log.error('HTTPS_KEY and HTTPS_CERT environment variables must be set for secure mode.');
        process.exit(1);
    }
}

const secureTunnel = process.env.SECURE_CLIENT_TUNNEL === 'true';  // Convert to boolean
let tls_key: string, tls_cert: string;
if(secure){
    tls_key = process.env.TLS_KEY;
    tls_cert = process.env.TLS_CERT;
    if (!tls_key || !tls_cert) {
        log.error('TLS_KEY and TLS_CERT environment variables must be set for secure tunnel mode.');
        process.exit(1);
    }
}

const port = process.env.PORT ? Number(process.env.PORT) : 80;
const address = process.env.ADDRESS || '0.0.0.0';
const domain = process.env.DOMAIN;
const maxSockets = parseInt(process.env.MAX_SOCKETS || '10', 10);
const range = process.env.RANGE;
const jwtSharedSecret = process.env.JWT_SHARED_SECRET;

const server = CreateServer({
    max_tcp_sockets: maxSockets,
    secure,
    domain,
    range,
    https_options: {
        key,
        cert
    },
    tls_options: {
        key: tls_key,
        cert: tls_cert
    },
    secure_tunnel: secureTunnel,
    jwt_shared_secret: jwtSharedSecret
});

server.listen(port, address, 0, () => {
    log.info(`server listening on port: ${port}`);
});

process.on('SIGINT', () => {
    process.exit();
});

process.on('SIGTERM', () => {
    process.exit();
});

process.on('uncaughtException', (err) => {
    log.error('uncaughtException', err);
});

process.on('unhandledRejection', (err, promise) => {
    log.error('unhandledRejection', err);
});

// vim: ft=javascript

