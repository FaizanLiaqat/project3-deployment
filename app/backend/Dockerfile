FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# PDF upload directory (will be overridden by EBS mount in production)
RUN mkdir -p /mnt/pdfs

EXPOSE 3001

USER node

CMD ["node", "server.js"]