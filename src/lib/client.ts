import http from 'http';
import https from 'https';
import pump from 'pump';
import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';
import TunnelAgent from './tunnelagent';
import Stream from 'stream';
import log from '../utils/logger';


interface ClientOptions {
  agent: TunnelAgent;
  id: string;
  securityToken: string | null;
}

interface JWTPayload {
  name: string;
  [key: string]: any;
}

class Client extends EventEmitter {
  agent: TunnelAgent;
  id: string;
  securityToken: string | null;
  graceTimeout: NodeJS.Timeout;

  constructor(options: ClientOptions) {
    super();

    this.agent = options.agent;
    this.id = options.id;
    this.securityToken = options.securityToken;

    // Client is given a grace period in which they can connect before they are removed.
    this.graceTimeout = setTimeout(() => {
      this.close();
    }, 1000);
    if (this.graceTimeout.unref) {
      this.graceTimeout.unref();
    }

    this.agent.on('online', () => {
      log.info(`client online ${this.id}`);
      clearTimeout(this.graceTimeout);
    });

    this.agent.on('offline', () => {
      log.info(`client offline ${this.id}`);
      clearTimeout(this.graceTimeout);
      this.graceTimeout = setTimeout(() => {
        this.close();
      }, 1000);
      if (this.graceTimeout.unref) {
        this.graceTimeout.unref();
      }
    });

    // If the agent errors, remove the client.
    this.agent.once('error', (err: Error) => {
      this.close();
    });
  }

  isSecurityTokenEqual(securityToken: string): boolean {
    const decodeJWT = (token: string): JWTPayload | null => {
      return jwt.decode(token.replace(/Bearer /, ''), { complete: false }) as JWTPayload | null;
    };

    if (this.securityToken === null) {
      return false;
    }
    try {
      const decodedStored = decodeJWT(this.securityToken);
      const decodedInput = decodeJWT(securityToken);
      if (!decodedStored || !decodedInput) {
        return false;
      }
      return decodedStored.name === decodedInput.name;
    } catch (error) {
      log.info(`error with jwt ${securityToken}, ${error}`);
      return false;
    }
  }

  stats() {
    return this.agent.stats();
  }

  close(): void {
    clearTimeout(this.graceTimeout);
    this.agent.destroy();
    this.emit('close');
  }

  handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    log.info(`> ${req.url}`);

    // Set up the request options
    const opt: http.RequestOptions = {
      path: req.url,
      agent: this.agent, // TunnelAgent handles the connection (TLS or plain TCP)
      method: req.method,
      headers: req.headers,
    };

    // Forward the incoming HTTP request to the TunnelAgent
    const clientReq = http.request(opt, (clientRes) => {
      log.info(`< ${req.url}`);
      // Write response code and headers
      res.writeHead(clientRes.statusCode || 500, clientRes.headers);
      pump(clientRes, res);
    });

    clientReq.once('error', (err: Error) => {
      log.error(`Error forwarding request to tunnel: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      }
    });

    pump(req, clientReq);
  }

  handleUpgrade(req: http.IncomingMessage, socket: Stream.Duplex, head?: Buffer): void {
    log.info(`> [up] ${req.url}`);
    socket.once('error', (err: NodeJS.ErrnoException) => {
      // These client side errors can happen if the client dies while we are reading.
      // We don't need to surface these in our logs.
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        return;
      }
      console.error(err);
    });

    this.agent.createConnection({}, (err: Error | null, conn?: Stream.Duplex) => {
      log.info(`< [up] ${req.url}`);
      // Any errors getting a connection mean we cannot service this request.
      if (err) {
        socket.end();
        return;
      }

      // The socket may have disconnected while waiting for a connection.
      if ((!socket.readable || !socket.writable) && conn ) {
        conn.destroy();
        socket.end();
        return;
      }

      // For WebSocket requests, re-create the header info and directly pipe the socket data.
      const arr: string[] = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
        arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      arr.push('');
      arr.push('');

      if(conn){
        pump(conn, socket);
        pump(socket, conn);
        conn.write(arr.join('\r\n'));
      }
    });
  }
}

export default Client;
