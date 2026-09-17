"""Launcher for mcp-proxy-for-aws-cli that forces IPv4.

The local IPv6 route to CloudFront fronts (aws-mcp.*.api.aws) resets TLS
handshakes most of the time, and Python resolves the AAAA records first,
which makes the proxy fail with MCP error -32603. Patching
socket.getaddrinfo to return only A records fixes the connection.
"""

import socket
import sys

_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_only_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


socket.getaddrinfo = _ipv4_only_getaddrinfo

from mcp_proxy_for_aws.server import main  # noqa: E402

if __name__ == "__main__":
    main()
