# Demo identity belongs to the browser profile or Android installation

A dedicated demo is resumed through Supabase Auth, not by trusting a stored UID.
Its refresh credential survives closing demo and logging out of a separate real
account. Switching identities uses a pending payload and hard navigation;
financial queries start with a new QueryClient. No provisioning or Turnstile is
needed when resuming an existing identity. First creation still requires Turnstile.

The demo menu says **Zamknij demo**, and login offers **Wróć do mojego demo**.
Closing parks demo, removes active GoTrue storage and parked real credentials,
then reloads login. It does not delete the account or its data. Normal real
logout revokes real Auth and removes real credentials while preserving the
independent parked demo. Browser closure keeps the existing active session.

A separate identity marker survives expired/revoked credentials. It grants no
access. Missing credentials, failed refresh, a different returned identity or
unreadable storage must not fall through to creating a replacement demo. Web
Locks serialize demo entry across tabs where supported. Successful provisioning
binds its returned UID before OTP verification, so an OTP failure cannot silently
create another identity on retry.

## Credential storage

Browser profiles use existing local storage, subject to the application's
script-origin boundary. Android uses the registered `AuthVault` Capacitor plugin
and an asynchronous Supabase Auth storage adapter. The plugin encrypts the Auth
map with AES-GCM and a non-exportable Android Keystore key. It writes atomically
into `getNoBackupFilesDir()`. JavaScript keeps the decrypted map only in memory
and flushes writes before hard navigation.

On upgrade, an empty native vault imports existing WebView Auth entries. Plaintext
is removed only after encrypted persistence succeeds. Native read, decryption or
write failure stays an error; it never resets the identity or falls back to
plaintext storage. Initialization precedes pending restoration and demo entry.

Android disables backup and excludes app data from cloud backup and device
transfer. A missing installation key cannot decrypt restored vault data; this
fails closed. Clearing app data or uninstalling generally loses local demo
access. Browser and Android identities are independent. No cross-device recovery
or destructive reset is introduced.

## Required device verification

Use a controlled staging build. Record the same Auth UID before and after each
return and verify zero calls to `open-demo-account` on resume:

- Kill/restart the app and reboot the device.
- Close demo, reopen it, then repeat after restarting the app.
- Demo → Real → Demo, with isolation and preserved sample data.
- Log out of real, confirm real is signed out, then resume demo.
- Expired access token refreshes; revoked refresh token reports an error and
  never creates a new account.
- Upgrade migrates legacy credentials, leaving no plaintext Auth entries.
- Keystore/decryption/write failure fails closed.
- Clear app data; verify previous credentials are gone. Check backup/restore
  and uninstall/reinstall behavior without assuming OEM transfer semantics.

Mocked browser tests and bridge mocks do not establish physical Android PASS.
