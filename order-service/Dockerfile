FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3003

ENV ORDER_SERVICE_PORT=3003

CMD ["node", "server.js"]
