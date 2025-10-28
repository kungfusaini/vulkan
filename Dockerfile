FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# --omit=dev prevents installing development dependencies, keeping the final image smaller
RUN npm install --omit=dev
COPY . .

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app /app

# Must match API_PORT
EXPOSE 3000
# IMPORTANT: app.js must be configured to read the API_PORT
CMD ["./entrypoint.sh"]
