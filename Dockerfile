FROM node:6.1
ENV NODE_ENV test
COPY . /tmp/
WORKDIR /tmp/
RUN npm install
CMD node server.js
