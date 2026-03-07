/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('notification_occurrences', {
    id: {
      type: 'uuid',
      primaryKey: true,
      notNull: true
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    occasion_type: {
      type: 'text',
      notNull: true
    },
    local_occurrence_date: {
      type: 'date',
      notNull: true
    },
    due_at_utc: {
      type: 'timestamptz',
      notNull: true
    },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending'
    },
    idempotency_key: {
      type: 'text',
      notNull: true
    },
    enqueued_at: {
      type: 'timestamptz'
    },
    sent_at: {
      type: 'timestamptz'
    },
    last_error: {
      type: 'text'
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  pgm.addConstraint('notification_occurrences', 'notification_occurrences_status_check', {
    check: "status IN ('pending', 'enqueued', 'sent', 'failed')"
  });

  pgm.addConstraint('notification_occurrences', 'notification_occurrences_logical_unique', {
    unique: ['user_id', 'occasion_type', 'local_occurrence_date']
  });

  pgm.addConstraint('notification_occurrences', 'notification_occurrences_idempotency_key_unique', {
    unique: ['idempotency_key']
  });

  pgm.createIndex('notification_occurrences', ['due_at_utc']);
  pgm.createIndex('notification_occurrences', ['status']);
};

exports.down = (pgm) => {
  pgm.dropTable('notification_occurrences');
};
