FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY web/package.json ./web/
COPY server/package.json ./server/
COPY prisma ./prisma/
RUN npm install

FROM deps AS build
COPY . .
ENV DATABASE_URL=file:./prisma/build.db
RUN npx prisma generate && npx prisma db push
RUN npm run build -w web
RUN npm run build -w server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache wget
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
