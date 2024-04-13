FROM caddy:2-alpine as caddy

FROM php:7-fpm-alpine
EXPOSE 80
VOLUME /var/www/html/boards

RUN apk add --no-cache s6-overlay~3 zlib libpng libjpeg-turbo && \
    apk add --no-cache --virtual .build-deps zlib-dev libpng-dev libjpeg-turbo-dev && \
    docker-php-ext-configure gd --with-jpeg && \
    docker-php-ext-install -j$(nproc) pdo pdo_mysql gd opcache && \
    apk del .build-deps

COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY docker/root/ /
COPY source/ /var/www/html

RUN chown -R www-data:www-data /var/www/html

ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2
HEALTHCHECK --interval=1m CMD ["wget", "-q", "--spider", "http://127.0.0.1"]
ENTRYPOINT ["/init", "/entrypoint.sh"]
