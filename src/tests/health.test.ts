import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app/api/app.js';

describe('health endpoint', () => {
  const app = buildApp();

  afterEach(async () => {
    await app.close();
  });

  it('returns service health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
