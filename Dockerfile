FROM node:6.1
ENV NODE_ENV beta
COPY . /tmp/
WORKDIR /tmp/
RUN npm install --silent
CMD node server.js
