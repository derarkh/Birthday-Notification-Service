import Fastify, { type FastifyInstance } from 'fastify';

import type { UserRepository } from '../../domain/user.js';

interface BuildAppDependencies {
  userRepository: UserRepository;
}

interface CreateUserRequestBody {
  firstName: unknown;
  lastName: unknown;
  birthday: unknown;
  timezone: unknown;
}

interface DeleteUserRequestBody {
  id: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateBirthdayDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function normalizeTimezone(value: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function buildApp({ userRepository }: BuildAppDependencies): FastifyInstance {
  const app = Fastify({ logger: true });

  app.post<{ Body: CreateUserRequestBody }>('/user', async (request, reply) => {
    const { firstName, lastName, birthday, timezone } = request.body;

    if (!isNonEmptyString(firstName) || !isNonEmptyString(lastName)) {
      return reply.status(400).send({ error: 'firstName and lastName are required strings' });
    }

    if (!isNonEmptyString(birthday) || !validateBirthdayDateOnly(birthday)) {
      return reply.status(400).send({ error: 'birthday must be a valid YYYY-MM-DD date' });
    }

    if (!isNonEmptyString(timezone)) {
      return reply.status(400).send({ error: 'timezone is required' });
    }

    const canonicalTimezone = normalizeTimezone(timezone);

    if (!canonicalTimezone) {
      return reply.status(400).send({ error: 'timezone must be a valid IANA timezone' });
    }

    const user = await userRepository.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthday,
      timezone: canonicalTimezone
    });

    return reply.status(201).send({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      birthday: user.birthday,
      timezone: user.timezone
    });
  });

  app.delete<{ Body: DeleteUserRequestBody }>('/user', async (request, reply) => {
    const { id } = request.body;

    if (!isNonEmptyString(id)) {
      return reply.status(400).send({ error: 'id is required' });
    }

    const deleted = await userRepository.softDeleteById(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'user not found' });
    }

    return reply.status(204).send();
  });

  return app;
}
