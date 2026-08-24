# memoria

The browser uses the dedicated `x-memoria-web-token` header for private API
access. Loading this version removes the retired `memoria_pin` local-storage
key and opens connection settings until a new web token is saved. It never
sends the shared `x-app-pin` header.
