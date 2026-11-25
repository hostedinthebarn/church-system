# Deploying church-system

How the proof-of-concept server is built. It is written for any church running this system: nothing here is specific to one congregation, and no address, account ID or secret belongs in this file.

## Shape

- **One small Linux server** (the POC uses a 4 GB shared Linode, Ubuntu 26.04).
- **Nothing listens to the internet.** The host firewall and the provider's firewall drop all inbound traffic except SSH from the maintainer's own address. The site is reached only through a **Cloudflare Tunnel**, which the server dials out to.
- **Apostrophe** runs as an unprivileged system user on `127.0.0.1:3000`.
- **MongoDB** runs on `127.0.0.1:27017` with authorization on, and a database user that owns only the app's database.

## Build steps

1. **SSH: keys only.** Put a file in `/etc/ssh/sshd_config.d/` named so it sorts before `50-cloud-init.conf` (for example `00-keys-only.conf`), with `PasswordAuthentication no`, `KbdInteractiveAuthentication no` and `PermitRootLogin prohibit-password`. Cloud images turn passwords on in that later file.
2. **Firewalls.** At the provider: inbound DROP, allow TCP 22 from the maintainer's address only. On the host: `ufw default deny incoming`, `ufw allow OpenSSH`, `ufw enable`.
3. **Patches.** `unattended-upgrades` with automatic reboot at a quiet hour (`Unattended-Upgrade::Automatic-Reboot "true"` and `Automatic-Reboot-Time`), so security fixes and new kernels actually take effect.
4. **Node.** Apostrophe needs Node `>=22.12.0` (see `package.json`). Ubuntu 26.04's own `nodejs` package (22.22) meets it and is patched with the OS.
5. **MongoDB 8.0.** MongoDB publishes server packages for Ubuntu 24.04 (`noble`) but, as of November 2026, none for 26.04: the `resolute` repository holds only the tools. The `noble` package installs and runs on 26.04, but MongoDB does not support that combination. For anything beyond a demo, use Ubuntu 24.04 or wait for a 26.04 build.
   - Bind to `127.0.0.1` (the package default) and add `security: authorization: enabled` to `/etc/mongod.conf`.
   - Create an admin user and an app user with `dbOwner` on the app's database only. Generate the passwords on the server and keep them in root-only files; never type them into a shell history or a chat.
   - If unattended-upgrades should patch MongoDB, match the repository by suite (`origin=mongodb,suite=noble/mongodb-org/8.0`): its Release file has no Codename, so a codename match never fires.
6. **App user and environment.** A system user with no login shell owns the app. Settings live in an environment file readable only by root and that user (for example `/etc/<site>/env`, mode 640): `APOS_MONGODB_URI`, `APOS_BASE_URL`, and the mail settings in the main README.
7. **Cloudflare Tunnel.** Create the tunnel from a machine already signed in to Cloudflare (`cloudflared tunnel create <name>`), copy only its credentials JSON to the server (mode 600), and point the config's ingress at `http://127.0.0.1:3000`, with `http_status:404` as the catch-all. Install `cloudflared` from Cloudflare's apt repository and run it as a systemd service with `--no-autoupdate`. Add the DNS route only when the site is ready to be public.

## Deploying the app

Not written yet: it arrives with the first deploy. The rules it will follow:

- **Allowlist, never denylist.** Only the files the app needs go to the server; the deploy never copies the repository wholesale.
- **Scan what ships** for secret-shaped text before it leaves, and stop on any hit.
- **Check from outside afterwards:** real pages answer 200, and sensitive paths (`/.git/config`, `/.env`, `package.json` and the like) answer 404 or 403. A deploy isn't done until it's been checked from the public internet.
