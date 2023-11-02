FROM node:lts-alpine

WORKDIR /home/node/app

COPY package*.json ./

RUN npm ci

COPY . .

# environment settings
ENV NODE_ENV="production"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

ENTRYPOINT ["npm", "start"]