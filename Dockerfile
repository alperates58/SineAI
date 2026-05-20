FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache libstdc++ \
    && apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install --omit=dev \
    && apk del .build-deps

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
