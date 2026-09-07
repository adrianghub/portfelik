#!/usr/bin/env bash
# Local-only: creates android/upload-keystore.jks + keystore.properties (gitignored)
# and prints the SHA-256 fingerprint for static/.well-known/assetlinks.json.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f upload-keystore.jks || -f keystore.properties ]]; then
  echo "Refusing to overwrite existing upload-keystore.jks / keystore.properties" >&2
  exit 1
fi

STORE_PASS="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
keytool -genkeypair \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASS" -keypass "$STORE_PASS" \
  -dname "CN=JakStoimy, OU=Mobile, O=JakStoimy, L=Warsaw, C=PL"

cat > keystore.properties <<EOF
storeFile=upload-keystore.jks
storePassword=${STORE_PASS}
keyAlias=upload
keyPassword=${STORE_PASS}
EOF
chmod 600 keystore.properties upload-keystore.jks

FINGERPRINT="$(keytool -list -v -keystore upload-keystore.jks -alias upload -storepass "$STORE_PASS" \
  | awk -F'SHA256:' '/SHA256:/{gsub(/^ +| +$/,"",$2); print $2; exit}')"

mkdir -p ../static/.well-known
cat > ../static/.well-known/assetlinks.json <<EOF
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "pl.jakstoimy.app",
      "sha256_cert_fingerprints": ["${FINGERPRINT}"]
    }
  }
]
EOF

echo "Wrote upload-keystore.jks, keystore.properties (gitignored), and static/.well-known/assetlinks.json"
echo "Keep keystore.properties offline; Play App Signing will still need this upload key."
