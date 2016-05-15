FROM node:6.1
ENV NODE_ENV beta
COPY . /tmp/
WORKDIR /tmp/
CMD node server.js
