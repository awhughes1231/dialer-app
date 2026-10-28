FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
