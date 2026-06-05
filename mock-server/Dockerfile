FROM node:22.19.0-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 9001

CMD ["node", "server.js"]
