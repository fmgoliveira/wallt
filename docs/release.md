# Releasing Wallt

A release is a version tag `vX.Y.Z`. Everything is automated by [`.github/workflows/release.yml`](../.github/workflows/release.yml); you only merge a pull request.

## How a release happens
1. Merge work into `main` using Conventional Commits (`feat:`, `fix:`, `feat!:` for breaking changes).
2. **release-please** keeps a pull request titled `chore: release X.Y.Z` open on `main`: it updates `CHANGELOG.md`, the root `package.json` version and the app version (`apps/app/app.json`, `expo.version`). Versions are 0.x until you decide on 1.0 (breaking changes bump the minor).
3. Review and **merge that PR**. release-please tags `vX.Y.Z` and creates the GitHub Release.
4. In the same run:
   - **Server image** → `ghcr.io/<owner>/wallt:X.Y.Z` and `:latest` (linux/amd64). The version is baked in (`APP_VERSION`) and reported on `/health`.
   - **Android APK** → built with Gradle, signed with your release key, verified with `apksigner`, attached to the GitHub Release as `wallt-X.Y.Z.apk`.

To update the server: `docker compose pull && docker compose up -d` (point the image at `ghcr.io/<owner>/wallt:X.Y.Z` or `:latest`). To update the phone: download the APK from the release and install it over the old one (same signing key = in-place update).

## One-time setup (owner)
Nothing here can be done by the pipeline itself.

1. **Repository setting:** Settings → Actions → General → *Workflow permissions*: "Read and write permissions" and tick **Allow GitHub Actions to create and approve pull requests** (release-please needs it).
2. **Android signing key.** Create it once and keep a private backup (a password manager, not the repo): losing it means phones cannot update in place.
   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore wallt-release.keystore \
     -alias wallt -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 wallt-release.keystore   # (macOS: base64 -i wallt-release.keystore)
   ```
3. **Actions secrets** (Settings → Secrets and variables → Actions → New repository secret):

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | the base64 text from step 2 |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
   | `ANDROID_KEY_ALIAS` | `wallt` (the alias you chose) |
   | `ANDROID_KEY_PASSWORD` | the key password |

   The keystore and passwords never enter the repository; the workflow writes the keystore to a temporary file on the runner and Gradle signs through [`.github/android/signing.init.gradle`](../.github/android/signing.init.gradle). Without the secrets the APK job fails early with a clear message and the rest of the release still goes out.
4. **GHCR:** the first image is private to your account. For an open-source release, set the package visibility to **Public** (package page → Package settings → Danger zone), and link it to the repository so it inherits the repo permissions. Otherwise log in on the server (`docker login ghcr.io` with a token that has `read:packages`).

## In-app update notice (Android)
When the app is signed in to your server and the server reports a newer version on `/health` than the installed app, a small "Update available: vX.Y.Z" chip appears next to the sync status and opens the release page (the APK is attached there). The check runs at most every six hours and calls only your own server, never GitHub, so no token is needed in the app. The web app is served by the server and is always current.

## Notes
- Releases are cut from `main` only. CI minutes: the release jobs run only when a release PR is merged.
- First release: the manifest starts at `0.0.0`; the first `feat:` commits produce `0.1.0`.
- The Gradle + signing steps were exercised locally with a throw-away key (build succeeds, `apksigner verify` passes, 11 min cold). The APK has not been installed on a device, and the workflow itself has not run on GitHub yet: after the first release, install the APK and check that the app opens and signs in.
