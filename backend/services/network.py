import socket

import config


def lan_ip() -> str | None:
    """The address other devices on this network reach this machine at, if it can be found."""
    if config.SHARE_HOST:
        return config.SHARE_HOST
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            # Connecting a UDP socket sends nothing; it only makes the OS pick the outgoing interface.
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
    except OSError:
        return None  # not on any network
    return None if ip.startswith("127.") else ip
