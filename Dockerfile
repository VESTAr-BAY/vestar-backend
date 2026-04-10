FROM node:20 AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20 AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate && npm run build

FROM node:20 AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

RUN npx prisma generate

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "run", "start"]
