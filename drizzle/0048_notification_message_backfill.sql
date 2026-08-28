UPDATE "system_notifications"
SET "message" = substr("message", char_length("notification_type") + 3)
WHERE starts_with("message", "notification_type" || ': ');
