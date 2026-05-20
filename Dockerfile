FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

RUN apk add --no-cache git

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
