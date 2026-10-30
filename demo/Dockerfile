# Regenerates the demo's audio and images (demo/game/) and re-runs the demo tests, without
# installing Node or ffmpeg locally. From the repo root:
#   docker build -t fugs-demo demo
#   docker run --rm -v "$PWD:/repo" fugs-demo
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
CMD ["sh", "-c", "node demo/tools/build-assets.js && node demo/tools/preview.js && node --test scripts/tests/11-demo-game.test.js"]
