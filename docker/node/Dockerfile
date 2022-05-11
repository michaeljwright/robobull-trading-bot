FROM node:16

RUN ["mkdir", "/install"]
ADD ["./package.json", "/install"]

WORKDIR /install

RUN npm install --verbose
ENV NODE_PATH=/install/node_modules

WORKDIR /app

COPY . /app/
