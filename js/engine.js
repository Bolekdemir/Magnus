// Stockfish 17.1 (lite, single-threaded WASM) running in a Web Worker.
// One engine, one job at a time. Jobs are queued; a cancelled job is skipped.

export class Engine {
  constructor(url = 'vendor/stockfish.js') {
    this.url = url;
    this.queue = Promise.resolve();
    this.lineHandler = null;
    this.status = 'loading';
    this.ready = this._boot();
  }

  _boot() {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = new Worker(this.url);
      } catch (e) {
        this.status = 'error';
        reject(e);
        return;
      }
      this.worker = worker;
      const timer = setTimeout(() => {
        this.status = 'error';
        reject(new Error('The chess engine took too long to start.'));
      }, 25000);
      worker.onerror = (e) => {
        clearTimeout(timer);
        this.status = 'error';
        reject(new Error(e.message || 'The chess engine failed to start.'));
      };
      worker.onmessage = (e) => {
        const text = typeof e.data === 'string' ? e.data : String(e.data);
        for (const line of text.split('\n')) {
          if (!line) continue;
          if (line === 'uciok') this._send('isready');
          else if (line === 'readyok' && this.status === 'loading') {
            clearTimeout(timer);
            this.status = 'ready';
            resolve(this);
          }
          if (this.lineHandler) this.lineHandler(line);
        }
      };
      this._send('uci');
    });
  }

  _send(cmd) {
    this.worker.postMessage(cmd);
  }

  // Analyse a position. Scores are from the side-to-move's point of view.
  // opts: {depth, movetime, multipv, elo (null = full strength), token}
  analyze(fen, opts = {}) {
    const job = this.queue.then(() => this._run(fen, opts));
    this.queue = job.catch(() => {});
    return job;
  }

  async _run(fen, { depth = 14, movetime = null, multipv = 1, elo = null, token = null, onInfo = null } = {}) {
    await this.ready;
    if (token && token.cancelled) throw new Error('cancelled');
    return new Promise((resolve) => {
      const lines = [];
      let lastDepth = 0;
      this.lineHandler = (line) => {
        if (line.startsWith('info') && line.includes(' pv ')) {
          const d = +(/ depth (\d+)/.exec(line) || [0, 0])[1];
          const mp = +(/ multipv (\d+)/.exec(line) || [0, 1])[1];
          const sc = / score (cp|mate) (-?\d+)/.exec(line);
          if (!sc) return;
          const score = sc[1] === 'cp' ? { cp: +sc[2] } : { mate: +sc[2] };
          if (/ (lowerbound|upperbound)/.test(line)) return;
          lines[mp - 1] = { score, pv: line.split(' pv ')[1].trim().split(' '), depth: d };
          if (mp === 1 && d > lastDepth) { lastDepth = d; onInfo && onInfo(lines[0]); }
        } else if (line.startsWith('bestmove')) {
          this.lineHandler = null;
          const best = line.split(' ')[1];
          const out = lines.filter(Boolean);
          if (!out.length && best && best !== '(none)') out.push({ score: { cp: 0 }, pv: [best], depth: 0 });
          resolve({ lines: out, bestmove: best, depth: lastDepth });
        }
      };
      if (elo) {
        this._send('setoption name UCI_LimitStrength value true');
        this._send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`);
      } else {
        this._send('setoption name UCI_LimitStrength value false');
      }
      this._send(`setoption name MultiPV value ${multipv}`);
      this._send(`position fen ${fen}`);
      let go = 'go';
      if (depth) go += ` depth ${depth}`;
      if (movetime) go += ` movetime ${movetime}`;
      this._send(go);
    });
  }

  stop() {
    if (this.worker) this._send('stop');
  }

  newGame() {
    const job = this.queue.then(async () => {
      await this.ready;
      this._send('ucinewgame');
    });
    this.queue = job.catch(() => {});
    return job;
  }
}

let shared = null;
export function engine() {
  if (!shared) shared = new Engine();
  return shared;
}
