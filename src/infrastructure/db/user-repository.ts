import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type {
  CreateUserInput,
  PlanningUser,
  UpdateUserInput,
  User,
  UserRepository
} from '../../domain/user.js';

interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  birthday: string;
  timezone: string;
  created_at: Date;
  deleted_at: Date | null;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthday: row.birthday,
    timezone: row.timezone,
    createdAt: row.created_at,
    deletedAt: row.deleted_at
  };
}

export class PostgresUserRepository implements UserRepository {
  public constructor(private readonly pool: Pool) {}

  public async create(input: CreateUserInput): Promise<User> {
    const id = randomUUID();

    const result = await this.pool.query<UserRow>(
      `
      INSERT INTO users (id, first_name, last_name, birthday, timezone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, first_name, last_name, birthday::text AS birthday, timezone, created_at, deleted_at
      `,
      [id, input.firstName, input.lastName, input.birthday, input.timezone]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error('Failed to create user');
    }

    return mapRow(row);
  }

  public async updateById(input: UpdateUserInput): Promise<User | null> {
    const firstName = input.firstName ?? null;
    const lastName = input.lastName ?? null;
    const birthday = input.birthday ?? null;
    const timezone = input.timezone ?? null;

    const result = await this.pool.query<UserRow>(
      `
      UPDATE users
      SET
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        birthday = COALESCE($4::date, birthday),
        timezone = COALESCE($5, timezone)
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING id, first_name, last_name, birthday::text AS birthday, timezone, created_at, deleted_at
      `,
      [input.id, firstName, lastName, birthday, timezone]
    );

    const row = result.rows[0] ?? null;
    return row ? mapRow(row) : null;
  }

  public async findById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `
      SELECT id, first_name, last_name, birthday::text AS birthday, timezone, created_at, deleted_at
      FROM users
      WHERE id = $1
      `,
      [id]
    );

    const row = result.rows[0] ?? null;
    return row ? mapRow(row) : null;
  }

  public async softDeleteById(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE users
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      `,
      [id]
    );

    return result.rowCount > 0;
  }

  public async listActiveForPlanning(input: {
    afterId: string | null;
    limit: number;
  }): Promise<PlanningUser[]> {
    const result = await this.pool.query<{
      id: string;
      birthday: string;
      timezone: string;
    }>(
      `
      SELECT id, birthday::text AS birthday, timezone
      FROM users
      WHERE deleted_at IS NULL
        AND ($1::uuid IS NULL OR id > $1)
      ORDER BY id ASC
      LIMIT $2
      `,
      [input.afterId, Math.max(1, input.limit)]
    );

    return result.rows.map((row) => ({
      id: row.id,
      birthday: row.birthday,
      timezone: row.timezone
    }));
  }
}
