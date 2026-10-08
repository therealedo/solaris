# Builds the whole Solaris stack from this repository's source, so forks can be
# self hosted without the upstream published images.

FROM node:24 AS build

WORKDIR /solaris

COPY package.json package-lock.json ./
COPY common/package.json common/
COPY map-rendering/package.json map-rendering/
COPY client/package.json client/
COPY server/package.json server/

RUN npm ci --ignore-scripts

COPY common/ common/
COPY map-rendering/ map-rendering/
COPY client/ client/
COPY server/ server/

RUN rm -f server/.env && npm run build

FROM build AS api
WORKDIR /solaris/server
CMD ["npm", "run", "start-api:prod"]

FROM build AS jobs
WORKDIR /solaris/server
CMD ["npm", "run", "start-jobs:prod"]

FROM nginx:1.29-alpine AS client
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/prod/client/solaris.conf /etc/nginx/conf.d/solaris.conf
COPY --from=build /solaris/client/dist /usr/share/nginx/html
EXPOSE 8080
