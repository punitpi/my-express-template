FROM node:22-alpine AS base
RUN apk add --no-cache dumb-init
WORKDIR /application

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /application/node_modules ./node_modules
COPY --from=build /application/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /application/node_modules/prisma ./node_modules/prisma
COPY --from=build /application/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["dumb-init", "sh", "-c", "npx prisma migrate deploy && node server.js"]
