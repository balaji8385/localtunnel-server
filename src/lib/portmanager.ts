import log from "../utils/logger";

interface PortManagerOptions {
  range?: string | null;
}

class PortManager {
  range?: string | null;
  first: number;
  last: number;
  pool: { [key: string]: string | null };

  constructor(opt: PortManagerOptions = {}) {
    this.range = opt.range;
    this.first = 0;
    this.last = 0;
    this.pool = {};
    this.initializePool();
  }

  initializePool(): void {
    if (!this.range) {
      return;
    }

    if (!/^[0-9]+:[0-9]+$/.test(this.range)) {
      throw new Error('Bad range expression: ' + this.range);
    }

    [this.first, this.last] = this.range.split(':').map((port) => parseInt(port, 10));

    if (this.first > this.last) {
      throw new Error('Bad range expression min > max: ' + this.range);
    }

    for (let port = this.first; port <= this.last; port++) {
      this.pool['_' + port] = null;
    }

    log.info('Pool initialized ' + JSON.stringify(this.pool));
  }

  release(port: number): void {
    if (this.range === null) {
      return;
    }
    log.info('Release port ' + port);
    this.pool['_' + port] = null;
  }

  getNextAvailable(clientId: string): number | null {
    if (this.range === null) {
      return null;
    }

    for (let portNumber = this.first; portNumber <= this.last; portNumber++) {
      const portKey = `_${portNumber}`;
      if (this.pool[portKey] === null) {
        this.pool[portKey] = clientId;
        return portNumber;
      }
    }

    throw new Error(`No more ports available in range ${this.range}`);
  }
}

export default PortManager;
