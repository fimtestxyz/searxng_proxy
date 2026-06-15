class Pool {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      const exec = () => {
        this.running++;
        fn().then(resolve, reject).finally(() => {
          this.running--;
          const next = this.queue.shift();
          if (next) next();
        });
      };
      if (this.running < this.concurrency) {
        exec();
      } else {
        this.queue.push(exec);
      }
    });
  }
}

module.exports = { Pool };
