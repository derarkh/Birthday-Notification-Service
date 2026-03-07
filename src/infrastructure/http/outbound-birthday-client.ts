import type { OutboundBirthdayClient } from '../../app/worker/worker-service.js';

export interface OutboundBirthdayClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export class HttpOutboundBirthdayClient implements OutboundBirthdayClient {
  private readonly baseUrl: string;

  private readonly timeoutMs: number;

  public constructor(config: OutboundBirthdayClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  public async sendBirthdayMessage(message: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ message }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Outbound HTTP call failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
