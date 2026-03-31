#!/bin/sh
# Generate htpasswd from environment variable
if [ -n "$CHARTERIS_UI_PASSWORD" ]; then
    echo "charteris:$(echo -n "$CHARTERIS_UI_PASSWORD" | openssl passwd -apr1 -stdin)" > /etc/nginx/.htpasswd
else
    # No password set — remove auth requirement
    sed -i '/auth_basic/d' /etc/nginx/conf.d/default.conf
fi

exec "$@"
