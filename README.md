# memoria

The browser uses the dedicated `x-memoria-web-token` header for private API
access. During a controlled transition only, an existing `memoria_pin` value
is kept as an `x-app-pin` fallback until the user saves the new web token; the
old local-storage key is then removed.
