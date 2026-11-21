# Works on any container host (Fly.io, Railway, a VPS, ...). Only the web app is included, not the desktop build.
FROM node:22-alpine
WORKDIR /srv
COPY package.json server.js ./
COPY app ./app
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "server.js"]
