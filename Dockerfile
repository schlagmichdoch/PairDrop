# Prepare Nodejs Project
FROM node:18 AS builder

COPY package*.json ./

WORKDIR /home/node/app

RUN npm ci

COPY . .

# Copy build and put it in distroless Image

FROM gcr.io/distroless/nodejs:18

COPY --from=builder /home/node/app /home/node/app

WORKDIR /home/node/app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1
