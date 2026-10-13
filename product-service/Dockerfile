FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3002

ENV PRODUCT_SERVICE_PORT=3002

CMD ["node", "server.js"]
