# Production deployment

Deployed on 2026-10-17. Only the backend is hosted by this deployment.

- Server: `62.72.58.29`
- Backend health: `https://fahimstack.tech/nkr`
- Client API base: `https://fahimstack.tech/nkr/api`
- Versioned API base: `https://fahimstack.tech/nkr/api/v1`
- Application directory: `/var/www/nkr-backend`
- Internal listener: `127.0.0.1:5010`
- Service: `nkr-backend.service`, runs as `nkr`, enabled at boot and restarts on failure
- Environment: `/var/www/nkr-backend/.env`, permissions `600`, owned by `nkr`

Nginx strips `/nkr/` before forwarding to the backend. Both `/nkr` and `/nkr/` return the backend health response. Existing domain routes remain available.

## Operations

```sh
systemctl status nkr-backend
journalctl -u nkr-backend -n 100 --no-pager
systemctl restart nkr-backend
curl --fail https://fahimstack.tech/nkr
```

The service uses the configured MongoDB, SMTP, and Cloudinary credentials; production token secrets were generated on the server. No database seeding was performed.

Nginx configuration:

- `/etc/nginx/sites-available/fahimstack.tech` (resolved from the enabled-site symlink)
- `/etc/nginx/snippets/nkr-backend.conf`
- `/etc/nginx/snippets/nkr-proxy-headers.conf`
- Previous site configuration: `/root/fahimstack.tech.before-nkr-20261017T082851Z`

## Validation

All 16 existing backend tests passed before publication. HTTPS health, database-backed category retrieval, legacy app settings, and unauthenticated protected-route rejection were verified. The domain's existing root page continued to return HTTP 200.

For code updates, install production dependencies with `npm ci --omit=dev` in the application directory, retain the server environment file, ensure application files are readable by `nkr`, then restart `nkr-backend` and check its logs and public health endpoint.
