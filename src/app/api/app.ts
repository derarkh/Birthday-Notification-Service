import Fastify, { type FastifyInstance } from 'fastify';

import type { UserRepository } from '../../domain/user.js';
import { isValidDateOnly } from '../../domain/scheduling/date-only.js';
import { canonicalizeTimezone } from '../../domain/scheduling/timezone.js';

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

interface UpdateUserRequestBody {
  id: unknown;
  firstName?: unknown;
  lastName?: unknown;
  birthday?: unknown;
  timezone?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildApp({ userRepository }: BuildAppDependencies): FastifyInstance {
  const app = Fastify({ logger: true });

  app.post<{ Body: CreateUserRequestBody }>('/user', async (request, reply) => {
    const { firstName, lastName, birthday, timezone } = request.body;

    if (!isNonEmptyString(firstName) || !isNonEmptyString(lastName)) {
      return reply.status(400).send({ error: 'firstName and lastName are required strings' });
    }

    if (!isNonEmptyString(birthday) || !isValidDateOnly(birthday)) {
      return reply.status(400).send({ error: 'birthday must be a valid YYYY-MM-DD date' });
    }

    if (!isNonEmptyString(timezone)) {
      return reply.status(400).send({ error: 'timezone is required' });
    }

    const canonicalTimezone = canonicalizeTimezone(timezone);

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

  app.patch<{ Body: UpdateUserRequestBody }>('/user', async (request, reply) => {
    const { id, firstName, lastName, birthday, timezone } = request.body;

    if (!isNonEmptyString(id)) {
      return reply.status(400).send({ error: 'id is required' });
    }

    const updatePayload: {
      firstName?: string;
      lastName?: string;
      birthday?: string;
      timezone?: string;
    } = {};

    if (firstName !== undefined) {
      if (!isNonEmptyString(firstName)) {
        return reply.status(400).send({ error: 'firstName must be a non-empty string when provided' });
      }
      updatePayload.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      if (!isNonEmptyString(lastName)) {
        return reply.status(400).send({ error: 'lastName must be a non-empty string when provided' });
      }
      updatePayload.lastName = lastName.trim();
    }

    if (birthday !== undefined) {
      if (!isNonEmptyString(birthday) || !isValidDateOnly(birthday)) {
        return reply.status(400).send({ error: 'birthday must be a valid YYYY-MM-DD date' });
      }
      updatePayload.birthday = birthday;
    }

    if (timezone !== undefined) {
      if (!isNonEmptyString(timezone)) {
        return reply.status(400).send({ error: 'timezone must be a non-empty string when provided' });
      }
      const canonicalTimezone = canonicalizeTimezone(timezone);
      if (!canonicalTimezone) {
        return reply.status(400).send({ error: 'timezone must be a valid IANA timezone' });
      }
      updatePayload.timezone = canonicalTimezone;
    }

    if (Object.keys(updatePayload).length === 0) {
      return reply.status(400).send({ error: 'at least one field must be provided for update' });
    }

    const updatedUser = await userRepository.updateById({ id, ...updatePayload });
    if (!updatedUser) {
      return reply.status(404).send({ error: 'user not found' });
    }

    return reply.status(200).send({
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      birthday: updatedUser.birthday,
      timezone: updatedUser.timezone
    });
  });

  return app;
}
