/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.dropConstraint('notification_occurrences', 'notification_occurrences_status_check');
  pgm.addConstraint('notification_occurrences', 'notification_occurrences_status_check', {
    check: "status IN ('pending', 'enqueued', 'processing', 'sent', 'failed')"
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('notification_occurrences', 'notification_occurrences_status_check');
  pgm.addConstraint('notification_occurrences', 'notification_occurrences_status_check', {
    check: "status IN ('pending', 'enqueued', 'sent', 'failed')"
  });
};
