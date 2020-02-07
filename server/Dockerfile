FROM maichong/node:12.13.0

WORKDIR /app

COPY . /app

RUN yarn install --production --ignore-optional

CMD node index.js

EXPOSE 37017
