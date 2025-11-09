import express, { Request, Response, NextFunction } from 'express';
import tldts from 'tldts';
import logger from './utils/logger';
import * as http from 'http';
import * as https from 'https';
import humanId from "human-id"
import Jwt from 'express-jwt';
import ClientManager from './lib/clientmanager';
import { readFileSync } from 'fs';

const debug = logger.info

export interface ServerOptions {
  domain?: string;
  landing?: string;
  jwt_shared_secret?: string | null;
  secure?: boolean;
  secure_tunnel?: boolean;
  https_options?: {
    key: string;
    cert: string;
  };
  tls_options?: {
    key: string;
    cert: string;
  };
  max_tcp_sockets? : number,
  range?: string | null
}

function addJwtMiddleware(app: express.Application, opt: ServerOptions): void {
  // Using express-jwt; note that you might need to adjust options such as 'algorithms'
  app.use(
    Jwt.expressjwt({
      secret: opt.jwt_shared_secret!,
      algorithms: ['HS256']
    })
  );
}

export default function(opt: ServerOptions = {}): http.Server {
  const validHosts = opt.domain ? [opt.domain] : undefined;

  // Extract subdomain from hostname to use as client id.
  function getClientIdFromHostname(hostname: string) {
    if(hostname.includes("localhost")) hostname = hostname.replace("localhost", "localhost.com")
    return tldts.getSubdomain(hostname, { validHosts});
  }

  const manager = new ClientManager(opt);
  const schema = opt.secure ? 'https' : 'http';

  const app = express();

  if (opt.jwt_shared_secret) {
    addJwtMiddleware(app, opt);
  }

  // API endpoint: overall server status.
  app.get('/api/status', (req: Request, res: Response) => {
    const stats = manager.stats;
    res.json({
      tunnels: stats.tunnels,
      mem: process.memoryUsage(),
    });
  });

  // API endpoint: status for a specific tunnel.
  app.get('/api/tunnels/:id/status', (req: Request, res: Response) : any => {
    const clientId = req.params.id;
    const client = manager.getClient(clientId);
    if (!client) {
      res.statusCode = 404;
      return res.send()
    }
    const stats = client.stats();
    return res.json({
      connected_sockets: stats.connectedSockets,
    });
  });

  // API endpoint: disconnect a specific tunnel.
  app.get('/api/tunnels/:id/kill', (req: Request, res: Response): any => {
    const clientId = req.params.id;
    if (!opt.jwt_shared_secret) {
      debug(`disconnecting client with id ${clientId}, error: jwt_shared_secret is not used`, clientId);
      return res.status(403).json({ success: false, message: 'jwt_shared_secret is not used' });
    }
    else if(!req.headers.authorization) {
      return res.status(403).json({ success: false, message: 'authorization header is required' });
    }

    if (!manager.hasClient(clientId)) {
      debug(`disconnecting client with id ${clientId}, error: client is not connected`);
      return res.status(404).json({ success: false, message: `client with id ${clientId} is not connected` });
    }

    const securityToken = req.headers.authorization;

    if (!manager.getClient(clientId)?.isSecurityTokenEqual(securityToken)) {
      debug(`disconnecting client with id ${clientId}, error: securityToken is not equal`);
      return res.status(403).json({
        success: false,
        message: `client with id ${clientId} does not have the same securityToken as provided`
      });
    }

    debug(`disconnecting client with id ${clientId}`);
    manager.removeClient(clientId);
    res.status(200).json({
      success: true,
      message: `client with id ${clientId} is disconnected`
    });
  });

  // Root endpoint: create a new client if query "new" is provided, otherwise redirect.
  app.get('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const subdomain = req.query.subdomain as string;
    // if(req.query.new){
      const reqId = subdomain ?? humanId({ capitalize: false});
      debug(`making new client with id ${reqId}`);
      try {
        const info = await manager.newClient({id:
          reqId,
          // TODO: THis may not be necessay
          isSecureTunnel: opt.secure_tunnel || req.query.https ? true : false,
          securityToken: opt.jwt_shared_secret ? req.headers.authorization as string : null,
          tlsOptions : {
            key: opt.tls_options?.key ? readFileSync(opt.tls_options.key, "utf-8") : undefined,
            cert: opt.tls_options?.cert ? readFileSync(opt.tls_options.cert, "utf-8") : undefined,
        }
      });
        info.url = `${schema}://${info.id}.${req.headers.host}`;
        res.json(info);
      } catch (error) {
        next(error);
      }
      return;
    // }
    // return res.send("PAss new query for new connection")
  });

  // Backwards compatibility: handle requests for a specific client subdomain.
  app.get('/:clientId', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const reqId = req.params.clientId;
    const validSubdomainRegex = /^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/;
    if (!validSubdomainRegex.test(reqId)) {
      return res.status(403).json({
        message: 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.'
      });
    }
    debug(`making new client with id ${reqId}`);
    try {
      const info = await manager.newClient({
        id: reqId,
        isSecureTunnel: opt.secure_tunnel || req.query.https ? true : false,
        securityToken: opt.jwt_shared_secret ? req.headers.authorization as string : null,
        tlsOptions : {
          key: opt.tls_options?.key ? readFileSync(opt.tls_options.key) : undefined,
          cert: opt.tls_options?.cert ? readFileSync(opt.tls_options.cert) : undefined,
      }
    });
      info.url = `${schema}://${info.id}.${req.headers.host}`;
      res.json(info);
    } catch (error) {
      next(error);
    }
  });

  //TODO: Enhancement note
  app.get("/api/start-tunnel", async (req, res): Promise<any> => {
    const localPort = req.query.port;
    if (!localPort) {
      return res.status(400).send("Missing ?port=");
    }
    const reqId = humanId({ capitalize: false});
    debug(`making new client with id ${reqId}`);
    try {
      const info = await manager.newClient({id:
        reqId,
        // TODO: THis may not be necessay
        isSecureTunnel: opt.secure_tunnel || req.query.https ? true : false,
        securityToken: opt.jwt_shared_secret ? req.headers.authorization as string : null,
        tlsOptions : {
          key: opt.tls_options?.key ? readFileSync(opt.tls_options.key, "utf-8") : undefined,
          cert: opt.tls_options?.cert ? readFileSync(opt.tls_options.cert, "utf-8") : undefined,
      }
    });
      info.url = `${schema}://${info.id}.${req.headers.host}`;

    const sshCommand = `ssh -o StrictHostKeyChecking=no -R ${info.port}:localhost:${localPort} tunnel@localhost:6004`;
    const publicUrl = `${info.url}`;
  
  
    res.set("Content-Type", "text/x-shellscript");
    res.send(`#!/bin/bash
  
  echo \"Tunnel URL: ${publicUrl}\"
  ${sshCommand}`);
    } catch (error) {
      debug(`Error creating new client: ${error.message}`);
      res.status(500).send("Internal Server Error");
    }
  });

  // Adding client handler to original route
  const clientHandler = (req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) => {
    const hostname = req.headers.host;
    if (!hostname) {
      res.statusCode = 400;
      res.end('Host header is required');
      return;
    }
    const clientId = getClientIdFromHostname(hostname);
    if (!clientId) {
      // If no subdomain client id is found, let Express handle the request.
      return app(req, res);
    }
    console.log(clientId)
    const client = manager.getClient(clientId);
    if (!client) {
      res.statusCode = 404;
      res.end('404');
      return;
    }
    client.handleRequest(req, res);
  }
  // Create a custom HTTP server to integrate Express with raw request/upgrade events.
  // const server = http.createServer(clientHandler);
  logger.info("Secure: " + opt.secure)
  const server = opt.secure
  ? https.createServer(
      {
        key: readFileSync(opt.https_options!.key),
        cert: readFileSync(opt.https_options!.cert),
      },
      clientHandler
    )
  : http.createServer(clientHandler);


  // Handle upgrade events (e.g., WebSocket connections).
  server.on('upgrade', (req: http.IncomingMessage, socket) => {
    const hostname = req.headers.host;
    if (!hostname) {
      socket.destroy();
      return;
    }
    const clientId = getClientIdFromHostname(hostname);
    if (!clientId) {
      socket.destroy();
      return;
    }
    const client = manager.getClient(clientId);
    if (!client) {
      socket.destroy();
      return;
    }
    client.handleUpgrade(req, socket);
  });

  return server;
}
