import datetime

# Thread-safe global state for tracking device activity in-memory
_last_seen = None

def update_last_seen():
    """Updates the last seen timestamp of the device to the current UTC time."""
    global _last_seen
    _last_seen = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

def get_last_seen():
    """Returns the last seen datetime object of the device."""
    return _last_seen
