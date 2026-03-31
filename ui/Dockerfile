FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

EXPOSE 5173

# Vite dev server — bind to 0.0.0.0 so it's accessible outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
