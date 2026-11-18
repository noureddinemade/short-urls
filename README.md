# zhr.au

A personal URL shortener hosted on GitHub Pages.

## One-time setup

1. Create a new GitHub repo and upload everything in this folder to the `main` branch. Include the hidden `.github` folder and `.gitignore`.
2. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
3. **Issues → Labels:** create a label called `new-link`.
4. **DNS for zhr.au** (at your domain registrar or DNS provider):
   - `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` records for `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
5. **Settings → Pages → Custom domain:** enter `zhr.au`. Tick **Enforce HTTPS** once it becomes available, which can take up to a day.
6. Recommended: verify `zhr.au` under your GitHub account settings (**Settings → Pages → Add a domain**). This stops anyone else from claiming the domain on GitHub.
7. **Actions → Build and deploy → Run workflow** to do the first deploy.

## Adding links

**Option A: edit `links.yml`.** You can do this on github.com or in the mobile app.

```yaml
links:
  gh:
    url: https://github.com/yourname
    title: My GitHub           # optional, overrides the copied title
    description: ...           # optional
    image: https://...         # optional
    site_name: ...             # optional
```

**Option B: open an issue** using the **New link** template. Only issues you open yourself are processed. The link is added to `links.yml`, the site rebuilds, and the issue is closed automatically. If an issue can't be processed, you get a comment explaining why.

## How the preview details work

- Each time the site builds, it visits every destination and copies its title, description, image and site name. Builds happen on every push, every 6 hours, and after adding a link through an issue.
- Any value you set in `links.yml` takes priority over the copied value.
- If a destination can't be reached, the last copy that worked is used.
- Some sites block automated requests or don't have preview tags. For those, set the details yourself.
- Social platforms cache previews. To update a link that's already been shared, use the platform's own debugger tool (e.g. Facebook's Sharing Debugger, LinkedIn's Post Inspector).

## Notes

- Paths are case-sensitive: `/GH` and `/gh` are different links.
- Visiting a link that doesn't exist shows a plain "link doesn't exist" page.
- GitHub turns off scheduled workflows after 60 days with no repo activity. If you stop adding links for a while, the 6-hourly refresh will stop. Re-enable it under **Actions**, or just push a change.
- On a free GitHub plan the repo must be public, so `links.yml` is visible to anyone.
