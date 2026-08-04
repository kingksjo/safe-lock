"""SafeLock application configuration.

The admin dashboard is protected by a PREBUILT administration password. It is
chosen here (by the operator/developer), never set by the admin in-app, and it
cannot be reset from the UI. It is seeded into the `admin_auth` table as a
salted PBKDF2 hash on first server start.

Hand this password to the admin directly (printed, messaged, on a card).

RECOVERY (operator only, admin has no reset path):
  Delete the `admin_auth` row (or the whole safe.db) and restart the app.
  The default password below is re-seeded on next start.
"""

DEFAULT_ADMIN_PASSWORD = "SafeLock-Admin-2026"
