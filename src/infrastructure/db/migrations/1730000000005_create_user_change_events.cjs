/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('user_change_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      notNull: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    event_type: {
      type: 'text',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    claimed_at: {
      type: 'timestamptz'
    },
    processed_at: {
      type: 'timestamptz'
    },
    error: {
      type: 'text'
    }
  });

  pgm.addConstraint('user_change_events', 'user_change_events_event_type_check', {
    check: "event_type IN ('created', 'updated', 'deleted')"
  });

  pgm.createIndex('user_change_events', ['processed_at', 'created_at']);
  pgm.createIndex('user_change_events', ['user_id', 'created_at']);

  pgm.createFunction(
    'create_user_change_event',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql'
    },
    `
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO user_change_events (user_id, event_type)
          VALUES (NEW.id, 'created');
        ELSIF TG_OP = 'UPDATE' THEN
          IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            INSERT INTO user_change_events (user_id, event_type)
            VALUES (NEW.id, 'deleted');
          ELSE
            INSERT INTO user_change_events (user_id, event_type)
            VALUES (NEW.id, 'updated');
          END IF;
        END IF;

        RETURN NEW;
      END;
    `
  );

  pgm.createTrigger('users', 'users_change_event_trigger', {
    when: 'AFTER',
    operation: ['INSERT', 'UPDATE'],
    function: 'create_user_change_event',
    level: 'ROW'
  });
};

exports.down = (pgm) => {
  pgm.dropTrigger('users', 'users_change_event_trigger', { ifExists: true });
  pgm.dropFunction('create_user_change_event', [], { ifExists: true });
  pgm.dropTable('user_change_events');
};
