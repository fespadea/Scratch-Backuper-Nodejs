import { sleep } from "./helperFunctions.js";


export class SimpleRateLimiter {
  constructor(interval, tokensPerInterval) {
    this.interval = interval;
    this.tokensPerInterval = tokensPerInterval;
    this.tokensLeft = new Proxy(
      {},
      {
        get: function (target, name) {
          return target.hasOwnProperty(name) ? target[name] : tokensPerInterval;
        },
      }
    );
    this.lastTime = new Proxy(
      {},
      {
        get: function (target, name) {
          return target.hasOwnProperty(name) ? target[name] : 0;
        },
      }
    );
  }

  async removeTokens(tokens, hostname) {
    const timeLeft = this.lastTime[hostname] + this.interval - Date.now();
    if (timeLeft <= 0) {
      this.tokensLeft[hostname] = this.tokensPerInterval;
      this.lastTime[hostname] = Date.now();
    }
    if (tokens <= this.tokensLeft[hostname]) {
      this.tokensLeft[hostname] -= tokens;
    } else {
      const tokensToPass = tokens - this.tokensLeft[hostname];
      this.tokensLeft[hostname] = 0;
      await sleep(timeLeft);
      this.removeTokens(tokensToPass);
    }
  }
}
