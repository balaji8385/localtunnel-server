import { Agent, AgentOptions } from 'http';
import net, { Socket, Server } from 'net';
import tls, { TlsOptions } from 'tls';
import log from '../utils/logger';
import PortManager from './portmanager';

const DEFAULT_MAX_SOCKETS = 10;

export interface TunnelAgentOptions {
  clientId: string;
  isSecureTunnel?: boolean;
  portManager?: PortManager;
  maxTcpSockets?: number;
  tlsOptions?: TlsOptions; // Add TLS options for secure connections
}

interface ListenResult {
  port: number;
}

// Implements an http.Agent interface to a pool of tunnel sockets.
// A tunnel socket is a connection from a client that will service HTTP requests.
// This agent is usable wherever an http.Agent is accepted.
class TunnelAgent extends Agent {
  availableSockets: Socket[];
  port: number;
  clientId: string;
  portManager: TunnelAgentOptions['portManager'];
  waitingCreateConn: Array<(err: Error | null, socket?: Socket) => void>;
  connectedSockets: number;
  maxTcpSockets: number;
  server: Server;
  started: boolean;
  closed: boolean;
  isSecureTunnel: boolean;
  tlsOptions?: TlsOptions;

  constructor(options: TunnelAgentOptions) {
    // Pass default options for the Agent.
    super({
      keepAlive: true,
      // only allow keepalive to hold on to one socket,
      // preventing holding on to all sockets so they can be used for upgrades
      maxFreeSockets: 1,
    } as AgentOptions);
    
    if(this.isSecureTunnel && (!this.tlsOptions.key || !this.tlsOptions.cert)) {
      throw new Error('TLS options must include key and cert for HTTPS connections');
    }
    this.availableSockets = [];
    this.port = 3000; // PORT Will be assigned by PORT Manager
    this.clientId = options.clientId;
    this.portManager = options.portManager;
    this.waitingCreateConn = [];
    this.connectedSockets = 0;
    this.maxTcpSockets = options.maxTcpSockets || DEFAULT_MAX_SOCKETS;
    this.isSecureTunnel = options.isSecureTunnel || false;
    this.tlsOptions = options.tlsOptions;
    // Use `tls.createServer` if `isSecureTunnel` is true, otherwise use `net.createServer`
    this.server = this.isSecureTunnel
      ? tls.createServer(this.tlsOptions || {}, this._onConnection.bind(this))
      : net.createServer(this._onConnection.bind(this));

    this.started = false;
    this.closed = false;
  }

  stats() {
    return {
      connectedSockets: this.connectedSockets,
    };
  }

  listen(): Promise<ListenResult> {
    const server = this.server;
    if (this.started) {
      throw new Error('already started');
    }
    this.started = true;

    server.on('close', this._onClose.bind(this));
    server.on('error', (err: NodeJS.ErrnoException) => {
      // These errors happen from killed connections; we don't worry about them.
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        return;
      }
      log.error(err);
    });

    return new Promise<ListenResult>((resolve) => {
      const port = this.portManager ? this.portManager.getNextAvailable(this.clientId) : null;
      server.listen(port, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
        }
        log.info(`${this.isSecureTunnel ? 'secure' : 'unsecure'} tcp server listening on port: ${this.port} (${this.clientId})`);
        resolve({
          port: this.port as number,
        });
      });
    });
  }

  private _onClose(): void {
    this.closed = true;
    log.info('closed tcp socket');
    // Flush any waiting connections.
    for (const conn of this.waitingCreateConn) {
      conn(new Error('closed'));
    }
    this.waitingCreateConn = [];
    this.emit('end');
  }

  // New socket connection from client for tunneling requests to client.
  private _onConnection(socket: Socket): void {
    // No more socket connections allowed.
    if (this.connectedSockets >= this.maxTcpSockets) {
      log.info('no more sockets allowed');
      socket.destroy();
      return;
    }

    socket.once('close', (hadError: boolean) => {
      log.info(`closed socket (error: ${hadError})`);
      this.connectedSockets -= 1;
      // Remove the socket from available list.
      const idx = this.availableSockets.indexOf(socket);
      if (idx >= 0) {
        this.availableSockets.splice(idx, 1);
      }
      log.info(`connected sockets: ${this.connectedSockets}`);
      if (this.connectedSockets <= 0) {
        log.info('all sockets disconnected');
        this.emit('offline');
      }
    });

    // Listen for socket errors.
    socket.once('error', (err: Error) => {
      // We do not log these errors; sessions can drop for many reasons.
      // These errors are not actionable errors for our server.
      if (this.portManager && this.port !== null) {
        this.portManager.release(this.port);
      }
      socket.destroy();
    });

    if (this.connectedSockets === 0) {
      this.emit('online');
    }

    this.connectedSockets += 1;
    const addr = socket.address() as net.AddressInfo;
    let addrStr = '';
    if (typeof addr === 'object' && addr) {
      addrStr = `${addr.address}:${addr.port}`;
    }
    log.info(`new connection from ${addrStr}`);

    // If there are queued callbacks, give this socket now.
    const fn = this.waitingCreateConn.shift();
    if (fn) {
      log.info('giving socket to queued conn request');
      setTimeout(() => {
        fn(null, socket);
      }, 0);
      return;
    }

    // Make socket available for those waiting on sockets.
    this.availableSockets.push(socket);
  }

  // Fetch a socket from the available socket pool for the agent.
  // If no socket is available, queue the callback.
  // cb(err, socket)
  createConnection(options: any, cb: (err: Error | null, socket?: Socket) => void): void {
    if (this.closed) {
      cb(new Error('closed'));
      return;
    }

    log.info('create connection');

    // Try to obtain a socket from the pool.
    const sock = this.availableSockets.shift();

    // If no available sockets, queue the callback.
    if (!sock) {
      this.waitingCreateConn.push(cb);
      log.info(`waiting connected: ${this.connectedSockets}`);
      log.info(`waiting available: ${this.availableSockets.length}`);
      return;
    }

    log.info('socket given');
    cb(null, sock);
  }

  destroy(): void {
    this.server.close();
    super.destroy();
  }
}

export default TunnelAgent;
