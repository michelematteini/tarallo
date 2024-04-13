#!/bin/sh

cd /tmp
exec s6-setuidgid www-data \
	caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
