# Runs the whole verification gate, or builds a release zip, without installing Node locally.
# From the repo root (PowerShell: use ${PWD} instead of $PWD):
#   docker build -t fugs-audio .
#   docker run --rm fugs-audio                                    # verify (scripts/verify-all.js)
#   docker run --rm -v "$PWD/release:/out" fugs-audio release 2.3.0  # verify, then zip into ./release
# Optional: also test against your MZ project's real engine scripts:
#   docker run --rm -v "/path/to/project/js:/mz:ro" -e RMMZ_JS_DIR=/mz fugs-audio
FROM node:22-bookworm-slim
WORKDIR /repo
COPY . .
ENTRYPOINT ["node", "scripts/docker-entry.js"]
CMD ["verify"]
