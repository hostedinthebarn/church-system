# The local copy of the app (dev/README.md): Linux and Node 22 like the POC
# server, with the browser the bulletin PDF needs. The code is mounted from
# the checkout, not copied, so edits show without a rebuild.
FROM node:22-bookworm
# Chromium's system libraries, for the bulletin PDF (the server uses Google
# Chrome, which has no Linux arm64 build; Chromium renders the same page).
RUN npx -y playwright@1.65.0 install-deps chromium && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
CMD ["sh", "dev/start.sh"]
