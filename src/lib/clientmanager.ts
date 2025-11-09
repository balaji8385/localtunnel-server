import {humanId} from 'human-id'

import Client from './client';
import TunnelAgent from './tunnelagent';
import PortManager from './portmanager';
import { ServerOptions } from "../server";
import log from "../utils/logger";


interface ListenInfo {
  port: number;
}

interface NewClientResult {
  id: string;
  port: number;
  max_conn_count: number;
  url?: string;
}

class ClientManager {
  opt: ServerOptions;
  clients: Map<string, Client>;
  portManager: PortManager;
  stats: { tunnels: number };
  graceTimeout: NodeJS.Timeout | null;

  constructor(opt?: ServerOptions) {
    this.opt = opt || {};

    // Use a Map to associate client ids with Client instances
    this.clients = new Map<string, Client>();

    // Create a PortManager with the provided range (or null)
    this.portManager = new PortManager({ range: this.opt.range || null });

    // Initialize statistics
    this.stats = { tunnels: 0 };

    // Placeholder for a grace timeout if needed (currently not used per-client)
    this.graceTimeout = null;
  }

  // Create a new tunnel (client). If the given id is already in use,
  // a random id is generated.
  // New client is created and added to the map from server request
  async newClient(newClientOptions: {
    id: string,
    isSecureTunnel: boolean,
    tlsOptions? : TunnelAgent['tlsOptions'],
    securityToken: string | null
  }): Promise<NewClientResult> {
    // If the requested id is already used, generate a random one.
    if (this.clients.has(newClientOptions.id)) {
      newClientOptions.id = humanId({ capitalize: false});
    }

    const maxSockets: number = this.opt.max_tcp_sockets || 0;

    // Create a new TunnelAgent for the client.
    const agent = new TunnelAgent({
      portManager: this.portManager,
      clientId: newClientOptions.id,
      isSecureTunnel: newClientOptions.isSecureTunnel, //TODO: HArd coded
      tlsOptions: newClientOptions.tlsOptions,
      maxTcpSockets: 10,
    });

    // Create the client instance.
    const client = new Client({
      id: newClientOptions.id,
      agent,
      securityToken: newClientOptions.securityToken,
    });

    // Add the client to the map immediately to avoid race conditions.
    this.clients.set(newClientOptions.id, client);

    // When the client closes, remove it from the manager.
    client.once('close', () => {
      this.removeClient(newClientOptions.id);
    });

    try {
      const info = await agent.listen() as ListenInfo;
      this.stats.tunnels++;
      log.info(`New listener added at PORT ${info.port}`)
      return {
        id: newClientOptions.id,
        port: info.port,
        max_conn_count: maxSockets,
      };
    } catch (err) {
      this.removeClient(newClientOptions.id);
      // Rethrow the error for upstream handling.
      throw err;
    }
  }

  // Remove the client with the given id.
  removeClient(id: string): void {
    log.info(`removing client: ${id}`);
    const client = this.clients.get(id);
    if (!client) {
      return;
    }
    // Release the port held by the client.
    this.portManager.release(client.agent.port);
    this.stats.tunnels--;
    this.clients.delete(id);
    client.close();
  }

  // Check if a client with the given id exists.
  hasClient(id: string): boolean {
    return this.clients.has(id);
  }

  // Retrieve the client with the given id.
  getClient(id: string): Client | undefined {
    return this.clients.get(id);
  }
}

export default ClientManager;
