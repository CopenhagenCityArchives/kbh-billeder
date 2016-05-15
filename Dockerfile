FROM node:6.1
RUN npm install
COPY . /tmp/
WORKDIR /tmp/
CMD node server.js
