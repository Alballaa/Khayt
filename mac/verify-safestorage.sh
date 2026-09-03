#!/usr/bin/env bash
# Confirms that the native app can read the secrets the Electron app wrote.
#
# SafeStorage.swift is held to Electron's byte format by tests, but one link in
# the chain cannot be tested: that the Keychain item really holds the PBKDF2
# password. Checking it means reading a live secret, so it is not in the suite —
# it is this, run by you, on your own machine, printing no secret.
#
#   ./mac/verify-safestorage.sh            # dev store   (~/…/khayt)
#   ./mac/verify-safestorage.sh Khayt      # packaged app store
set -euo pipefail

APP="${1:-khayt}"
STORE="$HOME/Library/Application Support/$APP/khayt-store.json"
[ -f "$STORE" ] || { echo "no store at $STORE"; exit 1; }

echo "store   : $STORE"
echo "keychain: \"$APP Safe Storage\" / \"$APP Key\""
echo
echo "macOS may ask you to allow access. That prompt is the point: a native"
echo "binary has a different code signature from Electron's, so the Keychain"
echo "treats it as a different application and asks once per binary."
echo

security find-generic-password -w -s "$APP Safe Storage" -a "$APP Key" \
| node -e '
  const c = require("crypto"), fs = require("fs");
  let pw = ""; process.stdin.on("data", d => pw += d).on("end", () => {
    const key = c.pbkdf2Sync(pw.trim(), "saltysalt", 1003, 16, "sha1");
    const store = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    let n = 0, ok = 0;
    (function walk(o, path) {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, path + "." + k);
      else if (typeof o === "string" && o.startsWith("__enc__")) {
        n++;
        const raw = Buffer.from(o.slice(7), "base64");
        try {
          const d = c.createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
          const out = Buffer.concat([d.update(raw.subarray(3)), d.final()]);
          // Re-encrypting must reproduce the file byte for byte, or writing
          // would corrupt what Electron stored.
          const e = c.createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
          const back = Buffer.concat([Buffer.from("v10"), e.update(out), e.final()]);
          const same = back.equals(raw);
          if (same) ok++;
          console.log("  %s %s (%d bytes, not shown)%s", same ? "OK  " : "BAD ",
            path.slice(1), out.length, same ? "" : "  ← re-encrypt differs; do NOT write this store");
        } catch (err) { console.log("  BAD  %s — %s", path.slice(1), err.message); }
      }
    })(store, "");
    console.log("\n%d of %d encrypted fields round-trip.", ok, n);
    process.exit(ok === n && n > 0 ? 0 : 1);
  });
' "$STORE"
