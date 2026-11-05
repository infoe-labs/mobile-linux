# SSH WebSocket bridge

A TLS WebSocket-to-TCP bridge for one configured SSH destination. It does not
implement SSH or decrypt the session. The browser must present an access token
and match the configured PWA origin and destination before any TCP dial occurs.

See [deployment, client use and data flows](../../docs/SSH.md) for required local
configuration. Run `npm ci --ignore-scripts`, then `npm start` with the documented
environment variables. No secrets belong in this directory or its Git history.

`npm test` runs the TLS, authorization and binary-forwarding tests (OpenSSL is
required). The browser application and guest SSH tests run from the repository
root. The `ws` dependency's MIT license is included by the repository notices.
