# Large APK storage (up to 300 MiB)

Supabase Free has a global 50 MB object limit. Keep the private `apk-files` bucket
for small uploads and configure a private Cloudflare R2 bucket for larger APKs.

1. Create a private R2 bucket, for example `apk-store-large`, and create a bucket-scoped
   R2 API token with object read/write permissions. Never put the secret in website code.
2. Set these secrets for **both** Supabase Edge Functions `admin-upload` and
   `download-apk`: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`.
3. Set this CORS policy on the R2 bucket, replacing the origin only if the site URL changes:

   ```json
   [{"AllowedOrigins":["https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site"],"AllowedMethods":["PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]
   ```

The owner session obtains a short-lived signed PUT URL for one unique pending key.
The browser uploads directly to R2; the server checks the stored object size before
marking it uploaded. The bucket stays private. Published R2 releases download through
`download-apk`, which produces a one-hour signed GET URL.

Large uploads currently retry from the beginning after a network failure. They remain
private until package inspection and owner approval are implemented and verified.
