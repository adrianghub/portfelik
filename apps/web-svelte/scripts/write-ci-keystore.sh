#!/usr/bin/env bash
# Decode Production GitHub secrets into android/upload-keystore.jks + keystore.properties.
# Trims secret whitespace, rejects a non-keystore payload, and checks the store password
# with keytool so Gradle does not fail 90s later with a redacted "password was incorrect".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

trim() {
  printf '%s' "$1" | tr -d '\r\n'
}

: "${ANDROID_UPLOAD_KEYSTORE_BASE64:?}"
: "${ANDROID_KEYSTORE_PASSWORD:?}"
: "${ANDROID_KEY_ALIAS:?}"
: "${ANDROID_KEY_PASSWORD:?}"

b64="$(printf '%s' "$ANDROID_UPLOAD_KEYSTORE_BASE64" | tr -d '[:space:]')"
store_pass="$(trim "$ANDROID_KEYSTORE_PASSWORD")"
key_pass="$(trim "$ANDROID_KEY_PASSWORD")"
alias="$(trim "$ANDROID_KEY_ALIAS")"
keytool_bin="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"

umask 077
printf '%s' "$b64" | base64 -d > android/upload-keystore.jks
if [[ ! -s android/upload-keystore.jks ]]; then
  echo "::error::Decoded ANDROID_UPLOAD_KEYSTORE_BASE64 is empty. Re-copy upload-keystore.jks as a single-line base64." >&2
  exit 1
fi

magic="$(od -An -tx1 -N2 android/upload-keystore.jks | tr -d ' \n')"
case "$magic" in
  feed | 3082) ;;
  *)
    echo "::error::ANDROID_UPLOAD_KEYSTORE_BASE64 did not decode to a JKS/PKCS12 keystore (first bytes ${magic}). Re-encode android/upload-keystore.jks." >&2
    exit 1
    ;;
esac

if ! "$keytool_bin" -list -keystore android/upload-keystore.jks -storepass "$store_pass" -alias "$alias" >/dev/null; then
  echo "::error::ANDROID_KEYSTORE_PASSWORD does not open the decoded JKS. Copy storePassword from android/keystore.properties with no extra spaces or quotes." >&2
  exit 1
fi

{
  printf 'storeFile=upload-keystore.jks\n'
  printf 'storePassword=%s\n' "$store_pass"
  printf 'keyAlias=%s\n' "$alias"
  printf 'keyPassword=%s\n' "$key_pass"
} > android/keystore.properties
chmod 600 android/upload-keystore.jks android/keystore.properties
