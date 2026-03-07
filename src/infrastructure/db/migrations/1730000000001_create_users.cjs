/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      notNull: true
    },
    first_name: {
      type: 'text',
      notNull: true
    },
    last_name: {
      type: 'text',
      notNull: true
    },
    birthday: {
      type: 'date',
      notNull: true
    },
    timezone: {
      type: 'text',
      notNull: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    deleted_at: {
      type: 'timestamptz'
    }
  });

  pgm.createIndex('users', ['deleted_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
