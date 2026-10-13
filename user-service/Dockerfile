FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

ENV USER_SERVICE_PORT=3001

CMD ["node", "server.js"]
