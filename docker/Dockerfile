FROM caddy:2-alpine as caddy

FROM php:7-fpm-alpine
EXPOSE 80

RUN apk add --no-cache s6-overlay~3 && \
    docker-php-ext-install pdo pdo_mysql opcache && \
    mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY docker/root/ /
COPY source/ /var/www/html

RUN chown -R www-data:www-data /var/www/html

ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2
HEALTHCHECK --interval=1m CMD ["wget", "-q", "--spider", "http://127.0.0.1"]
ENTRYPOINT ["/init", "/entrypoint.sh"]
