FROM node:20-slim

WORKDIR /app

# system deps for python + builds
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# create venv INSIDE container (not shared volume)
RUN python3 -m venv /opt/venv

# make pip available
ENV PATH="/opt/venv/bin:$PATH"

# install python deps
COPY python/requirements.txt ./python/requirements.txt
RUN pip install --upgrade pip && pip install -r python/requirements.txt

# install node deps
COPY package*.json ./
RUN npm ci

# copy full project
COPY . .

EXPOSE 10085

CMD ["npm", "run", "dev"]
