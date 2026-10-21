FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 MOTTO_GEMINI_PRIVATE_DIR=/data/private
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
EXPOSE 8080
CMD ["node", "src/server.mjs"]
