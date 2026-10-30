FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3004

ENV AI_SERVICE_PORT=3004

CMD ["node", "server.js"]

