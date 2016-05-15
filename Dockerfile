FROM node:6.1
COPY . /tmp/
WORKDIR /tmp/
RUN npm install
CMD node server.js
