# RigMY web image: the Next.js app (standalone output).
# The WASM engine (src/wasm) is committed, so no Rust toolchain is needed here.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The /api/* rewrite destination is baked in at build time; compose passes the
# service URL. Override with --build-arg RIGMY_API_URL=... for other topologies.
ARG RIGMY_API_URL=http://api:8787
ENV RIGMY_API_URL=$RIGMY_API_URL
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
