FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false
ARG NEXT_PUBLIC_TTS_MODE=server
ARG NEXT_PUBLIC_SUPERTONIC_ONNX_MODEL_URL=/models/supertonic/model.onnx
ARG NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_DIAGNOSTICS_ENABLED=$NEXT_PUBLIC_DIAGNOSTICS_ENABLED
ENV NEXT_PUBLIC_TTS_MODE=$NEXT_PUBLIC_TTS_MODE
ENV NEXT_PUBLIC_SUPERTONIC_ONNX_MODEL_URL=$NEXT_PUBLIC_SUPERTONIC_ONNX_MODEL_URL
ENV NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL=$NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web apps/web

RUN npm --workspace apps/web run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin nextjs

COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/public ./apps/web/public

EXPOSE 3000
USER nextjs
CMD ["sh", "-c", "if [ -n \"$WEB_PORT\" ]; then export PORT=\"$WEB_PORT\"; else export PORT=\"${PORT:-3000}\"; fi; exec node apps/web/server.js"]
